#!/usr/bin/env bash
# Runs the pipeline forecast and attention checks.
#
#   bash scripts/verify-pipeline.sh
#
# Same shape as verify-seo.sh: Node's --experimental-strip-types needs
# explicit .ts extensions on imports, which the app's own TypeScript style
# omits, so the libs are copied to a scratch folder and rewritten first.
# Nothing in src/ is touched.
set -e
cd "$(dirname "$0")"
rm -rf _libs/pipeline && mkdir -p _libs/pipeline
cp ../src/lib/pipeline/{forecast.ts,attention.ts} _libs/pipeline/
sed -i 's#from "./forecast"#from "./forecast.ts"#' _libs/pipeline/*.ts
# These libs are server-only in the app. The marker package throws outside a
# React server context, so it is stripped from the scratch copy — the logic
# under test does not depend on it.
sed -i '/^import "server-only";$/d' _libs/pipeline/*.ts
node --experimental-strip-types verify-pipeline.mts 2>&1 | grep -vE "ExperimentalWarning|Use .node"
