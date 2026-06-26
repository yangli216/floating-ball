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
  consultationRoundId: string;
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
  personalHistoryChanged?: boolean;
  familyHistoryChanged?: boolean;
  physicalExamChanged?: boolean;
  precautionsChanged?: boolean;
}

export type ClinicalResultUserLogSubmit = (
  input: ClinicalResultUserLogSubmitInput,
) => Promise<void> | void;

export interface ClinicalResultUserLogControllerOptions {
  consultationId: MaybeRefOrGetter<string>;
  consultationRoundId: MaybeRefOrGetter<string | null | undefined>;
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
  submitAbandonedUserLog: () => Promise<void>;
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

  function buildBaseInput(): Pick<ClinicalResultUserLogSubmitInput, 'consultationId' | 'consultationRoundId' | 'consultationType' | 'patient'> {
    return {
      consultationId: toValue(options.consultationId),
      consultationRoundId: toValue(options.consultationRoundId) || '',
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

  function submitFinalLikeUserLog(abandoned: boolean): Promise<void> {
    const finalSnapshot = options.buildSnapshot();
    return Promise.resolve(options.submit({
      ...buildBaseInput(),
      finalSnapshot,
      selectionSnapshot: buildConsultationSelectionSnapshot(finalSnapshot),
      changeSummary: buildChangeSummary(finalSnapshot),
      abandoned: abandoned || undefined,
    }));
  }

  function submitFinalUserLog(): void {
    void submitFinalLikeUserLog(false);
  }

  function submitAbandonedUserLog(): Promise<void> {
    return submitFinalLikeUserLog(true);
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
