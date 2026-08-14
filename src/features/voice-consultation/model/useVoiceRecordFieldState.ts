import { ref, type Ref } from 'vue';
import type { VoiceRecordFieldKey } from '@/types/voiceFeedback';

export type VoiceRecordFieldSnapshot = Record<VoiceRecordFieldKey, string>;

export interface VoiceRecordFieldStateOptions {
  fields: Record<VoiceRecordFieldKey, Ref<string>>;
}

function createEmptyVoiceRecordFieldSnapshot(): VoiceRecordFieldSnapshot {
  return {
    chiefComplaint: '',
    historyOfPresentIllness: '',
    pastMedicalHistory: '',
    personalHistory: '',
    familyHistory: '',
    physicalExam: '',
    precautions: '',
  };
}

export function useVoiceRecordFieldState(options: VoiceRecordFieldStateOptions) {
  const initialRecordSnapshot = ref<VoiceRecordFieldSnapshot>(createEmptyVoiceRecordFieldSnapshot());

  function setInitialRecordSnapshot(snapshot: Partial<VoiceRecordFieldSnapshot>): void {
    initialRecordSnapshot.value = {
      ...createEmptyVoiceRecordFieldSnapshot(),
      ...snapshot,
    };
  }

  function setInitialRecordFieldValue(fieldKey: VoiceRecordFieldKey, value: string): void {
    initialRecordSnapshot.value = {
      ...initialRecordSnapshot.value,
      [fieldKey]: value,
    };
  }

  function getRecordFieldValue(fieldKey: VoiceRecordFieldKey): string {
    return options.fields[fieldKey]?.value || '';
  }

  function getRecordFieldOriginalValue(fieldKey: VoiceRecordFieldKey): string {
    return initialRecordSnapshot.value[fieldKey] || '';
  }

  function isRecordFieldModified(fieldKey: VoiceRecordFieldKey): boolean {
    return getRecordFieldOriginalValue(fieldKey).trim() !== getRecordFieldValue(fieldKey).trim();
  }

  return {
    initialRecordSnapshot,
    getRecordFieldOriginalValue,
    getRecordFieldValue,
    isRecordFieldModified,
    setInitialRecordFieldValue,
    setInitialRecordSnapshot,
  };
}

export type VoiceRecordFieldState = ReturnType<typeof useVoiceRecordFieldState>;
