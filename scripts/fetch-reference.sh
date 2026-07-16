#!/usr/bin/env bash
# Capture rendered HTML + media assets from the live WordPress site (fault.foundation)
# for the Next.js 1:1 replica. HTML goes to reference/ (gitignored, used to transcribe
# WP's inline CSS); images go to public/wp-content/uploads/ (same paths as WP).
set -euo pipefail

cd "$(dirname "$0")/.."

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
BASE="https://fault.foundation"

fetch() { # fetch <url> <outfile> [--allow-fail]
  local url="$1" out="$2"
  mkdir -p "$(dirname "$out")"
  if curl -fsSL -A "$UA" --max-time 60 -o "$out" "$url"; then
    echo "ok   $url -> $out"
  else
    echo "FAIL $url" >&2
    [ "${3:-}" = "--allow-fail" ] || exit 1
  fi
}

# ---- Rendered HTML of every route (+ the 404 template) ----
mkdir -p reference
declare -a PAGES=(
  "/:home"
  "/about/:about"
  "/news/:news"
  "/policies/:policies"
  "/bylaws/:bylaws"
  "/disciplinary-policy/:disciplinary-policy"
  "/privacy-policy/:privacy-policy"
  "/roadmap/:roadmap"
  "/overfault-rulebook/:overfault-rulebook"
  "/2025/11/the-fault-foundation-who-we-are-and-whats-next/:post-who-we-are"
  "/2025/12/discord-and-sharing-personal-information/:post-discord-personal-info"
  "/2026/01/community-verification/:post-community-verification"
  "/author/admin_saivw2jq/:author-oscar"
  "/tag/discussion/:tag-discussion"
  "/tag/future/:tag-future"
  "/tag/news/:tag-news"
  "/tag/update/:tag-update"
)
for entry in "${PAGES[@]}"; do
  path="${entry%%:*}"; name="${entry##*:}"
  fetch "$BASE$path" "reference/$name.html"
done
# 404 page (curl -f would bail on the 404 status; fetch without -f)
mkdir -p reference
curl -sSL -A "$UA" --max-time 60 -o "reference/404.html" "$BASE/this-page-does-not-exist-404-check/" || true
echo "ok   404 template -> reference/404.html"

# ---- Media assets (same /wp-content/uploads/ paths as WP) ----
declare -a ASSETS=(
  "/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png"
  "/wp-content/uploads/2025/10/White-black-border-1024x713.png"
  "/wp-content/uploads/2025/10/Blue-white-border-1-scaled.png"
  "/wp-content/uploads/2025/11/Oscar-Headshot.jpg-768x1024.jpg"
  "/wp-content/uploads/2025/11/Wes-Headshot-474x1024.jpg"
  "/wp-content/uploads/2025/11/Ryan-Headshot-768x1024.jpg"
  "/wp-content/uploads/2025/11/IMG_1875-1024x768.jpg"
  "/wp-content/uploads/2025/11/IMG_1875-scaled.jpg"
  "/wp-content/uploads/2025/12/Discord-and-Sharing-Personal-Information.png"
  "/wp-content/uploads/2025/12/Gemini_Generated_Image_gzzos4gzzos4gzzo.png"
  "/wp-content/uploads/2026/01/Community-Verification.png"
)
for path in "${ASSETS[@]}"; do
  fetch "$BASE$path" "public$path" --allow-fail
done

echo "Done."
