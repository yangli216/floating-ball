import type { MaybeRefOrGetter, Ref } from 'vue';
import { ref, toValue } from 'vue';
import type { AppPatient } from '@/types/appState';
import type { Patient } from '@/types/consultation';
import {
  buildConsultationSelectionSnapshot,
  computeChangeSummary,
} from '@services/consultationUserLog';
import type {
  ConsultationChangeSummary,
  ConsultationSelectionSnapshot,
  ConsultationUserLogSnapshot,
  ConsultationUserLogType,
} from '@services/consultationUserLog';

export interface ClinicalResultUserLogSubmitInput {
  consultationId: string;
  consultationType: ConsultationUserLogType;
  patient?: Patient | AppPatient | null;
  firstSnapshot?: ConsultationUserLogSnapshot;
  finalSnapshot?: ConsultationUserLogSnapshot;
  selectionSnapshot?: ConsultationSelectionSnapshot;
  changeSummary?: ConsultationChangeSummary;
  abandoned?: boolean;
}

export interface ClinicalResultUserLogChangeFlags {
  pastMedicalHistoryChanged?: boolean;
  familyHistoryChanged?: boolean;
}

export type ClinicalResultUserLogSubmit = (
  input: ClinicalResultUserLogSubmitInput,
) => Promise<void> | void;

export interface ClinicalResultUserLogControllerOptions {
  consultationId: MaybeRefOrGetter<string>;
  consultationType: MaybeRefOrGetter<ConsultationUserLogType>;
  patient?: MaybeRefOrGetter<Patient | AppPatient | null | undefined>;
  buildSnapshot: () => ConsultationUserLogSnapshot;
  submit: ClinicalResultUserLogSubmit;
  getChangeFlags?: () => ClinicalResultUserLogChangeFlags;
  includeChangeSummary?: MaybeRefOrGetter<boolean | undefined>;
}

export interface ClinicalResultUserLogController {
  firstUserLogSnapshot: Ref<ConsultationUserLogSnapshot | null>;
  resetFirstSnapshot: () => void;
  submitGeneratedUserLog: () => void;
  submitFinalUserLog: () => void;
  submitAbandonedUserLog: () => void;
}

function shouldBuildChangeSummary(options: ClinicalResultUserLogControllerOptions): boolean {
  const explicit = options.includeChangeSummary === undefined
    ? undefined
    : toValue(options.includeChangeSummary);
  return explicit ?? Boolean(options.getChangeFlags);
}

export function useClinicalResultUserLogController(
  options: ClinicalResultUserLogControllerOptions,
): ClinicalResultUserLogController {
  const firstUserLogSnapshot = ref<ConsultationUserLogSnapshot | null>(null);

  function resolvePatient(): Patient | AppPatient | null {
    if (options.patient === undefined) {
      return null;
    }
    return toValue(options.patient) || null;
  }

  function buildBaseInput(): Pick<ClinicalResultUserLogSubmitInput, 'consultationId' | 'consultationType' | 'patient'> {
    return {
      consultationId: toValue(options.consultationId),
      consultationType: toValue(options.consultationType),
      patient: resolvePatient(),
    };
  }

  function buildChangeSummary(finalSnapshot: ConsultationUserLogSnapshot): ConsultationChangeSummary | undefined {
    const firstSnapshot = firstUserLogSnapshot.value;
    if (!firstSnapshot || !shouldBuildChangeSummary(options)) {
      return undefined;
    }
    return computeChangeSummary(firstSnapshot, finalSnapshot, options.getChangeFlags?.());
  }

  function submitGeneratedUserLog(): void {
    const snapshot = options.buildSnapshot();
    firstUserLogSnapshot.value = snapshot;
    void options.submit({
      ...buildBaseInput(),
      firstSnapshot: snapshot,
    });
  }

  function submitFinalLikeUserLog(abandoned: boolean): void {
    const finalSnapshot = options.buildSnapshot();
    void options.submit({
      ...buildBaseInput(),
      finalSnapshot,
      selectionSnapshot: buildConsultationSelectionSnapshot(finalSnapshot),
      changeSummary: buildChangeSummary(finalSnapshot),
      abandoned: abandoned || undefined,
    });
  }

  function submitFinalUserLog(): void {
    submitFinalLikeUserLog(false);
  }

  function submitAbandonedUserLog(): void {
    submitFinalLikeUserLog(true);
  }

  function resetFirstSnapshot(): void {
    firstUserLogSnapshot.value = null;
  }

  return {
    firstUserLogSnapshot,
    resetFirstSnapshot,
    submitGeneratedUserLog,
    submitFinalUserLog,
    submitAbandonedUserLog,
  };
}
