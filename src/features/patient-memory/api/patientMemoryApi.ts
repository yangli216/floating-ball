import { regionalPost } from '@services/regionalClient';
import type {
  PatientMemoryResolveResponse,
  PatientMemorySyncRequest,
  PatientMemorySyncResponse,
} from '@entities/patient-memory';

export function syncPatientMemory(request: PatientMemorySyncRequest): Promise<PatientMemorySyncResponse> {
  return regionalPost<PatientMemorySyncResponse>('/v1/client/patient-memory/sync', request);
}

export function resolvePatientMemory(input: {
  patientId: string;
  hisOrgId?: string;
  knownMemoryVersion?: number;
}): Promise<PatientMemoryResolveResponse> {
  return regionalPost<PatientMemoryResolveResponse>('/v1/client/patient-memory/resolve', input);
}
