import type { PatientMemoryObservation } from '@entities/patient-memory';

interface PatientMemorySyncManifest {
  memoryVersion?: number;
  sources: Record<string, string>;
}

const MANIFEST_PREFIX = 'floating-ball:patient-memory:sync:v1';

function manifestKey(orgScope: string, patientId: string): string {
  return `${MANIFEST_PREFIX}:${encodeURIComponent(orgScope)}:${encodeURIComponent(patientId)}`;
}

export function readPatientMemorySyncManifest(orgScope: string, patientId: string): PatientMemorySyncManifest {
  try {
    const raw = localStorage.getItem(manifestKey(orgScope, patientId));
    if (!raw) return { sources: {} };
    const parsed = JSON.parse(raw) as Partial<PatientMemorySyncManifest>;
    return {
      memoryVersion: typeof parsed.memoryVersion === 'number' ? parsed.memoryVersion : undefined,
      sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
    };
  } catch {
    return { sources: {} };
  }
}

export function filterChangedPatientMemoryObservations(
  observations: PatientMemoryObservation[],
  manifest: PatientMemorySyncManifest,
): PatientMemoryObservation[] {
  return observations.filter((observation) => (
    !observation.sourceVersion
    || manifest.sources[observation.sourceKey] !== observation.sourceVersion
  ));
}

export function writePatientMemorySyncManifest(input: {
  orgScope: string;
  patientId: string;
  previous: PatientMemorySyncManifest;
  observations: PatientMemoryObservation[];
  rejectedSourceKeys: Set<string>;
  memoryVersion: number;
}): void {
  const sources = { ...input.previous.sources };
  for (const observation of input.observations) {
    if (!input.rejectedSourceKeys.has(observation.sourceKey) && observation.sourceVersion) {
      sources[observation.sourceKey] = observation.sourceVersion;
    }
  }
  try {
    localStorage.setItem(manifestKey(input.orgScope, input.patientId), JSON.stringify({
      memoryVersion: input.memoryVersion,
      sources,
    } satisfies PatientMemorySyncManifest));
  } catch {
    // 服务端仍按 payload hash 幂等；本地 manifest 不可写只会增加下次上传量。
  }
}

export type { PatientMemorySyncManifest };
