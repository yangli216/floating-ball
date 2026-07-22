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

capture_page "settings" 1100 780 "03-settings-keyboard-shortcuts.png" 900
capture_page "risk-alert" 378 449 "05-risk-alert.png" 500
capture_page "voice-capsule" 360 80 "06-voice-capsule.png" 800
capture_page "reception-capsule" 280 200 "07-reception-capsule.png" 500
capture_page "chronic-refill" 820 720 "08-chronic-refill.png" 1800
capture_page "clinical-result" 1080 720 "09-clinical-result.png" 1800
capture_page "treatment-plan" 1080 720 "10-treatment-plan.png" 1800
capture_page "outpatient-follow-up" 1280 760 "11-outpatient-follow-up.png" 1800
capture_page "report-workspace" 1280 760 "12-report-workspace.png" 1800
capture_page "patient-memory" 1120 760 "13-patient-memory.png" 800
capture_page "inpatient-emr" 1120 760 "14-inpatient-emr.png" 1200
capture_page "differential-diagnosis" 360 640 "15-differential-diagnosis.png" 600
capture_page "knowledge-base" 378 449 "16-knowledge-base.png" 800
capture_page "his-log" 980 640 "17-his-log.png" 900
capture_page "medical-cache" 980 640 "18-medical-cache.png" 900
capture_page "diagnosis-path" 972 608 "19-diagnosis-path.png" 1400
capture_page "report-window" 1040 760 "20-report-window.png" 900
capture_page "force-update" 760 620 "21-force-update.png" 900
capture_page "feedback" 720 680 "22-feedback.png" 800
