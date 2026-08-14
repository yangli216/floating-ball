import { PROMPTS } from '@/prompts';
import { chatFast } from '@/services/llm';

export interface DiagnosisChecklistRequestInput {
  diagnosisName: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
}

export interface DiagnosisChecklistTraceContext {
  scene: string;
  sourceModule: string;
  operationModule?: string;
  operationAction?: string;
  title?: string;
  consultationId?: string;
}

export async function requestDiagnosisChecklist(
  input: DiagnosisChecklistRequestInput,
  traceContext: DiagnosisChecklistTraceContext,
): Promise<string> {
  return chatFast([
    { role: 'system', content: PROMPTS.consultation.diagnosisChecklist.system },
    { role: 'user', content: PROMPTS.consultation.diagnosisChecklist.buildUserPrompt(input) },
  ], undefined, undefined, undefined, { traceContext });
}
