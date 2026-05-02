import type { TreatmentRecommendation } from '../types/consultation';
import type { MedicalItemPartOption } from '../services/his/types';
import { getMatchedItemRaw, readFirstString } from '../utils/recordConfirmedPayload';

/**
 * 检查项目（exam）部位选项的统一处理：
 * - applyMedicalItemPartOption：把单个部位选项落到 rec 上（同步 bodySite/bodySiteId/matchedItem.idPart 与 raw）。
 * - applyMedicalItemPartOptions：批量装载部位选项；优先匹配当前已选 partId，否则单选项时自动应用。
 *
 * 业务侧无副作用——HIS 拉取由调用方完成（`his.fetchMedicalItemPartOptions(idCli)`），本 composable 只负责把结果正确落到 rec。
 */
export function useBodySiteOptions() {
  function applyMedicalItemPartOption(rec: TreatmentRecommendation, option: MedicalItemPartOption): void {
    const partId = (option.partId || '').trim();
    const name = (option.name || option.partAndWay || '').trim();
    if (!partId && !name) {
      return;
    }

    const mergedRaw = {
      ...(getMatchedItemRaw(rec) || {}),
      ...option.raw,
      idPart: partId,
      partAndWay: option.partAndWay || name,
      sdPartAndWay: option.partAndWayCode || '',
      __partOptionsLoaded: true,
    };

    rec.bodySiteId = partId;
    rec.bodySite = name;
    rec.matchedItem = {
      ...(rec.matchedItem || {}),
      idPart: partId,
      raw: mergedRaw,
    };
  }

  function applyMedicalItemPartOptions(rec: TreatmentRecommendation, options: MedicalItemPartOption[]): void {
    if (rec.type !== 'exam') {
      return;
    }

    rec.bodySiteOptions = options;
    if (options.length === 0) {
      return;
    }

    const currentPartId = (rec.bodySiteId || rec.matchedItem?.idPart || readFirstString(getMatchedItemRaw(rec), ['idPart'])).trim();
    const matchedCurrent = currentPartId ? options.find((option) => option.partId === currentPartId) : undefined;
    if (matchedCurrent) {
      applyMedicalItemPartOption(rec, matchedCurrent);
      return;
    }

    if (options.length === 1) {
      applyMedicalItemPartOption(rec, options[0]);
    }
  }

  return {
    applyMedicalItemPartOption,
    applyMedicalItemPartOptions,
  };
}
