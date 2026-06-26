import { ref, type Ref } from 'vue';
import { getVoiceRecordFieldFeedbackKey } from '@/services/voiceFeedback';
import type {
  VoiceFeedbackSubmissionSummary,
  VoiceRecordFieldFeedbackDraft,
  VoiceRecordFieldKey,
} from '@/types/voiceFeedback';

export type VoiceRecordFieldSnapshot = Record<VoiceRecordFieldKey, string>;

export interface VoiceRecordFieldFeedbackStateOptions {
  fields: Record<VoiceRecordFieldKey, Ref<string>>;
  ensureDraft: (fieldKey: VoiceRecordFieldKey) => VoiceRecordFieldFeedbackDraft;
  submittedMap: Ref<Record<string, VoiceFeedbackSubmissionSummary>>;
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

export function useVoiceRecordFieldFeedbackState(options: VoiceRecordFieldFeedbackStateOptions) {
  const initialRecordSnapshot = ref<VoiceRecordFieldSnapshot>(createEmptyVoiceRecordFieldSnapshot());

  function setInitialRecordSnapshot(snapshot: Partial<VoiceRecordFieldSnapshot>): void {
    initialRecordSnapshot.value = {
      ...createEmptyVoiceRecordFieldSnapshot(),
      ...snapshot,
    };
  }

  function getRecordFieldFeedbackKey(fieldKey: VoiceRecordFieldKey): string {
    return getVoiceRecordFieldFeedbackKey(fieldKey);
  }

  function getRecordFieldValue(fieldKey: VoiceRecordFieldKey): string {
    return options.fields[fieldKey]?.value || '';
  }

  function getRecordFieldDraft(fieldKey: VoiceRecordFieldKey): VoiceRecordFieldFeedbackDraft {
    return options.ensureDraft(fieldKey);
  }

  function getRecordFieldOriginalValue(fieldKey: VoiceRecordFieldKey): string {
    return initialRecordSnapshot.value[fieldKey] || '';
  }

  function getRecordFieldSubmittedLabel(fieldKey: VoiceRecordFieldKey): string {
    return options.submittedMap.value[getRecordFieldFeedbackKey(fieldKey)]?.actionLabel || '';
  }

  function isRecordFieldModified(fieldKey: VoiceRecordFieldKey): boolean {
    return getRecordFieldOriginalValue(fieldKey).trim() !== getRecordFieldValue(fieldKey).trim();
  }

  return {
    initialRecordSnapshot,
    getRecordFieldDraft,
    getRecordFieldFeedbackKey,
    getRecordFieldOriginalValue,
    getRecordFieldSubmittedLabel,
    getRecordFieldValue,
    isRecordFieldModified,
    setInitialRecordSnapshot,
  };
}
