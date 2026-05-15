export type ReportInterpretationTaskId = 'inspectReport' | 'checkReport';

export type ReportInterpretationUrgency = 'low' | 'medium' | 'high';

export interface ReportInterpretationPatientInput {
  patientId?: string;
  idPi?: string;
  visitId?: string;
  idVis?: string;
  name?: string;
  naPi?: string;
  gender?: string;
  sdSexText?: string;
  age?: string;
  ageText?: string;
  allergyHistory?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  diagnosis?: string;
  [key: string]: unknown;
}

export interface ReportInterpretationRequestPayload {
  taskId: ReportInterpretationTaskId;
  query: string;
  requestId?: string;
  patient?: ReportInterpretationPatientInput | null;
}

export interface ReportInterpretationPatientProfile {
  patientId?: string;
  visitId?: string;
  patientName?: string;
  genderText?: string;
  ageText?: string;
  allergyHistory?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  diagnosis?: string;
  raw?: Record<string, unknown>;
}

export interface ReportInterpretationResolvedRequest {
  requestId: string;
  taskId: ReportInterpretationTaskId;
  reportKindLabel: string;
  query: string;
  patient: ReportInterpretationPatientProfile | null;
}

export interface ReportInterpretationSection {
  title: string;
  content: string;
}

export interface ReportInterpretationKeyPoint {
  title: string;
  detail: string;
  urgency?: ReportInterpretationUrgency;
}

export interface ReportInterpretationWindowPayload {
  requestId: string;
  taskId: ReportInterpretationTaskId;
  reportKindLabel: string;
  patientSummary: string;
  sourceQuery: string;
  summary: string;
  conclusion: string;
  keyPoints: ReportInterpretationKeyPoint[];
  sections: ReportInterpretationSection[];
  recommendations: string[];
  cautions: string[];
  generatedAt: string;
}

export interface ReportInterpretationWindowStateEvent {
  loading: boolean;
  phase?: 'preparing' | 'generating' | 'rendering' | 'success' | 'error';
  message?: string;
  detail?: string;
  clearPayload?: boolean;
}