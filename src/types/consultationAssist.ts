export type ConsultationAssistAction =
  | 'record'
  | 'diagnosis'
  | 'differential'
  | 'medication'
  | 'examination'
  | 'reminder';

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
