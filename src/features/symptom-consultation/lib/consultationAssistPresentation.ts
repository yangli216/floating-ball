import type { FeatureCode } from '../../../services/featureUsageTracker';
import type { ConsultationAssistAction } from '../../../types/consultationAssist';

export type ConsultationAssistBannerTone = 'info' | 'success' | 'error';

export interface ConsultationAssistBannerFeedback {
  status?: 'pending' | 'success' | 'failed' | string;
  message?: string;
}

export interface BuildConsultationAssistBannerTextInput {
  assistFocus: ConsultationAssistAction | null | undefined;
  activeReferenceRequest?: ConsultationAssistBannerFeedback | null;
  lastReferenceFeedback?: ConsultationAssistBannerFeedback | null;
}

export interface ConsultationAssistBannerStyle {
  display: string;
  gap: string;
  alignItems: string;
  padding: string;
  marginBottom: string;
  borderRadius: string;
  fontSize: string;
  lineHeight: string;
  background: string;
  border: string;
  color: string;
}

const ASSIST_LABEL_BY_ACTION: Record<ConsultationAssistAction, string> = {
  record: '病历快进',
  diagnosis: '诊断快进',
  differential: '鉴别排查',
  medication: '用药快进',
  examination: '检查快进',
  lab_test: '检验快进',
  procedure: '处置快进',
  reminder: '风险提醒',
};

const ASSIST_BANNER_TEXT_BY_ACTION: Record<ConsultationAssistAction, string> = {
  record: '检测到 HIS 已有主诉与现病史，已直接进入病历详情页。',
  diagnosis: '请确认诊断；点击“确认诊断”只记录日志，点击“引用诊断”才会写回 PHIS。',
  differential: '鉴别排查的确认结果只记录日志，不会改写现病史。',
  medication: '请勾选要引用的用药方案，发起引用后会等待 PHIS 回执。',
  examination: '请勾选要引用的检查项目，发起引用后会等待 PHIS 回执。',
  lab_test: '请勾选要引用的检验项目，发起引用后会等待 PHIS 回执。',
  procedure: '请勾选要引用的处置项目，发起引用后会等待 PHIS 回执。',
  reminder: '风险提醒已同步，可结合当前病历继续处理。',
};

const ASSIST_FEATURE_CODE_BY_ACTION: Partial<Record<ConsultationAssistAction, FeatureCode>> = {
  diagnosis: 'diagnosis_recommendation',
  differential: 'diagnosis_checklist',
  medication: 'medication_recommendation',
  examination: 'examination_recommendation',
  lab_test: 'lab_test_recommendation',
  procedure: 'procedure_recommendation',
};

const BANNER_PALETTE_BY_TONE: Record<ConsultationAssistBannerTone, Pick<ConsultationAssistBannerStyle, 'background' | 'border' | 'color'>> = {
  info: {
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.22)',
    color: '#1d4ed8',
  },
  success: {
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.28)',
    color: '#166534',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.28)',
    color: '#991b1b',
  },
};

export function getConsultationAssistLabel(action: ConsultationAssistAction | null | undefined): string {
  return action ? ASSIST_LABEL_BY_ACTION[action] || '' : '';
}

export function getConsultationAssistFeatureCode(
  action: ConsultationAssistAction,
): FeatureCode | undefined {
  return ASSIST_FEATURE_CODE_BY_ACTION[action];
}

export function getConsultationAssistBannerTone(
  activeReferenceRequest?: ConsultationAssistBannerFeedback | null,
  lastReferenceFeedback?: ConsultationAssistBannerFeedback | null,
): ConsultationAssistBannerTone {
  if (activeReferenceRequest?.status === 'pending') {
    return 'info';
  }
  if (lastReferenceFeedback?.status === 'success') {
    return 'success';
  }
  if (lastReferenceFeedback?.status === 'failed') {
    return 'error';
  }
  return 'info';
}

export function buildConsultationAssistBannerText({
  assistFocus,
  activeReferenceRequest,
  lastReferenceFeedback,
}: BuildConsultationAssistBannerTextInput): string {
  if (activeReferenceRequest?.status === 'pending') {
    return activeReferenceRequest.message || '已发起引用请求，等待 PHIS 保存并回执。';
  }

  if (lastReferenceFeedback) {
    return lastReferenceFeedback.message ||
      (lastReferenceFeedback.status === 'success'
        ? 'PHIS 已完成引用保存。'
        : 'PHIS 引用保存失败。');
  }

  return assistFocus ? ASSIST_BANNER_TEXT_BY_ACTION[assistFocus] || '' : '';
}

export function buildConsultationAssistBannerStyle(
  tone: ConsultationAssistBannerTone,
): ConsultationAssistBannerStyle {
  return {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 14px',
    marginBottom: '14px',
    borderRadius: '12px',
    fontSize: '13px',
    lineHeight: '1.5',
    ...BANNER_PALETTE_BY_TONE[tone],
  };
}
