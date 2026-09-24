#!/usr/bin/env python3
"""HWDT: Phase 1 Jira backlog provisioning (idempotent).

Creates every item in jira/configuration/phase1-backlog.json as a Jira issue in project HWDT:
  * issue type (Story / Task / Infrastructure Task), summary, description with acceptance criteria
  * Epic Link to EPIC-002 / EPIC-003 / EPIC-001 (found via label epic-00x set by provision_jira.py)
  * labels phase-1, hwdt-ref-<ref>; Module custom field; Story Points (if the field exists); fixVersion R1.0-MVP
  * transitions to DONE when the item status is DONE (walks the imported workflow)
Prints planned key vs actual key and writes the mapping to $HWDT_OUTPUT_DIR/phase1-key-map.json.

Usage:
  python3 provision_jira_backlog.py            # against $JIRA_BASE_URL
  python3 provision_jira_backlog.py --dry-run  # validate the backlog file offline
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hwdt_common import ROOT, ApiError, RestClient, load_json, log, require_env, wait_until_running, warn  # noqa: E402

BACKLOG = "jira/configuration/phase1-backlog.json"


def description(item: dict) -> str:
    ac = "\n".join(f"# {c}" for c in item["acceptanceCriteria"])
    files = "\n".join(f"* {{{{{d}}}}}" for d in item.get("deliverables", []))
    return f"{item['description']}\n\nh3. Acceptance criteria\n{ac}\n\nh3. Deliverables\n{files}\n\n_Planned key: {item['key']} · ref {item['ref']}_"


def validate(backlog: dict) -> None:
    keys = [i["key"] for i in backlog["items"]]
    assert len(keys) == len(set(keys)), "duplicate keys"
    nums = [int(k.split("-")[1]) for k in keys]
    assert nums == list(range(9, 9 + len(nums))), "keys must be consecutive from HWDT-9"
    epics = {e["ref"] for e in backlog["epics"]} | {"EPIC-001"}
    for i in backlog["items"]:
        assert i["epic"] in epics, f"{i['key']}: unknown epic {i['epic']}"
        assert i["acceptanceCriteria"], f"{i['key']}: no acceptance criteria"
    required = {"Employee CRUD", "Employee Profile UI", "Department Management", "Skill Management", "Credential CRUD", "Credential Verification", "Expiry Detection", "Compliance Dashboard"}
    missing = required - {i["summary"] for i in backlog["items"]}
    assert not missing, f"missing required stories: {missing}"


def field_id(fields: list[dict], name: str) -> str | None:
    return next((f["id"] for f in fields if f["name"].lower() == name.lower()), None)


def transition_to_done(jira: RestClient, key: str, target: str = "DONE", max_steps: int = 12) -> str:
    status = ""
    for _ in range(max_steps):
        issue = jira.get(f"/rest/api/2/issue/{key}", fields="status")
        status = issue["fields"]["status"]["name"]
        if status.upper() in (target, "CLOSED"):
            return status
        transitions = jira.get(f"/rest/api/2/issue/{key}/transitions")["transitions"]
        forward = [t for t in transitions if t["to"]["name"].upper() == target] or [
            t for t in transitions if t["name"] not in ("Return to Backlog", "Needs Clarification", "Changes Requested", "QA Failed", "UAT Rejected", "Reopen")
        ]
        if not forward:
            break
        jira.post(f"/rest/api/2/issue/{key}/transitions", {"transition": {"id": forward[0]["id"]}})
    return status


def main() -> None:
    backlog = load_json(BACKLOG)
    validate(backlog)
    if "--dry-run" in sys.argv:
        for i in backlog["items"]:
            log(f"[dry-run] {i['key']:8} {i['type']:20} {i['epic']}  {i['summary']} ({i['points']} pts, {len(i['acceptanceCriteria'])} AC)")
        log(f"[dry-run] {len(backlog['items'])} items valid, {sum(i['points'] for i in backlog['items'])} story points")
        return

    base = os.environ.get("JIRA_BASE_URL", "http://jira:8080")
    wait_until_running(base, "Jira")
    jira = RestClient(base, os.environ.get("JIRA_ADMIN_USER", "admin"), require_env("JIRA_ADMIN_PASSWORD"))
    fields = jira.get("/rest/api/2/field")
    epic_link, points, module = field_id(fields, "Epic Link"), field_id(fields, "Story Points"), field_id(fields, "Module")

    epic_keys: dict[str, str] = {}
    for ref in {i["epic"] for i in backlog["items"]}:
        r = jira.get("/rest/api/2/search", jql=f'project = HWDT AND issuetype = Epic AND labels = "{ref.lower()}"', maxResults=1)
        if r.get("total"):
            epic_keys[ref] = r["issues"][0]["key"]
        else:
            warn(f"epic {ref} not found; run provision_jira.py first")

    mapping = {}
    for item in backlog["items"]:
        label = f"hwdt-ref-{item['ref'].lower()}"
        found = jira.get("/rest/api/2/search", jql=f'project = HWDT AND labels = "{label}"', maxResults=1)
        if found.get("total"):
            key = found["issues"][0]["key"]
            log(f"{item['ref']} exists as {key}")
        else:
            f: dict = {
                "project": {"key": "HWDT"},
                "issuetype": {"name": item["type"]},
                "summary": item["summary"],
                "description": description(item),
                "labels": ["phase-1", label],
                "fixVersions": [{"name": backlog["release"]}],
            }
            if epic_link and item["epic"] in epic_keys:
                f[epic_link] = epic_keys[item["epic"]]
            if points and item["type"] == "Story":
                f[points] = item["points"]
            if module:
                f[module] = {"value": item["module"]}
            try:
                key = jira.post("/rest/api/2/issue", {"fields": f})["key"]
            except ApiError as e:
                warn(f"{item['ref']}: retrying without optional fields ({e.status})")
                for opt in (points, module, "fixVersions"):
                    if opt:
                        f.pop(opt, None)
                key = jira.post("/rest/api/2/issue", {"fields": f})["key"]
            log(f"created {key} ({item['type']}) {item['summary']}")
        if item.get("status") == "DONE":
            log(f"  {key} status: {transition_to_done(jira, key)}")
        mapping[item["key"]] = key
        if key != item["key"]:
            warn(f"  planned {item['key']} but Jira assigned {key}; see phase1-key-map.json for commit traceability")

    out = Path(os.environ.get("HWDT_OUTPUT_DIR", "/tmp")) / "phase1-key-map.json"
    out.write_text(json.dumps(mapping, indent=2))
    log(f"Phase 1 backlog provisioned ({len(mapping)} items); key map -> {out}")


if __name__ == "__main__":
    main()
