"""HWDT provisioning helpers — standard library only (runs in python:3.12-alpine)."""
from __future__ import annotations

import base64
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(os.environ.get("HWDT_ROOT", Path(__file__).resolve().parents[2]))


def log(msg: str) -> None:
    print(f"[hwdt-provision] {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {msg}", flush=True)


def warn(msg: str) -> None:
    log(f"WARN: {msg}")


class ApiError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


class RestClient:
    def __init__(self, base_url: str, user: str, password: str):
        self.base = base_url.rstrip("/")
        token = base64.b64encode(f"{user}:{password}".encode()).decode()
        self.headers = {
            "Authorization": f"Basic {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Atlassian-Token": "no-check",
        }

    def request(self, method: str, path: str, body: Any | None = None, params: dict | None = None) -> Any:
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers=self.headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode() or "null"
                return json.loads(raw) if raw.strip().startswith(("{", "[", "null")) else raw
        except urllib.error.HTTPError as e:
            raise ApiError(e.code, e.read().decode(errors="replace")) from None

    def get(self, path: str, **params: Any) -> Any:
        return self.request("GET", path, params=params or None)

    def post(self, path: str, body: Any) -> Any:
        return self.request("POST", path, body)

    def put(self, path: str, body: Any) -> Any:
        return self.request("PUT", path, body)


def wait_until_running(base_url: str, name: str, timeout: int = 900) -> None:
    """Poll <base>/status until {"state":"RUNNING"}."""
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base_url.rstrip("/") + "/status", timeout=10) as r:
                last = r.read().decode()
                if "RUNNING" in last:
                    log(f"{name} is RUNNING")
                    return
                if "FIRST_RUN" in last:
                    raise SystemExit(
                        f"{name} is in FIRST_RUN state: complete the setup wizard (licence + admin user) "
                        f"at http://{name.lower()}.local, then re-run the provisioner."
                    )
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = str(e)
        log(f"waiting for {name} ({last[:80]})")
        time.sleep(10)
    raise SystemExit(f"{name} did not become RUNNING within {timeout}s")


def require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value or value.startswith("change_me"):
        sys.exit(f"Environment variable {name} is not set (see .env)")
    return value


def load_json(rel: str) -> dict:
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


# --------------------------------------------------------------------------
# Minimal Markdown -> Confluence storage format converter
# Supports: headings, paragraphs, bullet/numbered lists, fenced code (code macro),
# tables, blockquotes (info macro), **bold**, *italic*, `code`, [links](url), hr.
# --------------------------------------------------------------------------
def _inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def markdown_to_storage(md: str) -> str:
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("```"):
            lang = stripped[3:].strip() or "none"
            buf = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            code = "\n".join(buf).replace("]]>", "]]]]><![CDATA[>")
            out.append(
                '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">'
                f"{html.escape(lang)}</ac:parameter><ac:plain-text-body><![CDATA[{code}]]>"
                "</ac:plain-text-body></ac:structured-macro>"
            )
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            out.append(f"<h{level}>{_inline(m.group(2))}</h{level}>")
            i += 1
            continue
        if re.match(r"^(-{3,}|\*{3,})$", stripped):
            out.append("<hr/>")
            i += 1
            continue
        if stripped.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip())
                i += 1
            cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
            cells = [r for r in cells if not all(re.match(r"^:?-{2,}:?$", c) for c in r)]
            if cells:
                t = ["<table><tbody>"]
                t.append("<tr>" + "".join(f"<th>{_inline(c)}</th>" for c in cells[0]) + "</tr>")
                for r in cells[1:]:
                    t.append("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>")
                t.append("</tbody></table>")
                out.append("".join(t))
            continue
        if re.match(r"^([-*])\s+", stripped) or re.match(r"^\d+\.\s+", stripped):
            ordered = bool(re.match(r"^\d+\.\s+", stripped))
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines):
                s = lines[i].strip()
                mm = re.match(r"^\d+\.\s+(.*)$", s) if ordered else re.match(r"^[-*]\s+(.*)$", s)
                if not mm:
                    break
                items.append(f"<li>{_inline(mm.group(1))}</li>")
                i += 1
            out.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue
        if stripped.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            out.append(
                '<ac:structured-macro ac:name="info"><ac:rich-text-body>'
                f"<p>{_inline(' '.join(buf))}</p></ac:rich-text-body></ac:structured-macro>"
            )
            continue
        if not stripped:
            i += 1
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|```|\||[-*]\s|\d+\.\s|>)", lines[i].strip()):
            buf.append(lines[i].strip())
            i += 1
        out.append(f"<p>{_inline(' '.join(buf))}</p>")
    return "\n".join(out)
