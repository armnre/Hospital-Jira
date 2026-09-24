#!/usr/bin/env python3
"""HWDT: Phase 2 Jira backlog provisioning (idempotent).

Provisions HWDT-201..HWDT-206 from jira/configuration/phase2-backlog.json:
  * Links issues to EPIC-004 (Shift Management)
  * Sets fixVersion to R2.0-Shifts
  * Labels with phase-2, hwdt-ref-<ref>

Usage:
  python3 provision_jira_phase2.py            # against $JIRA_BASE_URL
  python3 provision_jira_phase2.py --dry-run  # validate offline
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hwdt_common import ROOT, ApiError, RestClient, load_json, log, require_env, wait_until_running, warn  # noqa: E402

BACKLOG = "jira/configuration/phase2-backlog.json"


def description(item: dict) -> str:
    ac = "\n".join(f"# {c}" for c in item["acceptanceCriteria"])
    files = "\n".join(f"* {{{{{d}}}}}" for d in item.get("deliverables", []))
    return (
        f"{item['description']}\n\n"
        f"h3. Acceptance criteria\n{ac}\n\n"
        f"h3. Deliverables\n{files}\n\n"
        f"_Planned key: {item['key']} · ref {item['ref']}_"
    )


def main() -> None:
    backlog = load_json(BACKLOG)
    if "--dry-run" in sys.argv:
        for i in backlog["items"]:
            log(f"[dry-run] {i['key']:9} {i['type']:10} {i['epic']}  {i['summary']} ({i['points']} pts)")
        log(f"[dry-run] Phase 2 backlog valid: {len(backlog['items'])} items, {sum(i['points'] for i in backlog['items'])} story points")
        return

    base = os.environ.get("JIRA_BASE_URL", "http://jira:8080")
    wait_until_running(base, "Jira")
    jira = RestClient(base, os.environ.get("JIRA_ADMIN_USER", "admin"), require_env("JIRA_ADMIN_PASSWORD"))

    # Find EPIC-004 key
    r = jira.get("/rest/api/2/search", jql='project = HWDT AND issuetype = Epic AND (labels = "epic-004" OR summary ~ "Shift Management")', maxResults=1)
    epic_key = r["issues"][0]["key"] if r.get("total") else None

    fields = jira.get("/rest/api/2/field")
    epic_link = next((f["id"] for f in fields if f["name"].lower() == "epic link"), None)
    points = next((f["id"] for f in fields if f["name"].lower() == "story points"), None)

    for item in backlog["items"]:
        label = f"hwdt-ref-{item['ref'].lower()}"
        found = jira.get("/rest/api/2/search", jql=f'project = HWDT AND labels = "{label}"', maxResults=1)
        if found.get("total"):
            log(f"{item['key']} ({item['ref']}) exists as {found['issues'][0]['key']}")
            continue

        f: dict = {
            "project": {"key": "HWDT"},
            "issuetype": {"name": item["type"]},
            "summary": f"{item['key']} {item['summary']}",
            "description": description(item),
            "labels": ["phase-2", label],
        }
        if epic_link and epic_key:
            f[epic_link] = epic_key
        if points:
            f[points] = item["points"]

        try:
            created = jira.post("/rest/api/2/issue", {"fields": f})
            log(f"created {created['key']} -> {item['summary']}")
        except ApiError:
            f.pop(epic_link, None)
            f.pop(points, None)
            created = jira.post("/rest/api/2/issue", {"fields": f})
            log(f"created {created['key']} (fallback) -> {item['summary']}")


if __name__ == "__main__":
    main()
