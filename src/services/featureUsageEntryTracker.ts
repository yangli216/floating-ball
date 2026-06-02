/**
 * HIS Bridge 功能入口统计适配。
 *
 * 这里只把“入口已经被桌面端接受并准备打开目标界面”归一成产品功能事件；
 * AI 生成、问诊日志和审计日志继续由各自链路处理。
 */
import type { FeatureCode } from './featureUsageTracker';
import { trackFeatureUsage } from './featureUsageTracker';
import type { ConsultationAssistExternalAction } from '../types/consultationAssist';
import { normalizeConsultationAssistAction } from '../types/consultationAssist';
import { getPatientContextAnchorId, getPatientContextId, getPatientContextName } from '../utils/patientContext';
import type { AppPatient } from '../types/appState';

interface TrackEntryOptions {
  patient?: AppPatient | null;
  consultationId?: string | null;
  payload?: Record<string, unknown> | null;
}

const ASSIST_FEATURE_CODE_BY_ACTION: Partial<Record<ConsultationAssistExternalAction, FeatureCode>> = {
  diagnosis: 'diagnosis_recommendation',
  suggestedDx: 'diagnosis_recommendation',
  differential: 'diagnosis_checklist',
  diffDx: 'diagnosis_checklist',
  medication: 'medication_recommendation',
  examination: 'examination_recommendation',
  lab_test: 'lab_test_recommendation',
  procedure: 'procedure_recommendation',
  treatment_plan: 'treatment_plan_recommendation',
};

function normalizeText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    return text || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readPayloadText(payload: Record<string, unknown> | null | undefined, keys: string[]): string | undefined {
  if (!payload) return undefined;
  for (const key of keys) {
    const text = normalizeText(payload[key]);
    if (text) return text;
  }
  return undefined;
}

function resolveConsultationId({
  patient,
  consultationId,
  payload,
}: TrackEntryOptions): string | undefined {
  return normalizeText(consultationId)
    || getPatientContextAnchorId(patient as AppPatient)
    || readPayloadText(payload, ['idVis', 'visitId', 'idPi', 'patientId', 'id']);
}

function buildEntryPayload(options: TrackEntryOptions): Record<string, unknown> {
  const payload = options.payload || {};
  return {
    patientId: getPatientContextId(options.patient as AppPatient)
      || readPayloadText(payload, ['idPi', 'patientId', 'id']),
    patientName: getPatientContextName(options.patient as AppPatient)
      || readPayloadText(payload, ['naPi', 'name', 'patientName']),
    visitId: getPatientContextAnchorId(options.patient as AppPatient)
      || readPayloadText(payload, ['idVis', 'visitId']),
  };
}

export function trackSmartConsultationEntry(options: TrackEntryOptions): void {
  const id = resolveConsultationId(options);
  trackFeatureUsage({
    featureCode: 'smart_consultation',
    eventAction: 'open_smart_consultation',
    consultationId: id,
    sourceModule: 'his_bridge',
    scene: 'consultation',
    payload: buildEntryPayload(options),
  });
}

export function trackVoiceConsultationEntry(options: TrackEntryOptions): void {
  const id = resolveConsultationId(options);
  trackFeatureUsage({
    featureCode: 'voice_consultation',
    eventAction: 'open_voice_consultation',
    consultationId: id,
    sourceModule: 'his_bridge',
    scene: 'voice-consultation',
    payload: buildEntryPayload(options),
  });
}

export function trackConsultationAssistEntry(
  action: string | undefined,
  options: TrackEntryOptions,
): void {
  const kind = normalizeConsultationAssistAction(action);
  if (!kind) return;

  const featureCode = ASSIST_FEATURE_CODE_BY_ACTION[action as ConsultationAssistExternalAction]
    || ASSIST_FEATURE_CODE_BY_ACTION[kind];
  if (!featureCode) return;

  const id = resolveConsultationId(options);
  trackFeatureUsage({
    featureCode,
    eventAction: `open_${kind}_assist`,
    consultationId: id,
    sourceModule: 'his_bridge',
    scene: `consultation-assist-${kind}`,
    payload: {
      ...buildEntryPayload(options),
      action: kind,
      rawAction: action,
    },
  });
}
