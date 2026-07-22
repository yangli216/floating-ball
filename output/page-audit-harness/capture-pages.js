async (page) => {
  const pages = [
    ['floating-ball', 160, 160, '01-floating-ball-code.png', 250],
    ['settings', 1100, 780, '03-settings-keyboard-shortcuts.png', 900],
    ['consultation', 1120, 760, '04-consultation.png', 1800],
    ['risk-alert', 378, 449, '05-risk-alert.png', 500],
    ['voice-capsule', 360, 80, '06-voice-capsule.png', 800],
    ['reception-capsule', 280, 200, '07-reception-capsule.png', 500],
    ['chronic-refill', 820, 720, '08-chronic-refill.png', 1800],
    ['clinical-result', 1080, 720, '09-clinical-result.png', 1800],
    ['treatment-plan', 1080, 720, '10-treatment-plan.png', 1800],
    ['outpatient-follow-up', 1280, 760, '11-outpatient-follow-up.png', 1800],
    ['report-workspace', 1280, 760, '12-report-workspace.png', 1800],
    ['patient-memory', 1120, 760, '13-patient-memory.png', 800],
    ['inpatient-emr', 1120, 760, '14-inpatient-emr.png', 1200],
    ['differential-diagnosis', 360, 640, '15-differential-diagnosis.png', 600],
    ['knowledge-base', 378, 449, '16-knowledge-base.png', 800],
    ['his-log', 980, 640, '17-his-log.png', 900],
    ['medical-cache', 980, 640, '18-medical-cache.png', 900],
    ['diagnosis-path', 972, 608, '19-diagnosis-path.png', 1400],
    ['report-window', 1040, 760, '20-report-window.png', 900],
    ['force-update', 760, 620, '21-force-update.png', 900],
    ['feedback', 720, 680, '22-feedback.png', 800],
  ];

  const results = [];
  for (const [name, width, height, filename, waitMs] of pages) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:1430/?page=${name}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(waitMs);
    await page.screenshot({
      path: `output/playwright/${filename}`,
      scale: 'device',
      type: 'png',
    });
    results.push({ name, width, height, filename });
  }
  return results;
}
