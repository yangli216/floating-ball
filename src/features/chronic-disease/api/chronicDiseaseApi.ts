import { regionalPost } from '@/services/regionalClient';
import type {
  ChronicArtifactSnapshotRequest,
  ChronicArtifactSnapshotResponse,
  ChronicDiseaseFollowUpRequest,
  ChronicDiseaseFollowUpResponse,
} from '../types';

export function saveChronicDiseaseFollowUp(
  request: ChronicDiseaseFollowUpRequest,
  requestId: string,
): Promise<ChronicDiseaseFollowUpResponse> {
  return regionalPost<ChronicDiseaseFollowUpResponse>(
    '/v1/client/chronic-disease/follow-ups',
    request,
    requestId,
  );
}

export function saveChronicArtifactSnapshot(
  request: ChronicArtifactSnapshotRequest,
): Promise<ChronicArtifactSnapshotResponse> {
  return regionalPost<ChronicArtifactSnapshotResponse>(
    '/v1/client/chronic-disease/artifact-snapshots',
    request,
  );
}
