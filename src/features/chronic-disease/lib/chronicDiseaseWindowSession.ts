import type { ChronicDiseaseWindowPayload } from '../types';

export function buildChronicDiseaseViewKey(payload: ChronicDiseaseWindowPayload): string {
  return [
    payload.patientAnchor,
    payload.requestId,
    payload.kind,
    payload.diseaseType || '-',
  ].join(':');
}
