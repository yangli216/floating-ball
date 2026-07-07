import { ref, shallowReadonly } from 'vue';
import type { AppPatient } from '@/types/appState';
import type { PatientMemoryBrief } from '@entities/patient-memory';
import { getFeedbackActor } from '@services/feedbackContext';
import { getPatientContextId } from '@/utils/patientContext';
import { syncPatientMemory } from '../api/patientMemoryApi';
import { buildPatientMemorySyncRequest } from '../lib/patientMemoryPayload';
import {
  filterChangedPatientMemoryObservations,
  readPatientMemorySyncManifest,
  writePatientMemorySyncManifest,
} from './patientMemorySyncManifest';

export type PatientMemorySyncStatus = 'idle' | 'syncing' | 'ready' | 'error';

export function usePatientMemorySync() {
  const status = ref<PatientMemorySyncStatus>('idle');
  const brief = ref<PatientMemoryBrief | null>(null);
  const error = ref<unknown>(null);
  let requestSequence = 0;

  async function syncForPatient(patient: AppPatient | null): Promise<PatientMemoryBrief | null> {
    const patientId = getPatientContextId(patient);
    if (!patient || !patientId) {
      reset();
      return null;
    }

    const sequence = ++requestSequence;
    status.value = 'syncing';
    error.value = null;
    const actor = getFeedbackActor();
    const orgScope = actor.hisOrgId || actor.orgCode || 'default';
    const manifest = readPatientMemorySyncManifest(orgScope, patientId);

    try {
      const request = await buildPatientMemorySyncRequest({
        patient,
        hisOrgId: actor.hisOrgId,
        knownMemoryVersion: manifest.memoryVersion,
      });
      const changedObservations = filterChangedPatientMemoryObservations(request.observations, manifest);
      const response = await syncPatientMemory({
        ...request,
        observations: changedObservations,
      });
      if (sequence !== requestSequence) {
        return null;
      }

      const rejectedSourceKeys = new Set(
        response.rejected
          .map((item) => item.sourceKey || '')
          .filter(Boolean),
      );
      writePatientMemorySyncManifest({
        orgScope,
        patientId,
        previous: manifest,
        observations: changedObservations,
        rejectedSourceKeys,
        memoryVersion: response.memoryVersion,
      });
      brief.value = response.brief;
      status.value = 'ready';
      return response.brief;
    } catch (caught) {
      if (sequence === requestSequence) {
        error.value = caught;
        status.value = 'error';
      }
      throw caught;
    }
  }

  function reset(): void {
    requestSequence += 1;
    status.value = 'idle';
    brief.value = null;
    error.value = null;
  }

  return {
    status: shallowReadonly(status),
    brief: shallowReadonly(brief),
    error: shallowReadonly(error),
    syncForPatient,
    reset,
  };
}

export type PatientMemorySyncController = ReturnType<typeof usePatientMemorySync>;
