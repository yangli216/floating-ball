import { getHisAdapter } from '@/services/his';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import type { AppPatient } from '@/types/appState';
import {
  getPatientContextId,
  getPatientContextVisitId,
} from '@/utils/patientContext';

function readPatientText(patient: AppPatient | null, keys: string[]): string {
  const sources = [
    patient as Record<string, unknown> | null,
    patient?.clinical as Record<string, unknown> | undefined,
    patient?.raw,
  ];

  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return '';
}

function readCurrentDiagnosis(patient: AppPatient | null): string {
  return readPatientText(patient, ['diagnosis', 'diagnosisText', 'diagnosis_text']);
}

function readCurrentOutpatientRecordText(patient: AppPatient | null): string {
  return readPatientText(patient, ['currentOutpatientRecordText']);
}

function readCurrentOutpatientRecordTitle(patient: AppPatient | null): string {
  return readPatientText(patient, ['currentOutpatientRecordTitle']);
}

function readCurrentOutpatientRecordTime(patient: AppPatient | null): string {
  return readPatientText(patient, ['currentOutpatientRecordTime']);
}

function hasReportResults(context: Pick<HisOutpatientFollowUpContext, 'labReports' | 'examReports'>): boolean {
  const hasLab = (context.labReports || []).some((report) => (report.items || []).some((item) => (
    Boolean(item.itemName || item.result || item.abnormalFlag)
  )));
  const hasExam = (context.examReports || []).some((report) => Boolean(
    report.examName || report.finding || report.conclusion,
  ));
  return hasLab || hasExam;
}

export async function fetchOutpatientFollowUpContext(
  patient: AppPatient | null,
): Promise<HisOutpatientFollowUpContext | null> {
  const patientId = getPatientContextId(patient);
  const currentVisitId = getPatientContextVisitId(patient);
  const currentDiagnosis = readCurrentDiagnosis(patient);
  const medicalRecordText = readCurrentOutpatientRecordText(patient);
  const adapter = getHisAdapter();
  if (!adapter || !patientId || !currentVisitId || !medicalRecordText) {
    return null;
  }

  try {
    const reportResults = await adapter.fetchOutpatientFollowUpReportResults({
      patientId,
      currentVisitId,
    });
    if (!reportResults) {
      return null;
    }
    const context: HisOutpatientFollowUpContext = {
      followUpEligible: Boolean(reportResults.followUpEligible && hasReportResults(reportResults)),
      source: {
        visitId: currentVisitId,
        visitTime: readCurrentOutpatientRecordTime(patient) || undefined,
        documentTitle: readCurrentOutpatientRecordTitle(patient) || '本次门诊病历',
      },
      currentDiagnosis: currentDiagnosis || undefined,
      medicalRecordText,
      labReports: reportResults.labReports || [],
      examReports: reportResults.examReports || [],
      ineligibleReason: reportResults.ineligibleReason ?? null,
    };
    return context.followUpEligible ? context : null;
  } catch (error) {
    console.warn('[VoiceFollowUp] Failed to fetch outpatient follow-up context; continuing voice flow', error);
    return null;
  }
}

export function buildOutpatientFollowUpPatientOverrides(
  patient: AppPatient | null,
  context: HisOutpatientFollowUpContext,
): Partial<AppPatient> {
  const diagnosis = context.currentDiagnosis
    || readCurrentDiagnosis(patient)
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

  const medicalRecordText = context.medicalRecordText?.trim() || '';
  if (!medicalRecordText || (labReports.length === 0 && examReports.length === 0)) {
    return '';
  }

  const parts: string[] = [];
  if (context.currentDiagnosis) {
    parts.push(`诊断参考：\n${context.currentDiagnosis}`);
  }

  parts.push(`本次门诊病历全文：\n${medicalRecordText}`);

  if (labReports.length > 0) {
    parts.push(`本次检验报告：\n${labReports.join('\n')}`);
  }

  if (examReports.length > 0) {
    parts.push(`本次检查报告：\n${examReports.join('\n')}`);
  }

  return parts.join('\n\n');
}
