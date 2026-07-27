import { emitTo } from '@tauri-apps/api/event';
import { getHisAdapter } from '@/services/his';
import {
  CHRONIC_DISEASE_SAVE_RESULT_EVENT,
  CHRONIC_DISEASE_WINDOW_LABEL,
  type ChronicDiseaseSaveRequest,
  type ChronicDiseaseSaveResult,
} from './chronicDiseaseWindowContract';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const message = String(error || '').trim();
  return message || '两慢病随访保存失败';
}

export async function handleTcdFormSaveRequest(
  request: ChronicDiseaseSaveRequest,
): Promise<void> {
  let result: ChronicDiseaseSaveResult;
  try {
    const adapter = getHisAdapter();
    if (!adapter) {
      throw new Error('HIS 尚未初始化，无法保存两慢病随访');
    }
    const data = await adapter.saveTcdForm(request.form);
    result = {
      requestId: request.requestId,
      ok: true,
      data,
    };
  } catch (error) {
    result = {
      requestId: request.requestId,
      ok: false,
      error: getErrorMessage(error),
    };
  }

  await emitTo(
    CHRONIC_DISEASE_WINDOW_LABEL,
    CHRONIC_DISEASE_SAVE_RESULT_EVENT,
    result,
  );
}
