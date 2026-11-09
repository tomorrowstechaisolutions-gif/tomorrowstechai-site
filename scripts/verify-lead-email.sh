#!/usr/bin/env bash
# Checks the lead-page email rules (templates, do-not-contact, draft checks).
#
#   bash scripts/verify-lead-email.sh
set -e
cd "$(dirname "$0")"
mkdir -p _libs
cp ../src/lib/leads/direct-email.ts _libs/
node --experimental-strip-types verify-lead-email.mts 2>&1 | grep -vE "ExperimentalWarning|Use .node"
