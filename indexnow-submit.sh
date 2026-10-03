#!/usr/bin/env bash
# Notify IndexNow search engines (Bing, Yandex, Seznam, Naver...) about every URL in sitemap.xml.
# Run this AFTER you deploy:   ./indexnow-submit.sh
set -euo pipefail
cd "$(dirname "$0")"

HOST="mindmap.thunderstudy.indevs.in"
KEY="7d1ed97a23bc4d0f0d9d109a3630317c"
KEY_LOCATION="https://$HOST/$KEY.txt"

# Pull every <loc> out of sitemap.xml
URLS=$(grep -o '<loc>[^<]*</loc>' sitemap.xml | sed -e 's#<loc>##' -e 's#</loc>##')
[ -n "$URLS" ] || { echo "No URLs found in sitemap.xml" >&2; exit 1; }

URL_JSON=$(printf '%s\n' "$URLS" | sed 's/.*/"&"/' | paste -sd, -)
PAYLOAD=$(printf '{"host":"%s","key":"%s","keyLocation":"%s","urlList":[%s]}' "$HOST" "$KEY" "$KEY_LOCATION" "$URL_JSON")

echo "Submitting $(printf '%s\n' "$URLS" | wc -l | tr -d ' ') URLs to IndexNow..."
HTTP=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "https://api.indexnow.org/indexnow" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data "$PAYLOAD")
echo "IndexNow responded with HTTP $HTTP (200 or 202 = accepted)"
