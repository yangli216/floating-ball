export type ConsultationAssistAction =
  | 'record'
  | 'diagnosis'
  | 'differential'
  | 'medication'
  | 'examination'
  | 'lab_test'
  | 'procedure'
  | 'treatment_plan'
  | 'reminder';

export type ConsultationAssistExternalAction =
  | ConsultationAssistAction
  | 'suggestedDx'
  | 'diffDx'
  | 'treatmentPlan'
  | 'treatment_plan_recommendation';

export function normalizeConsultationAssistAction(
  action?: string,
): ConsultationAssistAction | null {
  switch (action) {
    case 'record':
    case 'diagnosis':
    case 'medication':
    case 'examination':
    case 'lab_test':
    case 'procedure':
    case 'treatment_plan':
    case 'reminder':
      return action;
    case 'treatmentPlan':
    case 'treatment_plan_recommendation':
      return 'treatment_plan';
    case 'suggestedDx':
      return 'diagnosis';
    case 'diffDx':
    case 'differential':
      return 'differential';
    default:
      return null;
  }
}

export interface DiagnosisPathOption {
  id: string;
  title: string;
  description: string;
  code?: string;
  meta?: string;
  caption?: string;
  matched?: boolean;
  selected?: boolean;
}

export interface DiagnosisPathContext {
  patientName: string;
  gender: string;
  age: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  allergyHistory: string;
}
