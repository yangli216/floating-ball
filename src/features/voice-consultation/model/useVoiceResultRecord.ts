import { ref } from 'vue';
import { trackClick, trackRecommendationAction } from '@/services/operationTracker';
import type { GeneratedRecord } from '@/types/voiceResult';

const EDITABLE_RECORD_FIELDS: (keyof GeneratedRecord)[] = [
  'chiefComplaint',
  'historyOfPresentIllness',
  'pastMedicalHistory',
  'treatmentPlan',
  'healthEducation',
];

function cloneRecord(record: GeneratedRecord): GeneratedRecord {
  return JSON.parse(JSON.stringify(record));
}

function trackLoadedRecord(record: GeneratedRecord): void {
  trackClick('voice_result_loaded', {
    diagnosisCount: record.diagnosisList?.length || 0,
    medicationCount: record.medications?.length || 0,
    examCount: record.examinations?.length || 0,
    labTestCount: record.labTests?.length || 0,
    procedureCount: record.procedures?.length || 0,
  });
}

export function useVoiceResultRecord() {
  const record = ref<GeneratedRecord | null>(null);
  const originalRecord = ref<GeneratedRecord | null>(null);

  function loadRecord(initialRecord: GeneratedRecord): GeneratedRecord {
    const nextRecord = cloneRecord(initialRecord);
    originalRecord.value = cloneRecord(initialRecord);
    record.value = nextRecord;
    trackLoadedRecord(nextRecord);
    return nextRecord;
  }

  function trackFieldEdit(field: string): void {
    if (!originalRecord.value || !record.value) return;

    const originalValue = originalRecord.value[field as keyof GeneratedRecord];
    const currentValue = record.value[field as keyof GeneratedRecord];
    if (typeof originalValue === 'string' && typeof currentValue === 'string' && originalValue !== currentValue) {
      trackClick('voice_result_edit_field', { field, changed: true });
    }
  }

  function trackConfirmAdoption(): void {
    if (originalRecord.value && record.value) {
      for (const field of EDITABLE_RECORD_FIELDS) {
        const originalValue = originalRecord.value[field];
        const currentValue = record.value[field];
        if (typeof originalValue === 'string' && typeof currentValue === 'string' && originalValue !== currentValue) {
          trackRecommendationAction('record', field, 'modified', {
            originalValue: originalValue.substring(0, 200),
            modifiedValue: currentValue.substring(0, 200),
          });
        }
      }
    }

    record.value?.diagnosisList?.forEach(diagnosis => {
      trackRecommendationAction('diagnosis', diagnosis.code || diagnosis.name, 'adopted', { originalValue: diagnosis.name });
    });
    record.value?.medications?.forEach(medicine => {
      trackRecommendationAction('medication', medicine.name, 'adopted', { originalValue: medicine.name });
    });
    record.value?.examinations?.forEach(examination => {
      trackRecommendationAction('examination', examination.name, 'adopted', { originalValue: examination.name });
    });
    record.value?.labTests?.forEach(labTest => {
      trackRecommendationAction('lab_test', labTest.name, 'adopted', { originalValue: labTest.name });
    });
    record.value?.procedures?.forEach(procedure => {
      trackRecommendationAction('procedure', procedure.name, 'adopted', { originalValue: procedure.name });
    });
  }

  return {
    record,
    originalRecord,
    loadRecord,
    trackFieldEdit,
    trackConfirmAdoption,
  };
}
