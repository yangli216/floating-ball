#!/usr/bin/env bash
set -euo pipefail

PWCLI="/Users/das/.codex/skills/playwright/scripts/playwright_cli.sh"
SESSION="floating-ball-audit"

capture_page() {
  local page_name="$1"
  local width="$2"
  local height="$3"
  local filename="$4"
  local wait_ms="$5"
  printf 'capture %s -> %s\n' "$page_name" "$filename"
  "$PWCLI" --session "$SESSION" run-code "async (page) => { await page.setViewportSize({width:${width},height:${height}}); await page.goto('http://127.0.0.1:1430/?page=${page_name}', {waitUntil:'domcontentloaded'}); await page.waitForTimeout(${wait_ms}); await page.screenshot({path:'output/playwright/${filename}',scale:'device',type:'png'}); return 'ok' }"
}

capture_page "medical-cache" 980 640 "18-medical-cache.png" 900
capture_page "diagnosis-path" 972 608 "19-diagnosis-path.png" 1400
capture_page "report-window" 1040 760 "20-report-window.png" 900
capture_page "force-update" 760 620 "21-force-update.png" 900
capture_page "feedback" 720 680 "22-feedback.png" 800
