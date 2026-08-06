# 慢病复诊配药四步界面 Design QA

- Source visual truth: `/var/folders/35/4z0sm8cs2j79r4rv6hcdl7kc0000gn/T/codex-clipboard-e0d0aa18-6baf-4d11-8d29-74c04a094cb2.png`
- Implementation screenshot: `/Users/das/SourceCode/regional-ai-workspace/pcie/output/playwright/reception-accordion-2-3-swapped.png`
- Browser viewport: `404 × 712` CSS px
- Component viewport: `404 × 712` CSS px
- Implementation pixels: `404 × 712`
- State: high blood pressure candidate; section 2 expanded; historical medication reference present; sections 1, 3, and 4 collapsed.

## Full-view comparison evidence

The source image records the pre-change order. The requested swap is reflected in the final implementation capture as `1 就诊历史信息 → 2 慢病复诊配药 → 3 AI 推荐 → 4 临床诊疗建议`.

The warm-white narrow panel, patient header, blue numbered accordion hierarchy, purple chronic-disease action language, sticky three-button footer, robot asset, and rounded content card remain visually consistent. The swapped sections fit within the `404 × 712` frame without clipping or obscuring the persistent footer.

## Focused region comparison evidence

The step 2/3 region is readable at native implementation size in the final capture, so a separate crop was not needed. The expanded step 2 shows:

- specific historical diagnoses instead of a generalized disease group;
- historical-medication availability without exposing visit-count statistics;
- an existing purple chronic-action card treatment with a pill-library icon;
- a visible doctor-confirmation badge without an additional explanatory line below the action card;
- the former clinical recommendation step preserved as number 4.

## Required fidelity surfaces

- Fonts and typography: retained the existing system Chinese font stack and current 15 px section-title / 12 px card-title hierarchy. Long diagnosis and medication text truncates in one line instead of changing panel width.
- Spacing and layout rhythm: accordion headers retain the existing 72 px rhythm; the refill card uses the same 76 px minimum height and 10 px radius as the clinical pathway cards. The footer remains fully visible.
- Colors and visual tokens: blue step numbers, lavender action surface, purple icon/chevron, orange pending badge, warm-white shell, and slate supporting text remain aligned with the current chronic-disease UI.
- Image quality and asset fidelity: the existing patient avatar and `medical-ai-robot.png` are reused at native quality. No new raster placeholder, handcrafted SVG, CSS illustration, or emoji was introduced. Icons come from the project's existing Iconify collections.
- Copy and content: “慢病复诊配药” and “待确认” communicate the task and action state without exposing implementation or design-boundary explanations. Specific diagnosis names and historical medication names remain visible.
- Accessibility and behavior: all accordion and action controls remain native buttons with focus-visible styling, `aria-expanded`, loading disablement, and `aria-busy`. The empty state uses `role=status`.

## Interaction and browser evidence

- Confirmed the accessible-name order is `1 就诊历史信息`, `2 慢病复诊配药`, `3 AI 推荐`, `4 临床诊疗建议`.
- Opened section 2 from the four-step accordion and verified that it displays the chronic-refill action card.
- Opened section 3 and observed the AI recommendation request path run under the new number; the isolated audit harness showed the expected actionable “HIS 尚未连接” state.
- Verified the action card is exactly `76 px` high, its panel is also `76 px` high, and it has no explanatory sibling below it.
- Confirmed the refill card is uniquely reachable by its accessible name.
- Verified the browser snapshot reported no console errors during the swap check.

## Comparison history

### Pass 1

- P0/P1/P2 findings: none.
- Adjustment before final capture: the new card surface was kept as a solid lavender chronic-disease surface while preserving the existing border, icon, badge, spacing, and hover language.
- Post-adjustment evidence: `reception-chronic-refill-step-final.png` and `reception-chronic-refill-comparison-final.png`.

### Pass 2

- P0/P1/P2 findings: none.
- Adjustment from product feedback: removed the standalone explanatory line below the refill card while retaining the necessary “待确认” action state.
- Post-adjustment evidence: `reception-chronic-refill-step-no-helper.png`.

### Pass 3

- P0/P1/P2 findings: none.
- Adjustment from product feedback: swapped accordion sections 2 and 3, and moved the AI lazy-load trigger to section 3.
- Post-adjustment evidence: `reception-accordion-2-3-swapped.png` and the corresponding Playwright accessibility snapshots.

## Findings

No actionable P0, P1, or P2 differences remain for the requested section 2/3 swap.

## Follow-up polish

- P3: recheck text antialiasing and focus-ring appearance on the target Windows HIS device at its actual DPI.

final result: passed
