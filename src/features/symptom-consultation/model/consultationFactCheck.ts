import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';

export interface FactCheckIssueLike {
  content?: string;
  issue: string;
}

export interface FactCheckResultLike<TIssue extends FactCheckIssueLike> {
  hasIssues: boolean;
  issues: TIssue[];
}

export interface DiagnosisFactCheckRecordText {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  tcmFourExaminations?: string;
}

export interface RunDiagnosisFactCheckInput<
  TResult extends FactCheckResultLike<TIssue>,
  TIssue extends FactCheckIssueLike,
> {
  diagnoses: Diagnosis[];
  enabled: boolean;
  recordText: DiagnosisFactCheckRecordText;
  existingIssues: TIssue[];
  checkDiagnosis: (input: {
    diagnosis: string;
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
  }) => Promise<TResult>;
  checkTCMDiagnosis: (input: {
    diagnosis: string;
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
    tcmFourExaminations?: string;
  }) => Promise<TResult>;
  clearResults: () => void;
  setResult: (diagnosisCode: string, result: TResult) => void;
  setWidgetChecking: (totalCount: number) => void;
  setProgress: (checkedCount: number, progress: number) => void;
  setCompleted: (issues: TIssue[]) => void;
  onError?: (diagnosis: Diagnosis, error: unknown) => void;
}

export interface RunTreatmentFactCheckInput<
  TResult extends FactCheckResultLike<TIssue>,
  TIssue extends FactCheckIssueLike,
> {
  treatments: TreatmentRecommendation[];
  enabled: boolean;
  mode: 'western' | 'tcm';
  diagnosisName?: string;
  checkMedicine: (input: {
    medicineName: string;
    dosage?: string;
    diagnosis?: string;
  }) => Promise<TResult>;
  checkTCMMedicine: (input: {
    medicineName: string;
    ingredients?: string;
    usage?: string;
    diagnosis?: string;
  }) => Promise<TResult>;
  checkExamination: (input: {
    examinationName: string;
    diagnosis?: string;
  }) => Promise<TResult>;
  clearResults: () => void;
  setResult: (treatmentName: string, result: TResult) => void;
  setWidgetChecking: (totalCount: number) => void;
  setProgress: (checkedCount: number, progress: number) => void;
  setCompleted: (issues: TIssue[]) => void;
  onError?: (treatment: TreatmentRecommendation, error: unknown) => void;
}

export function deduplicateFactCheckIssues<TIssue extends FactCheckIssueLike>(
  issues: TIssue[],
): TIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.content || ''}-${issue.issue}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildDiagnosisCheckName(diagnosis: Diagnosis): string {
  if (diagnosis.isTCM && diagnosis.syndrome && diagnosis.syndrome.trim().length > 0) {
    return `${diagnosis.name}-${diagnosis.syndrome}`;
  }
  return diagnosis.name;
}

export async function runDiagnosisFactCheck<
  TResult extends FactCheckResultLike<TIssue>,
  TIssue extends FactCheckIssueLike,
>(input: RunDiagnosisFactCheckInput<TResult, TIssue>): Promise<void> {
  if (!input.diagnoses || input.diagnoses.length === 0) return;
  if (!input.enabled) return;

  input.setWidgetChecking(input.diagnoses.length);
  input.clearResults();

  const allIssues: TIssue[] = [];

  for (let i = 0; i < input.diagnoses.length; i += 1) {
    const diagnosis = input.diagnoses[i];

    try {
      const result = diagnosis.isTCM
        ? await input.checkTCMDiagnosis({
            diagnosis: buildDiagnosisCheckName(diagnosis),
            chiefComplaint: input.recordText.chiefComplaint,
            historyOfPresentIllness: input.recordText.historyOfPresentIllness,
            tcmFourExaminations: input.recordText.tcmFourExaminations,
          })
        : await input.checkDiagnosis({
            diagnosis: diagnosis.name,
            chiefComplaint: input.recordText.chiefComplaint,
            historyOfPresentIllness: input.recordText.historyOfPresentIllness,
          });

      input.setResult(diagnosis.code, result);

      if (result.hasIssues && Array.isArray(result.issues)) {
        allIssues.push(...result.issues);
      }

      input.setProgress(
        i + 1,
        Math.round(((i + 1) / input.diagnoses.length) * 100),
      );
    } catch (error) {
      input.onError?.(diagnosis, error);
    }
  }

  input.setCompleted(deduplicateFactCheckIssues([
    ...input.existingIssues,
    ...allIssues,
  ]));
}

async function checkTreatmentRecommendation<
  TResult extends FactCheckResultLike<TIssue>,
  TIssue extends FactCheckIssueLike,
>(
  treatment: TreatmentRecommendation,
  input: RunTreatmentFactCheckInput<TResult, TIssue>,
): Promise<TResult> {
  if (treatment.type === 'medicine') {
    if (input.mode === 'tcm') {
      return input.checkTCMMedicine({
        medicineName: treatment.name,
        ingredients: treatment.ingredients,
        usage: treatment.usage,
        diagnosis: input.diagnosisName,
      });
    }

    return input.checkMedicine({
      medicineName: treatment.name,
      dosage: treatment.usage,
      diagnosis: input.diagnosisName,
    });
  }

  return input.checkExamination({
    examinationName: treatment.name,
    diagnosis: input.diagnosisName,
  });
}

export async function runTreatmentFactCheck<
  TResult extends FactCheckResultLike<TIssue>,
  TIssue extends FactCheckIssueLike,
>(input: RunTreatmentFactCheckInput<TResult, TIssue>): Promise<void> {
  if (!input.treatments || input.treatments.length === 0) return;
  if (!input.enabled) return;

  input.setWidgetChecking(input.treatments.length);
  input.clearResults();

  const allIssues: TIssue[] = [];

  for (let i = 0; i < input.treatments.length; i += 1) {
    const treatment = input.treatments[i];
    try {
      const result = await checkTreatmentRecommendation(treatment, input);

      input.setResult(treatment.name, result);

      if (result.hasIssues && Array.isArray(result.issues)) {
        allIssues.push(...result.issues);
      }

      input.setProgress(
        i + 1,
        Math.round(((i + 1) / input.treatments.length) * 100),
      );
    } catch (error) {
      input.onError?.(treatment, error);
    }
  }

  input.setCompleted(deduplicateFactCheckIssues(allIssues));
}
