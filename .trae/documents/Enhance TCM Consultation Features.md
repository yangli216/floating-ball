I will implement the requested changes to improve the TCM consultation experience, focusing on medical record generation, diagnosis accuracy, and prescription editability.

### 1. Enhance Medical Record Generation (TCM Style)
I will modify `src/components/ConsultationPage.vue` to make the `generateMedicalRecord` function mode-aware.
- **TCM Logic**: When in `tcm` mode, the generated HPI (History of Present Illness) will include "Tongue" and "Pulse" information collected from the new TCM inquiry forms.
- **Formatting**:
    - Add a "TCM Signs" section (e.g., "舌脉：舌质淡红，苔薄白，脉浮") at the end of the HPI.
    - Rename "General Condition" (一般情况) to "Current Symptoms" (刻下) or similar TCM-appropriate terminology when in TCM mode.

### 2. Improve TCM Diagnosis Accuracy
I will update `src/prompts/prompts.ts` to refine the `TCMDiagnosisRecommendationPrompt`.
- **System Prompt Optimization**: strictly require the output to follow standard "Disease - Syndrome" (病名 - 证型) format.
- **Reasoning Requirement**: Emphasize "Syndrome Differentiation" (辨证) logic, requiring the AI to explicitly link symptoms/signs to the chosen syndrome.

### 3. Make Prescriptions Adjustable
I will modify the Treatment Recommendation UI in `src/components/ConsultationPage.vue`.
- **Editable Ingredients**: Change the display of `ingredients` (组成) from a static text block to an editable `textarea` or input field.
- **Interaction**: Ensure clicking the edit field does not trigger the row selection logic (`@click.stop`).
- **Styling**: Apply appropriate styles to the new input fields to match the existing UI.

### 4. Verification
- **Test Generation**: Verify that "Tongue/Pulse" appear in the HPI when TCM mode is selected.
- **Test Diagnosis**: Check if the AI returns more structured TCM diagnoses.
- **Test Editing**: Verify that I can edit the herbal ingredients and that the changes are reflected in the final report.