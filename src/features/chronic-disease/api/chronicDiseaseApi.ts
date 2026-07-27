import { regionalPost } from '@/services/regionalClient';
import { getHisAdapter } from '@/services/his';
import type {
  ChronicArtifactSnapshotRequest,
  ChronicArtifactSnapshotResponse,
  TcdVisitForm,
} from '../types';

export function saveTcdForm(form: TcdVisitForm): Promise<unknown> {
  const adapter = getHisAdapter();
  if (!adapter) {
    return Promise.reject(new Error('HIS 尚未初始化，无法保存两慢病随访'));
  }
  return adapter.saveTcdForm(form);
}

export function saveChronicArtifactSnapshot(
  request: ChronicArtifactSnapshotRequest,
): Promise<ChronicArtifactSnapshotResponse> {
  return regionalPost<ChronicArtifactSnapshotResponse>(
    '/v1/client/chronic-disease/artifact-snapshots',
    request,
  );
}
