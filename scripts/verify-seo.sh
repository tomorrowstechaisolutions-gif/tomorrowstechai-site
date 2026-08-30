#!/usr/bin/env bash
# Runs the SEO audit parser and rule checks.
#
#   bash scripts/verify-seo.sh
#
# Same shape as verify-campaign.sh: Node's --experimental-strip-types needs
# explicit .ts extensions on imports, which the app's own TypeScript style
# omits, so the libs are copied to a scratch folder and rewritten first.
# Nothing in src/ is touched.
set -e
cd "$(dirname "$0")"
rm -rf _libs/seo && mkdir -p _libs/seo
cp ../src/lib/seo/{parse.ts,rules.ts,evaluate.ts} _libs/seo/
sed -i 's#from "./rules"#from "./rules.ts"#; s#from "./parse"#from "./parse.ts"#' _libs/seo/*.ts
node --experimental-strip-types verify-seo.mts 2>&1 | grep -vE "ExperimentalWarning|Use .node"
