#!/bin/bash
# Re-syncs sandbox/ from the current production files, re-applying the
# sandbox's safety differences: cloud sync stays disabled (placeholder
# Supabase credentials) and the service worker registration is stripped.
set -e
cd "$(dirname "$0")"

cp index.html sandbox/index.html
cp css/style.css sandbox/css/style.css
cp js/manifest.js sandbox/js/manifest.js

sed '/===== SERVICE WORKER/,$d' js/app.js > sandbox/js/app.js
cat >> sandbox/js/app.js <<'EOF'
// Service worker intentionally omitted in the sandbox to avoid stale-cache
// confusion while iterating on features.
EOF

sed \
  -e 's|^var SUPABASE_URL = ".*";|var SUPABASE_URL = "YOUR_SUPABASE_URL";|' \
  -e 's|^var SUPABASE_ANON_KEY = ".*";|var SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";|' \
  js/supabase-sync.js > sandbox/js/supabase-sync.js

echo "sandbox/ synced from production (sync disabled, service worker stripped)."
