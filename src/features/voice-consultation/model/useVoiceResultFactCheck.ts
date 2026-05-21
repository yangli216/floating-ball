import { ref } from 'vue';
import {
  checkDiagnosis,
  checkExamination,
  checkMedicalRecord,
  checkMedicine,
  isReviewerEnabled,
  type FactCheckIssue,
  type FactCheckResult,
} from '@/services/factChecker';
import { trackError } from '@/services/operationTracker';
import type { GeneratedRecord } from '@/types/voiceResult';

export function useVoiceResultFactCheck() {
  const showFactCheckNotification = ref(false);
  const factCheckResult = ref<FactCheckResult | null>(null);
  const diagnosisFactChecks = ref<Map<string, FactCheckResult>>(new Map());
  const medicineFactChecks = ref<Map<string, FactCheckResult>>(new Map());
  const examFactChecks = ref<Map<string, FactCheckResult>>(new Map());
  const showFactCheckWidget = ref(false);
  const factCheckWidgetStatus = ref<'idle' | 'checking' | 'completed'>('idle');
  const factCheckWidgetIssues = ref<FactCheckIssue[]>([]);
  const factCheckProgress = ref(0);
  const factCheckCheckedCount = ref(0);
  const factCheckTotalCount = ref(0);

  async function performMedicalRecordFactCheck(rec: GeneratedRecord): Promise<void> {
    if (!rec || !isReviewerEnabled()) return;

    const diagCount = rec.diagnosisList?.length || 0;
    const medCount = rec.medications?.length || 0;
    const examCount = rec.examinations?.length || 0;
    const totalChecks = diagCount + medCount + examCount + 1;

    showFactCheckWidget.value = true;
    factCheckWidgetStatus.value = 'checking';
    factCheckTotalCount.value = totalChecks;
    factCheckCheckedCount.value = 0;
    factCheckProgress.value = 0;
    factCheckWidgetIssues.value = [];
    diagnosisFactChecks.value = new Map();
    medicineFactChecks.value = new Map();
    examFactChecks.value = new Map();

    try {
      const result = await checkMedicalRecord({
        chiefComplaint: rec.chiefComplaint,
        historyOfPresentIllness: rec.historyOfPresentIllness,
        diagnoses: rec.diagnosisList?.map(diagnosis => diagnosis.name) || [],
        medicines: rec.medications?.map(medicine => medicine.name) || [],
        examinations: rec.examinations?.map(examination => examination.name) || [],
      });

      if (result.hasIssues) {
        factCheckWidgetIssues.value.push(...result.issues);
      }

      factCheckCheckedCount.value = 1;
      factCheckProgress.value = Math.round((1 / totalChecks) * 100);

      for (let index = 0; index < diagCount; index += 1) {
        const diagnosis = rec.diagnosisList[index];
        const diagnosisResult = await checkDiagnosis({
          diagnosis: diagnosis.name,
          chiefComplaint: rec.chiefComplaint,
          historyOfPresentIllness: rec.historyOfPresentIllness,
        });
        diagnosisFactChecks.value.set(diagnosis.name, diagnosisResult);

        if (diagnosisResult.hasIssues) {
          factCheckWidgetIssues.value.push(...diagnosisResult.issues);
        }

        const currentCount = 1 + index + 1;
        factCheckCheckedCount.value = currentCount;
        factCheckProgress.value = Math.round((currentCount / totalChecks) * 100);
      }

      for (let index = 0; index < medCount; index += 1) {
        const medicine = rec.medications[index];
        const medicineResult = await checkMedicine({
          medicineName: medicine.name,
          specification: medicine.spec,
          dosage: medicine.dosage,
          frequency: medicine.frequency,
          diagnosis: rec.diagnosisList?.[0]?.name,
        });
        medicineFactChecks.value.set(medicine.name, medicineResult);

        if (medicineResult.hasIssues) {
          factCheckWidgetIssues.value.push(...medicineResult.issues);
        }

        const currentCount = 1 + diagCount + index + 1;
        factCheckCheckedCount.value = currentCount;
        factCheckProgress.value = Math.round((currentCount / totalChecks) * 100);
      }

      for (let index = 0; index < examCount; index += 1) {
        const examination = rec.examinations[index];
        const examinationResult = await checkExamination({
          examinationName: examination.name,
          diagnosis: rec.diagnosisList?.[0]?.name,
        });
        examFactChecks.value.set(examination.name, examinationResult);

        if (examinationResult.hasIssues) {
          factCheckWidgetIssues.value.push(...examinationResult.issues);
        }

        const currentCount = 1 + diagCount + medCount + index + 1;
        factCheckCheckedCount.value = currentCount;
        factCheckProgress.value = Math.round((currentCount / totalChecks) * 100);
      }

      factCheckWidgetStatus.value = 'completed';
    } catch (error) {
      console.error('Failed to perform medical record fact check:', error);
      trackError('voice_result_fact_check_failed', error);
      factCheckWidgetStatus.value = 'completed';
    }
  }

  function getIssueForDiagnosis(diagName: string): FactCheckIssue | undefined {
    const check = diagnosisFactChecks.value.get(diagName);
    if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
    return check.issues[0];
  }

  function getIssueForMedicine(medName: string): FactCheckIssue | undefined {
    const check = medicineFactChecks.value.get(medName);
    if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
    return check.issues[0];
  }

  function getIssueForExam(examName: string): FactCheckIssue | undefined {
    const check = examFactChecks.value.get(examName);
    if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
    return check.issues[0];
  }

  return {
    showFactCheckNotification,
    factCheckResult,
    showFactCheckWidget,
    factCheckWidgetStatus,
    factCheckWidgetIssues,
    factCheckProgress,
    factCheckCheckedCount,
    factCheckTotalCount,
    performMedicalRecordFactCheck,
    getIssueForDiagnosis,
    getIssueForMedicine,
    getIssueForExam,
  };
}
