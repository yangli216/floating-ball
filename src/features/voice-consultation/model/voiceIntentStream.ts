import type {
  DiagnosisHint,
  TreatmentHint,
  VoiceExtractionResult,
  VoiceRecommendationPlan,
} from '@/prompts';
import type { ClinicalResultGenerationSection } from '@features/clinical-result';

export type VoiceIntentStreamEventName = ClinicalResultGenerationSection | 'done';

export interface VoiceIntentStreamEvent {
  event: VoiceIntentStreamEventName;
  data: unknown;
}

const EVENT_NAMES = new Set<VoiceIntentStreamEventName>([
  'record_core',
  'history_context',
  'explicit_orders',
  'diagnoses',
  'recommendation_plan',
  'record_extra',
  'done',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseEventLine(line: string): VoiceIntentStreamEvent | null {
  const normalized = line.trim().replace(/^```(?:json)?\s*/u, '').replace(/```$/u, '').trim();
  if (!normalized) return null;

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!isObject(parsed) || typeof parsed.event !== 'string' || !EVENT_NAMES.has(parsed.event as VoiceIntentStreamEventName)) {
      return null;
    }
    return {
      event: parsed.event as VoiceIntentStreamEventName,
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

export function createVoiceIntentStreamParser(onEvent: (event: VoiceIntentStreamEvent) => void) {
  let buffer = '';

  function consumeLine(line: string): void {
    const event = parseEventLine(line);
    if (event) onEvent(event);
  }

  return {
    push(chunk: string): void {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() || '';
      lines.forEach(consumeLine);
    },
    flush(): void {
      if (buffer.trim()) consumeLine(buffer);
      buffer = '';
    },
  };
}

export interface VoiceIntentStreamAccumulator {
  payload: VoiceExtractionResult;
  readySections: ClinicalResultGenerationSection[];
  eventCount: number;
}

export function createVoiceIntentStreamAccumulator(): VoiceIntentStreamAccumulator {
  return {
    payload: {
      recordDraft: {
        chiefComplaint: '',
        historyOfPresentIllness: '',
        pastMedicalHistory: '',
        allergyHistory: '',
        currentMedicationHistory: '',
        personalHistory: '',
        familyHistory: '',
        symptoms: [],
        negativeSymptoms: [],
        treatmentPlan: '',
        healthEducation: '',
      },
      diagnosisHints: [],
      explicitTreatmentHints: [],
      error: false,
      message: '',
    },
    readySections: [],
    eventCount: 0,
  };
}

function markReady(accumulator: VoiceIntentStreamAccumulator, section: ClinicalResultGenerationSection): void {
  if (!accumulator.readySections.includes(section)) {
    accumulator.readySections.push(section);
  }
}

export function applyVoiceIntentStreamEvent(
  accumulator: VoiceIntentStreamAccumulator,
  event: VoiceIntentStreamEvent,
): void {
  accumulator.eventCount += 1;
  const recordDraft = accumulator.payload.recordDraft!;

  switch (event.event) {
    case 'record_core':
      if (isObject(event.data)) Object.assign(recordDraft, event.data);
      markReady(accumulator, 'record_core');
      break;
    case 'history_context':
      if (isObject(event.data)) Object.assign(recordDraft, event.data);
      markReady(accumulator, 'history_context');
      break;
    case 'explicit_orders':
      accumulator.payload.explicitTreatmentHints = Array.isArray(event.data)
        ? event.data as TreatmentHint[]
        : [];
      markReady(accumulator, 'explicit_orders');
      break;
    case 'diagnoses':
      accumulator.payload.diagnosisHints = Array.isArray(event.data)
        ? event.data as DiagnosisHint[]
        : [];
      markReady(accumulator, 'diagnoses');
      break;
    case 'recommendation_plan':
      if (isObject(event.data)) {
        accumulator.payload.recommendationPlan = event.data as unknown as VoiceRecommendationPlan;
      }
      markReady(accumulator, 'recommendation_plan');
      break;
    case 'record_extra':
      if (isObject(event.data)) Object.assign(recordDraft, event.data);
      markReady(accumulator, 'record_extra');
      break;
    case 'done':
      if (isObject(event.data)) {
        accumulator.payload.error = event.data.error === true;
        accumulator.payload.message = typeof event.data.message === 'string' ? event.data.message : '';
      }
      break;
  }
}
