import { getHisAdapter } from '@/services/his';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import type { AppPatient } from '@/types/appState';
import {
  getPatientContextId,
  getPatientContextVisitId,
} from '@/utils/patientContext';

function readCurrentDiagnosis(patient: AppPatient | null): string {
  const sources = [
    patient as Record<string, unknown> | null,
    patient?.clinical as Record<string, unknown> | undefined,
    patient?.raw,
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const key of ['diagnosis', 'diagnosisText', 'diagnosis_text']) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return '';
}

export async function fetchOutpatientFollowUpContext(
  patient: AppPatient | null,
): Promise<HisOutpatientFollowUpContext | null> {
  const patientId = getPatientContextId(patient);
  const currentVisitId = getPatientContextVisitId(patient);
  const currentDiagnosis = readCurrentDiagnosis(patient);
  const adapter = getHisAdapter();
  if (!adapter || !patientId || !currentVisitId || !currentDiagnosis) {
    return null;
  }

  try {
    return await adapter.fetchOutpatientFollowUpContext({
      patientId,
      currentVisitId,
      currentDiagnosis,
    });
  } catch (error) {
    console.warn('[VoiceFollowUp] Failed to fetch outpatient follow-up context; continuing voice flow', error);
    return null;
  }
}

export function buildOutpatientFollowUpPatientOverrides(
  patient: AppPatient | null,
  _context: HisOutpatientFollowUpContext,
): Partial<AppPatient> {
  const diagnosis = patient?.diagnosis
    || patient?.clinical?.diagnosis
    || '';

  return {
    diagnosis,
    clinical: {
      ...patient?.clinical,
      diagnosis,
    },
    source: 'outpatient-follow-up',
  };
}

export function buildOutpatientFollowUpEvidence(context: HisOutpatientFollowUpContext | null | undefined): string {
  if (!context?.followUpEligible) return '';

  const parts: string[] = [];
  if (context.medicalRecordText) {
    parts.push(`历史门诊病历全文：\n${context.medicalRecordText}`);
  }

  const labReports = (context.labReports || [])
    .map((report) => {
      const items = (report.items || [])
        .map((item) => {
          const result = [item.result, item.unit].filter(Boolean).join(' ');
          const attributes = [
            item.referenceRange ? `参考范围${item.referenceRange}` : '',
            item.abnormalFlag ? `异常标记${item.abnormalFlag}` : '',
          ].filter(Boolean);
          return `${item.itemName || '项目'}：${result || '未提供结果'}${attributes.length ? `（${attributes.join('，')}）` : ''}`;
        })
        .filter(Boolean);
      if (items.length === 0) return '';
      return `${report.reportName || '检验报告'}${report.reportTime ? `（${report.reportTime}）` : ''}：${items.join('；')}`;
    })
    .filter(Boolean)
    .slice(0, 8);
  if (labReports.length > 0) {
    parts.push(`检验报告：\n${labReports.join('\n')}`);
  }

  const examReports = (context.examReports || [])
    .map((item) => {
      const result = [
        item.finding ? `所见：${item.finding}` : '',
        item.conclusion ? `结论：${item.conclusion}` : '',
      ].filter(Boolean).join('；');
      return result
        ? `${item.examName || '检查报告'}${item.reportTime ? `（${item.reportTime}）` : ''}：${result}`
        : '';
    })
    .filter(Boolean)
    .slice(0, 8);
  if (examReports.length > 0) {
    parts.push(`检查报告：\n${examReports.join('\n')}`);
  }

  return parts.join('\n\n');
}
