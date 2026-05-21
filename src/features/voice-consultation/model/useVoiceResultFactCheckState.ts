import { ref } from 'vue';
import type { FactCheckIssue, FactCheckResult } from '@/services/factChecker';
import type { TreatmentRecommendation, Diagnosis } from '@/types/consultation';

export interface VoiceResultFactCheckStateOptions {
  isEnabled: () => boolean;
  getRecordText: () => {
    chiefComplaint: string;
    historyOfPresentIllness: string;
  };
  getDiagnosisName: () => string;
  checkDiagnosis: (input: {
    diagnosis: string;
    chiefComplaint: string;
    historyOfPresentIllness: string;
  }) => Promise<FactCheckResult>;
  checkMedicine: (input: {
    medicineName: string;
    diagnosis: string;
  }) => Promise<FactCheckResult>;
  checkExamination: (input: {
    examinationName: string;
    diagnosis: string;
  }) => Promise<FactCheckResult>;
  logContext?: string;
}

function firstIssueFrom(result?: FactCheckResult): FactCheckIssue | undefined {
  if (!result?.hasIssues || result.issues.length === 0) {
    return undefined;
  }
  return result.issues[0];
}

export function useVoiceResultFactCheckState(options: VoiceResultFactCheckStateOptions) {
  const diagnosisFactChecks = ref<Map<string, FactCheckResult>>(new Map());
  const treatmentFactChecks = ref<Map<string, FactCheckResult>>(new Map());
  const logContext = options.logContext || 'VoiceResultFactCheckState';

  function getIssueForDiagnosis(diagCode: string): FactCheckIssue | undefined {
    return firstIssueFrom(diagnosisFactChecks.value.get(diagCode));
  }

  function getIssueForTreatment(treatmentName: string): FactCheckIssue | undefined {
    return firstIssueFrom(treatmentFactChecks.value.get(treatmentName));
  }

  async function performDiagnosisFactCheck(diagnoses: Diagnosis[]): Promise<void> {
    if (!diagnoses.length || !options.isEnabled()) {
      return;
    }
    diagnosisFactChecks.value.clear();

    const recordText = options.getRecordText();
    for (const diagnosis of diagnoses) {
      try {
        const result = await options.checkDiagnosis({
          diagnosis: diagnosis.name,
          chiefComplaint: recordText.chiefComplaint,
          historyOfPresentIllness: recordText.historyOfPresentIllness,
        });
        diagnosisFactChecks.value.set(diagnosis.code, result);
      } catch (error) {
        console.error(`[${logContext}] Failed to fact check diagnosis: ${diagnosis.name}`, error);
      }
    }
  }

  async function performTreatmentFactCheck(items: TreatmentRecommendation[]): Promise<void> {
    if (!items.length || !options.isEnabled()) {
      return;
    }
    treatmentFactChecks.value.clear();

    const diagnosis = options.getDiagnosisName();
    for (const treatment of items) {
      try {
        const result = treatment.type === 'medicine'
          ? await options.checkMedicine({
              medicineName: treatment.name,
              diagnosis,
            })
          : await options.checkExamination({
              examinationName: treatment.name,
              diagnosis,
            });

        treatmentFactChecks.value.set(treatment.name, result);
      } catch (error) {
        console.error(`[${logContext}] Failed to fact check treatment: ${treatment.name}`, error);
      }
    }
  }

  return {
    getIssueForDiagnosis,
    getIssueForTreatment,
    performDiagnosisFactCheck,
    performTreatmentFactCheck,
  };
}
