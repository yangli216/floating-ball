import { getFeedbackActor } from './feedbackContext';
import { buildRegionalSpeechUploadPayload, isRegionalMode, regionalPost } from './regionalClient';
import type { Diagnosis, Patient, TreatmentRecommendation } from '../types/consultation';
import type { AppPatient } from '../types/appState';

export type ConsultationUserLogType = 'voice' | 'smart';

export interface ConsultationSnapshotItem {
  name: string;
  code?: string;
  type?: string;
  selected?: boolean;
  primary?: boolean;
  spec?: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  totalQty?: string;
  execDept?: string;
}

export interface ConsultationUserLogSnapshot {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  diagnoses: ConsultationSnapshotItem[];
  medicines: ConsultationSnapshotItem[];
  examinations: ConsultationSnapshotItem[];
  labTests: ConsultationSnapshotItem[];
}

export interface ConsultationSelectionSnapshot {
  selectedDiagnosisNames: string[];
  selectedMedicineNames: string[];
  selectedExaminationNames: string[];
  selectedLabTestNames: string[];
}

export interface ConsultationSpeechLogInput {
  text?: string;
  audioBlob?: Blob;
  mimeType?: string;
  format?: string;
  fileName?: string;
}

interface SubmitConsultationUserLogInput {
  consultationId: string;
  consultationType: ConsultationUserLogType;
  patient?: Patient | AppPatient | null;
  speech?: ConsultationSpeechLogInput;
  firstSnapshot?: ConsultationUserLogSnapshot;
  finalSnapshot?: ConsultationUserLogSnapshot;
  selectionSnapshot?: ConsultationSelectionSnapshot;
}

interface BuildSnapshotInput {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  diagnoses?: Diagnosis[];
  selectedDiagnosis?: Diagnosis | null;
  treatments?: TreatmentRecommendation[];
  medicines?: TreatmentRecommendation[];
  examinations?: TreatmentRecommendation[];
  labTests?: TreatmentRecommendation[];
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function patientValue(patient: Patient | AppPatient | null | undefined, keys: string[]): string {
  const record = (patient || {}) as Record<string, unknown>;
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return '';
}

function diagnosisKey(diagnosis: Diagnosis | null | undefined): string {
  if (!diagnosis) return '';
  return `${diagnosis.id || ''}|${diagnosis.code || ''}|${diagnosis.name || ''}`;
}

function normalizeDiagnosis(diagnosis: Diagnosis, selectedDiagnosis?: Diagnosis | null): ConsultationSnapshotItem {
  const selected = diagnosisKey(diagnosis) === diagnosisKey(selectedDiagnosis) || Boolean((diagnosis as any).selected);
  return {
    name: text(diagnosis.name),
    code: text(diagnosis.code),
    selected,
    primary: selected,
  };
}

function normalizeTreatment(item: TreatmentRecommendation): ConsultationSnapshotItem {
  return {
    name: text(item.name),
    code: text((item.matchedItem as any)?.code || (item.matchedItem as any)?.cdSrv || (item.matchedItem as any)?.id),
    type: text(item.type),
    selected: Boolean(item.selected),
    spec: text(item.spec || (item.matchedItem as any)?.spec),
    dosage: [item.dosage, item.dosageUnit].map(text).filter(Boolean).join(''),
    frequency: text(item.frequency),
    route: text(item.route),
    totalQty: [item.totalQty, item.totalUnit].map(text).filter(Boolean).join(''),
    execDept: text(item.execDept),
  };
}

function splitTreatmentsByType(items: TreatmentRecommendation[] = []): {
  medicines: TreatmentRecommendation[];
  examinations: TreatmentRecommendation[];
  labTests: TreatmentRecommendation[];
} {
  return {
    medicines: items.filter(item => item.type === 'medicine'),
    examinations: items.filter(item => item.type === 'exam'),
    labTests: items.filter(item => item.type === 'lab_test'),
  };
}

export function buildConsultationUserLogSnapshot(input: BuildSnapshotInput): ConsultationUserLogSnapshot {
  const grouped = splitTreatmentsByType(input.treatments);
  const medicines = input.medicines || grouped.medicines;
  const examinations = input.examinations || grouped.examinations;
  const labTests = input.labTests || grouped.labTests;

  return {
    chiefComplaint: text(input.chiefComplaint),
    historyOfPresentIllness: text(input.historyOfPresentIllness),
    diagnoses: (input.diagnoses || []).map(item => normalizeDiagnosis(item, input.selectedDiagnosis)),
    medicines: medicines.map(normalizeTreatment),
    examinations: examinations.map(normalizeTreatment),
    labTests: labTests.map(normalizeTreatment),
  };
}

export function buildConsultationSelectionSnapshot(snapshot: ConsultationUserLogSnapshot): ConsultationSelectionSnapshot {
  return {
    selectedDiagnosisNames: snapshot.diagnoses.filter(item => item.selected).map(item => item.name).filter(Boolean),
    selectedMedicineNames: snapshot.medicines.filter(item => item.selected).map(item => item.name).filter(Boolean),
    selectedExaminationNames: snapshot.examinations.filter(item => item.selected).map(item => item.name).filter(Boolean),
    selectedLabTestNames: snapshot.labTests.filter(item => item.selected).map(item => item.name).filter(Boolean),
  };
}

export async function submitConsultationUserLog(input: SubmitConsultationUserLogInput): Promise<void> {
  if (!isRegionalMode() || !input.consultationId) return;

  const actor = getFeedbackActor();
  const patient = input.patient;

  try {
    const speechPayload = input.speech?.audioBlob
      ? await buildRegionalSpeechUploadPayload(input.speech.audioBlob, {
        mimeType: input.speech.mimeType || input.speech.audioBlob.type || 'audio/wav',
        format: input.speech.format,
        scene: 'voice-consultation',
        fileName: input.speech.fileName,
      })
      : null;

    await regionalPost('/v1/client/user-logs/consultations', {
      consultationId: input.consultationId,
      consultationType: input.consultationType,
      consultationTime: Date.now(),
      patientId: patientValue(patient, ['idPi', 'patientId', 'id', 'idTet', 'idMpi']),
      patientName: patientValue(patient, ['naPi', 'patientName', 'name']),
      patientGender: patientValue(patient, ['sdSexText', 'gender', 'sdSex']),
      patientAge: patientValue(patient, ['ageText', 'age', 'ageNum']),
      doctorId: actor.doctorId,
      doctorName: actor.doctorName,
      orgCode: actor.orgCode,
      orgName: actor.orgName,
      deptId: actor.deptId,
      deptName: actor.deptName,
      speechText: input.speech?.text,
      audio: speechPayload?.audio,
      audioMimeType: speechPayload?.mimeType,
      audioFormat: speechPayload?.format,
      audioFileName: speechPayload?.fileName,
      firstSnapshot: input.firstSnapshot,
      finalSnapshot: input.finalSnapshot,
      selectionSnapshot: input.selectionSnapshot,
    });
  } catch (error) {
    console.warn('[ConsultationUserLog] Failed to submit consultation user log:', error);
  }
}
