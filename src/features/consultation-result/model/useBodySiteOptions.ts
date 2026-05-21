import type { TreatmentRecommendation } from '@/types/consultation';
import type { MedicalItemPartOption } from '@/services/his/types';
import {
  getMatchedItemRaw,
  readFirstString,
} from '@features/clinical-result';

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

  function markMedicalItemPartOptionsLoaded(rec: TreatmentRecommendation): void {
    rec.matchedItem = {
      ...(rec.matchedItem || {}),
      raw: {
        ...(getMatchedItemRaw(rec) || {}),
        __partOptionsLoaded: true,
      },
    };
  }

  function applyMedicalItemPartOptions(rec: TreatmentRecommendation, options: MedicalItemPartOption[]): void {
    if (rec.type !== 'exam') {
      return;
    }

    rec.bodySiteOptions = options;
    markMedicalItemPartOptionsLoaded(rec);
    if (options.length === 0) {
      return;
    }

    const currentPartId = (
      rec.bodySiteId
      || rec.matchedItem?.idPart
      || readFirstString(getMatchedItemRaw(rec), ['idPart'])
    ).trim();
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

export type BodySiteOptions = ReturnType<typeof useBodySiteOptions>;
