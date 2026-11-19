#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
# Starts deploy-tenant unless one is already queued. A queued run checks out main when it starts, so it
# carries this caller's commit (callers push before dispatching). A run that is only in progress may have
# checked out earlier, so it does not count. Without this guard every loop that commits dispatches a deploy,
# and GitHub cancels all but the newest queued run (16 cancelled runs on 2026-11-18, none lost).
set -euo pipefail
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
queued=$(gh api "repos/$repo/actions/workflows/deploy-tenant.yml/runs?status=queued&per_page=1" --jq '.total_count')
if [ "$queued" -gt 0 ]; then echo "deploy-tenant already queued; it will deploy current main"; exit 0; fi
gh workflow run deploy-tenant.yml -R "$repo" --ref main
