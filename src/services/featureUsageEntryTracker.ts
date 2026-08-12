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

export function trackSmartConsultationEntry(_ignoredClinicalContext?: unknown): void {
  trackFeatureUsage({
    featureCode: 'smart_consultation',
    eventAction: 'open_smart_consultation',
    sourceModule: 'his_bridge',
    scene: 'consultation',
  });
}

export function trackVoiceConsultationEntry(_ignoredClinicalContext?: unknown): void {
  trackFeatureUsage({
    featureCode: 'voice_consultation',
    eventAction: 'open_voice_consultation',
    sourceModule: 'his_bridge',
    scene: 'voice-consultation',
  });
}

export function trackConsultationAssistEntry(
  action: string | undefined,
  _ignoredClinicalContext?: unknown,
): void {
  const kind = normalizeConsultationAssistAction(action);
  if (!kind) return;

  const featureCode = ASSIST_FEATURE_CODE_BY_ACTION[action as ConsultationAssistExternalAction]
    || ASSIST_FEATURE_CODE_BY_ACTION[kind];
  if (!featureCode) return;

  trackFeatureUsage({
    featureCode,
    eventAction: `open_${kind}_assist`,
    sourceModule: 'his_bridge',
    scene: `consultation-assist-${kind}`,
  });
}
