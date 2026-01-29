I will implement the TCM (Traditional Chinese Medicine) consultation mode with the following steps:

1.  **Update Prompts (`src/prompts/prompts.ts`)**:
    *   Add `TCMDiagnosisRecommendationPrompt`: Specialized for TCM pattern differentiation (e.g., "Wind-Cold attacking the Lungs").
    *   Add `TCMTreatmentRecommendationPrompt`: Specialized for herbal prescriptions (Fangji) and treatment principles.

2.  **Enhance Consultation UI (`src/components/ConsultationPage.vue`)**:
    *   **Add Mode Switch**: Insert a "Western / TCM" toggle button in the header.
    *   **Add TCM Inputs**: Create a `tcmInquiryConfig` to capture specific TCM signs:
        *   **Tongue (舌象)**: Tongue body color, coating.
        *   **Pulse (脉象)**: Floating, sinking, rapid, slow, etc.
    *   **Dynamic Logic**:
        *   When in TCM mode, display the "TCM Signs" input section.
        *   Switch `fetchAIDiagnosis` to use the TCM prompt.
        *   Switch `fetchTreatmentRecommendation` to use the TCM prescription prompt.

3.  **Adapt Result Display**:
    *   Modify the result view to support TCM data structures (e.g., displaying herbal ingredients instead of western medicine specs).
    *   Update the "Final Report" to follow a standard TCM medical record format (Diagnosis -> Pattern -> Treatment Principle -> Prescription).

This approach ensures a seamless integration with the existing workflow while respecting the distinct logic of TCM.