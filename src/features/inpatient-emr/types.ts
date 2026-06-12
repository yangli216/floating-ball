import type {
  HisInpatientOrder,
  HisInpatientEmrContextPackage,
  HisInpatientEmrContextPolicy,
  HisInpatientRegistrationInfo,
  HisInpatientTemperatureChart,
} from '@/services/his';

export interface InpatientEmrPatientInput {
  idPi?: string;
  patientId?: string;
  idVis?: string;
  visitId?: string;
  naPi?: string;
  name?: string;
  sdSexText?: string;
  gender?: string;
  ageText?: string;
  age?: string;
}

export interface InpatientEmrGenerationRequest {
  admissionId: string;
  templateId: string;
  htmlContent: string;
  templateName?: string;
  recordTime?: string;
  doctorSupplement?: string;
  contextPolicy?: HisInpatientEmrContextPolicy;
  hisContext?: HisInpatientEmrContextPackage;
  requestId?: string;
  patient?: InpatientEmrPatientInput;
}

export type InpatientEmrFieldSource =
  | 'ai'
  | 'his_or_system'
  | 'fixed'
  | 'doctor_signature'
  | 'manual_or_his';

export interface InpatientEmrFieldRule {
  source: InpatientEmrFieldSource;
  dependencies?: string[];
  value?: string;
  promptIntent?: string;
  prompt?: string;
  constraints: string[];
}

export interface InpatientEmrTemplateField {
  id: string;
  name: string;
  article?: string;
  type: string;
  readonly: boolean;
  key: boolean;
  defaultValue?: string;
  meaning: string;
  aiSuitable: boolean;
  rule: InpatientEmrFieldRule;
  presetStatus?: 'exclude' | 'ai' | 'unknown';
}

export interface InpatientEmrTemplateParseResult {
  cacheKey: string;
  cacheHit: boolean;
  fields: InpatientEmrTemplateField[];
}

export interface InpatientEmrDocumentContext {
  templateId: string;
  templateName: string;
  recordType: string;
  recordTime: string;
  recordDate: string;
}

export interface InpatientEmrContext {
  documentContext: InpatientEmrDocumentContext;
  doctorSupplement?: string;
  aiContext?: HisInpatientEmrContextPackage;
  registration: HisInpatientRegistrationInfo | null;
  orders: HisInpatientOrder[];
  temperatureChart: HisInpatientTemperatureChart | null;
}

export interface InpatientEmrGeneratedPreview {
  emrContent: string;
  htmlContent: string;
  fieldValues: Record<string, string>;
}

export interface InpatientEmrGenerationResult extends InpatientEmrGeneratedPreview {
  request: InpatientEmrGenerationRequest;
  context: InpatientEmrContext;
  template: InpatientEmrTemplateParseResult;
  generatedAt: number;
}

export type InpatientEmrStepKey = 'patient' | 'orders' | 'temperature' | 'template' | 'generate';
export type InpatientEmrStepStatus = 'pending' | 'running' | 'done' | 'error';

export interface InpatientEmrGenerationStep {
  key: InpatientEmrStepKey;
  title: string;
  description: string;
  status: InpatientEmrStepStatus;
  detail?: string;
}

export interface InpatientEmrGenerationProgress {
  key: InpatientEmrStepKey;
  status: InpatientEmrStepStatus;
  detail?: string;
}
