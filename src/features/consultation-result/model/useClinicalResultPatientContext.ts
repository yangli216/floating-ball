import { computed, type ComputedRef } from 'vue';
import type { AppPatient } from '@/types/appState';
import { getPatientContextAnchorId } from '@/utils/patientContext';
import { resolvePatientAge, resolvePatientGender, resolvePatientName } from '@/utils/patientProfile';

export interface ClinicalResultPatientContextOptions {
  patient: ComputedRef<AppPatient | undefined>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function useClinicalResultPatientContext(options: ClinicalResultPatientContextOptions) {
  const patientName = computed((): string => resolvePatientName(options.patient.value));
  const patientGender = computed((): string => resolvePatientGender(options.patient.value));
  const patientAge = computed((): string => resolvePatientAge(options.patient.value));
  const patientTetId = computed((): string => readString(options.patient.value?.idTet));
  const patientAnchorId = computed((): string => getPatientContextAnchorId(options.patient.value));
  const consultationId = computed((): string => patientAnchorId.value || 'unknown');

  return {
    consultationId,
    patientAge,
    patientAnchorId,
    patientGender,
    patientName,
    patientTetId,
  };
}
