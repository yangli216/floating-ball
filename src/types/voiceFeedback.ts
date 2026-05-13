export type VoiceFeedbackAction = 'useful' | 'dissatisfied' | 'corrected';
export type VoiceRecordFieldKey = 'chiefComplaint' | 'historyOfPresentIllness' | 'pastMedicalHistory' | 'familyHistory';

export interface VoiceFeedbackDraftMeta {
  submittedAt?: number;
  revision?: number;
}

export interface VoiceRecommendationFeedbackDraft extends VoiceFeedbackDraftMeta {
  action: VoiceFeedbackAction | '';
  issueTags: string[];
  comment: string;
  correctedValue: string;
}

export type VoiceRecordFieldFeedbackDraft = VoiceRecommendationFeedbackDraft;

export interface VoiceSessionFeedbackDraft extends VoiceFeedbackDraftMeta {
  rating: number;
  issueTags: string[];
  comment: string;
}

export interface VoiceFeedbackDraftState {
  recommendationDrafts: Record<string, VoiceRecommendationFeedbackDraft>;
  recordFieldDrafts: Record<string, VoiceRecordFieldFeedbackDraft>;
  sessionDraft: VoiceSessionFeedbackDraft;
}

export interface VoiceFeedbackOption {
  key: string;
  label: string;
}

export interface VoiceFeedbackSubmissionSummary {
  actionLabel: string;
  submittedAt: number;
}

export interface VoiceRecommendationFeedbackPayload {
  kind: 'recommendation';
  localId: string;
  consultationId: string;
  sessionId: string | null;
  patientId: string;
  patientName: string;
  targetType: string;
  targetId: string;
  recommendationType: string;
  recommendationKey: string;
  recommendationTitle: string;
  action: VoiceFeedbackAction;
  issueTags: string[];
  comment: string;
  correctedValue?: string;
  encounterSummary: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
  };
  aiTrace?: Record<string, unknown> | null;
  recommendationSnapshot: Record<string, unknown>;
  createdAt: number;
}

export interface VoiceRecordFieldDiffSummary {
  changed: boolean;
  summaryText: string;
  originalExcerpt: string;
  currentExcerpt: string;
  removedText: string;
  addedText: string;
}

export interface VoiceRecordFieldFeedbackPayload {
  kind: 'record_field';
  localId: string;
  consultationId: string;
  sessionId: string | null;
  patientId: string;
  patientName: string;
  fieldKey: VoiceRecordFieldKey;
  fieldLabel: string;
  action: VoiceFeedbackAction;
  issueTags: string[];
  comment: string;
  correctedValue?: string;
  originalValue: string;
  currentValue: string;
  modifiedByDoctor: boolean;
  diffSummary: VoiceRecordFieldDiffSummary;
  encounterSummary: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    pastMedicalHistory: string;
    familyHistory: string;
  };
  aiTrace?: Record<string, unknown> | null;
  createdAt: number;
}

export interface VoiceSessionFeedbackPayload {
  kind: 'session';
  localId: string;
  consultationId: string;
  sessionId: string | null;
  patientId: string;
  patientName: string;
  rating: number;
  issueTags: string[];
  comment: string;
  encounterSummary: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    diagnosisNames: string[];
    selectedTreatmentNames: string[];
  };
  aiTrace?: Record<string, unknown> | null;
  createdAt: number;
}

export type VoicePendingFeedbackPayload =
  | VoiceRecommendationFeedbackPayload
  | VoiceRecordFieldFeedbackPayload
  | VoiceSessionFeedbackPayload;
