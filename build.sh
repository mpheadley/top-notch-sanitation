#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Sync shared partials (nav, cookie banner) across all HTML pages
# ─────────────────────────────────────────────────────────────────────────────
# Usage: bash build.sh
#
# This script replaces the nav and cookie banner blocks in every HTML page
# with the contents of includes/nav.html and includes/cookie-banner.html.
#
# Edit the partials once, run this script, and all pages update.
# Pages still work without this script — it's a maintenance convenience.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INCLUDES_DIR="$SCRIPT_DIR/includes"

BOLD="\033[1m"
GREEN="\033[1;32m"
CYAN="\033[1;36m"
RESET="\033[0m"

# ── Verify includes exist ────────────────────────────────────────────────────
if [[ ! -d "$INCLUDES_DIR" ]]; then
  echo "Error: includes/ directory not found." >&2
  exit 1
fi

NAV_FILE="$INCLUDES_DIR/nav.html"
COOKIE_FILE="$INCLUDES_DIR/cookie-banner.html"

[[ ! -f "$NAV_FILE" ]] && echo "Error: includes/nav.html not found." >&2 && exit 1
[[ ! -f "$COOKIE_FILE" ]] && echo "Error: includes/cookie-banner.html not found." >&2 && exit 1

echo -e "${CYAN}${BOLD}Syncing partials across HTML pages…${RESET}"

# ── Helper: replace a block between two marker comments ──────────────────────
# Markers:  <!-- PARTIAL:name:START --> ... <!-- PARTIAL:name:END -->
inject_partial() {
  local file="$1"
  local name="$2"
  local partial_file="$3"

  # Check if markers exist in the file
  if ! grep -q "<!-- PARTIAL:${name}:START -->" "$file"; then
    return
  fi

  # Build the replacement: START marker + partial content + END marker
  local start_marker="<!-- PARTIAL:${name}:START -->"
  local end_marker="<!-- PARTIAL:${name}:END -->"
  local partial_content
  partial_content=$(<"$partial_file")

  # Use awk to replace everything between (and including) the markers
  # Write partial content to a temp file so awk can read it (avoids newline issues in -v)
  local tmp_partial
  tmp_partial=$(mktemp)
  printf '%s' "$partial_content" > "$tmp_partial"

  awk -v start="$start_marker" -v end="$end_marker" -v pfile="$tmp_partial" '
    $0 ~ start { print start; while ((getline line < pfile) > 0) print line; close(pfile); found=1; next }
    found && $0 ~ end { print end; found=0; next }
    !found { print }
  ' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"

  rm -f "$tmp_partial"
}

# ── Process each HTML file ───────────────────────────────────────────────────
count=0
for html_file in "$SCRIPT_DIR"/*.html; do
  [[ ! -f "$html_file" ]] && continue
  basename=$(basename "$html_file")

  # Skip 404 (no nav)
  [[ "$basename" == "404.html" ]] && continue

  inject_partial "$html_file" "nav" "$NAV_FILE"
  inject_partial "$html_file" "cookie-banner" "$COOKIE_FILE"
  count=$((count + 1))
done

echo -e "  ${GREEN}✓ Updated ${count} pages${RESET}"
echo ""
echo -e "  ${BOLD}Partials synced:${RESET}"
echo -e "    • includes/nav.html → header + mobile menu"
echo -e "    • includes/cookie-banner.html → consent banner"
echo ""
echo -e "  ${CYAN}Note:${RESET} Footer is NOT a partial — anchor text is rotated per page for SEO."
echo ""
