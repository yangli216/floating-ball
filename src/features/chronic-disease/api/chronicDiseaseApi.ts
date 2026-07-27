import { getHisAdapter } from '@/services/his';
import type { TcdVisitForm } from '../types';

export function saveTcdForm(form: TcdVisitForm): Promise<unknown> {
  const adapter = getHisAdapter();
  if (!adapter) {
    return Promise.reject(new Error('HIS 尚未初始化，无法保存两慢病随访'));
  }
  return adapter.saveTcdForm(form);
}
