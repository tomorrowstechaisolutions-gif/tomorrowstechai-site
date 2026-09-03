#!/usr/bin/env bash
# Renders the client action request emails to .preview/requests/ for a look.
#
#   bash scripts/preview-request-emails.sh
#
# Same trick as preview-emails.sh: Node's --experimental-strip-types needs
# explicit .ts extensions on imports, which the app's own style omits, so the
# files the templates need are copied to a scratch folder and rewritten first.
# Nothing in src/ is touched. types.ts does not come along — it is imported
# type-only and the stripper erases it.
set -e
cd "$(dirname "$0")"
# No `rm` here: the sandbox shell cannot delete files under the mount, and a
# failed delete would abort the script under `set -e`. cp overwrites anyway.
mkdir -p _libs/requests
cp ../src/lib/email/brand.ts _libs/
cp ../src/lib/requests/{config.ts,email-content.ts} _libs/requests/
sed -i 's#from "@/lib/email/brand"#from "../brand.ts"#' _libs/requests/config.ts
sed -i 's#from "@/lib/email/brand"#from "../brand.ts"#' _libs/requests/email-content.ts
sed -i 's#from "./config"#from "./config.ts"#' _libs/requests/email-content.ts
cd ..
node --experimental-strip-types scripts/preview-request-emails.mts 2>&1 | grep -vE "ExperimentalWarning|Use .node"
