export type VoiceFeedbackAction = 'useful' | 'dissatisfied' | 'corrected';

export interface VoiceRecommendationFeedbackDraft {
  action: VoiceFeedbackAction | '';
  issueTags: string[];
  comment: string;
  correctedValue: string;
}

export interface VoiceSessionFeedbackDraft {
  rating: number;
  issueTags: string[];
  comment: string;
}

export interface VoiceFeedbackDraftState {
  recommendationDrafts: Record<string, VoiceRecommendationFeedbackDraft>;
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

export type VoicePendingFeedbackPayload = VoiceRecommendationFeedbackPayload | VoiceSessionFeedbackPayload;