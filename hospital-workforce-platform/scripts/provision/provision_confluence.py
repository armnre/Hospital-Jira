#!/usr/bin/env python3
"""HWDT — Confluence provisioning (idempotent).

Creates the space "Hospital Workforce Digital Twin Documentation" (key HWDT) and the 8
documentation pages, whose bodies are generated from docs/*.md (single source of truth).

Usage:
  python3 provision_confluence.py            # provision against $CONFLUENCE_BASE_URL
  python3 provision_confluence.py --dry-run  # convert pages offline and print a summary
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hwdt_common import ROOT, ApiError, RestClient, load_json, log, markdown_to_storage, require_env, wait_until_running  # noqa: E402

CONFIG = "confluence/configuration/space.json"


def build_pages(cfg: dict) -> list[dict]:
    pages = []
    for p in sorted(cfg["pages"], key=lambda x: x["order"]):
        md = (ROOT / p["source"]).read_text(encoding="utf-8")
        pages.append({**p, "storage": markdown_to_storage(md)})
    return pages


def ensure_space(c: RestClient, space: dict) -> dict:
    try:
        s = c.get(f"/rest/api/space/{space['key']}", expand="homepage")
        log(f"space {space['key']} exists")
    except ApiError as e:
        if e.status != 404:
            raise
        c.post("/rest/api/space", {
            "key": space["key"], "name": space["name"],
            "description": {"plain": {"value": space["description"], "representation": "plain"}},
        })
        s = c.get(f"/rest/api/space/{space['key']}", expand="homepage")
        log(f"created space {space['key']} — {space['name']}")
    return s


def upsert_page(c: RestClient, space_key: str, parent_id: str | None, title: str, storage: str, labels: list[str]) -> str:
    found = c.get("/rest/api/content", spaceKey=space_key, title=title, expand="version")
    body = {"storage": {"value": storage, "representation": "storage"}}
    if found.get("results"):
        page = found["results"][0]
        c.put(f"/rest/api/content/{page['id']}", {
            "id": page["id"], "type": "page", "title": title, "space": {"key": space_key},
            "version": {"number": page["version"]["number"] + 1, "message": "HWDT provisioner sync"},
            "body": body,
        })
        log(f"updated page '{title}' (id={page['id']})")
        page_id = page["id"]
    else:
        payload = {"type": "page", "title": title, "space": {"key": space_key}, "body": body}
        if parent_id:
            payload["ancestors"] = [{"id": parent_id}]
        page_id = c.post("/rest/api/content", payload)["id"]
        log(f"created page '{title}' (id={page_id})")
    try:
        c.post(f"/rest/api/content/{page_id}/label", [{"prefix": "global", "name": l} for l in labels])
    except ApiError:
        pass
    return page_id


def main() -> None:
    cfg = load_json(CONFIG)
    pages = build_pages(cfg)
    if "--dry-run" in sys.argv:
        for p in pages:
            log(f"[dry-run] {p['order']}. {p['title']} <- {p['source']} ({len(p['storage'])} chars storage format)")
        return

    base = os.environ.get("CONFLUENCE_BASE_URL", "http://confluence:8090")
    wait_until_running(base, "Confluence")
    c = RestClient(base, os.environ.get("CONFLUENCE_ADMIN_USER", "admin"), require_env("CONFLUENCE_ADMIN_PASSWORD"))

    space = ensure_space(c, cfg["space"])
    home_id = (space.get("homepage") or {}).get("id")
    for p in pages:
        upsert_page(c, cfg["space"]["key"], home_id, p["title"], p["storage"], cfg.get("labels", []))
    log(f"Confluence provisioning finished: {len(pages)} pages in space {cfg['space']['key']}")


if __name__ == "__main__":
    main()
