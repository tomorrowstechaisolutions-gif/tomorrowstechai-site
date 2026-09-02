#!/usr/bin/env bash
# Renders the proposal emails to .preview/emails/ for a look.
#
#   bash scripts/preview-emails.sh
#
# Node's --experimental-strip-types needs explicit .ts extensions on imports,
# which the app's own TypeScript style omits, so the three files the templates
# actually need are copied to a scratch folder and rewritten first. Nothing in
# src/ is touched. Type-only imports are erased by the stripper, which is why
# config.ts and types.ts do not need to come along.
set -e
cd "$(dirname "$0")"
rm -rf _libs/email && mkdir -p _libs/email
cp ../src/lib/email/brand.ts _libs/
cp ../src/lib/proposals/{pricing.ts,email-content.ts} _libs/
sed -i 's#from "./pricing"#from "./pricing.ts"#' _libs/email-content.ts
sed -i 's#from "@/lib/email/brand"#from "./brand.ts"#' _libs/email-content.ts
cd ..
node --experimental-strip-types scripts/preview-emails.mts 2>&1 | grep -vE "ExperimentalWarning|Use .node"
