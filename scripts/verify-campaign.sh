#!/usr/bin/env bash
# Runs the campaign scoring / metrics / date-range checks.
#
#   bash scripts/verify-campaign.sh
#
# Node's --experimental-strip-types needs explicit .ts extensions on imports,
# which the app's own TypeScript style omits, so the libs are copied to a
# scratch folder and rewritten first. Nothing in src/ is touched.
set -e
cd "$(dirname "$0")"
rm -rf _libs && mkdir -p _libs
cp ../src/lib/campaign/{config.ts,scoring.ts,metrics.ts,range.ts} _libs/
sed -i 's#from "./config"#from "./config.ts"#' _libs/scoring.ts
node --experimental-strip-types verify-campaign.mts 2>&1 | grep -vE "ExperimentalWarning|Use .node"
