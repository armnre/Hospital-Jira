#!/usr/bin/env python3
"""HWDT: run Jira (config + Phase 1 backlog) then Confluence provisioning (entrypoint of the `provisioner` compose service)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import provision_confluence  # noqa: E402
import provision_jira  # noqa: E402
import provision_jira_backlog  # noqa: E402

import provision_jira_phase2  # noqa: E402

if __name__ == "__main__":
    provision_jira.main()
    provision_jira_backlog.main()
    provision_jira_phase2.main()
    provision_confluence.main()
