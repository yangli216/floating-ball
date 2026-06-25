import {
  readFirstString,
  type AvailableMedicineInventoryCatalogItem,
  type ClinicalResultTreatment,
} from '@features/clinical-result';
import { medicalDataService } from '@/services/medicalData';

export interface ParsedMedication {
  dosage?: string;
  dosageUnit?: string;
  frequency?: string;
  route?: string;
  days?: string;
  totalQty?: string;
  totalUnit?: string;
}

export function parseHistoricalMedication(medicationText: string): ParsedMedication {
  const result: ParsedMedication = {};
  if (!medicationText) return result;

  const text = medicationText.trim();

  // 1. 每次剂量与单位
  // 优先匹配类似 "一次1.5粒"、"每次 2片"、"首剂 2片" 这种明确的剂量描述
  const doseMatch = text.match(/(?:一次|每次)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\u4e00-\u9fa5]+)?/u);
  if (doseMatch) {
    result.dosage = doseMatch[1];
    if (doseMatch[2]) {
      const possibleUnit = doseMatch[2].trim();
      const nonUnits = [
        '口服', '外用', '吸入', '一日', '每天', '一次', '一日一次', '一日二次', '一日三次', '一日四次',
        '一日1次', '一日2次', '一日3次', '一日4次', 'qd', 'bid', 'tid', 'qid'
      ];
      if (!nonUnits.some(nu => possibleUnit.includes(nu))) {
        result.dosageUnit = possibleUnit;
      }
    }
  }

  // 2. 频次
  // 例如 "一日3次"、"每日2次"、"qd" 等
  const freqMatch = text.match(/(一日\s*\d+\s*次|每日\s*\d+\s*次|一天\s*\d+\s*次|qd|bid|tid|qid|qn|prn)/iu);
  if (freqMatch) {
    result.frequency = freqMatch[1].trim();
  } else {
    const cnFreqMatch = text.match(/(一日一次|一日两次|一日三次|一日四次|每日一次|每日两次|每日三次|每日四次)/u);
    if (cnFreqMatch) {
      result.frequency = cnFreqMatch[1];
    }
  }

  // 3. 用药途径/给药方法
  // 例如 "口服"、"外用"、"吸入"、"舌下含服" 等
  const routeMatch = text.match(/(口服|外用|吸入|皮下注射|肌肉注射|静脉注射|静脉滴注|舌下含服|塞肛|纳肛|喷雾)/u);
  if (routeMatch) {
    result.route = routeMatch[1];
  }

  // 4. 天数
  // 例如 "30天"、"14天"
  const daysMatch = text.match(/(\d+)\s*天/u);
  if (daysMatch) {
    result.days = daysMatch[1];
  }

  // 5. 总量和总量单位
  // 例如 "共2盒"、"总量 3瓶" 或者末尾的 "2盒"
  const totalMatch = text.match(/(?:总量|共|发药|给)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\u4e00-\u9fa5]+)?/u);
  if (totalMatch) {
    result.totalQty = totalMatch[1];
    if (totalMatch[2]) {
      result.totalUnit = totalMatch[2].trim();
    }
  } else {
    // 末尾兜底匹配，例如 "阿莫西林胶囊 ... 2盒"
    const trailingTotalMatch = text.match(/(\d+(?:\.\d+)?)\s*(盒|瓶|袋|支|包|贴|罐|片|粒|丸)$/u);
    if (trailingTotalMatch) {
      result.totalQty = trailingTotalMatch[1];
      result.totalUnit = trailingTotalMatch[2];
    }
  }

  return result;
}

function normalizeMedicineName(value: string): string {
  return value
    .replace(/^[\s☆★*·•]+/u, '')
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/\d+(?:\.\d+)?\s*(?:μg|ug|mg|g|ml|片|粒|支|盒|瓶|袋)/giu, '')
    .replace(/[\s,，、;；:：\-_/]/gu, '')
    .toLowerCase();
}

function findInventoryMatch(
  medication: string,
  inventory: AvailableMedicineInventoryCatalogItem[],
): AvailableMedicineInventoryCatalogItem | null {
  const normalizedMedication = normalizeMedicineName(medication);
  if (!normalizedMedication) return null;

  const exact = inventory.find((item) => normalizeMedicineName(item.productName) === normalizedMedication);
  if (exact) return exact;

  return inventory.find((item) => {
    const normalizedInventoryName = normalizeMedicineName(item.productName);
    return normalizedInventoryName.length >= 4
      && normalizedMedication.length >= 4
      && (
        normalizedMedication.includes(normalizedInventoryName)
        || normalizedInventoryName.includes(normalizedMedication)
      );
  }) || null;
}

export function buildChronicRefillInventoryTreatments(
  historicalMedications: string[],
  inventory: AvailableMedicineInventoryCatalogItem[],
  standardizeMedicineName: (value: string) => string = (value) => value,
): ClinicalResultTreatment[] {
  const seen = new Set<string>();
  const treatments: ClinicalResultTreatment[] = [];

  historicalMedications.forEach((medication) => {
    const matched = findInventoryMatch(medication, inventory);
    if (!matched) {
      const standardName = standardizeMedicineName(medication).trim();
      const fallbackKey = `fallback:${normalizeMedicineName(standardName)}`;
      if (!standardName || seen.has(fallbackKey)) return;
      seen.add(fallbackKey);
      treatments.push({
        type: 'medicine',
        name: standardName,
        text: '当前有效库存无同品或合适等效药，保留规范通用名供医生参考',
        evidenceText: `历史用药：${medication}；当前有效库存未匹配`,
        sourceType: 'explicit',
        matchStatus: 'unmatched',
        selected: false,
        reason: '院内无库存参考，不能直接回写处方',
        matchedItem: null,
      });
      return;
    }
    if (seen.has(matched.productId)) return;
    seen.add(matched.productId);

    // 对接本地院内标准药品目录数据
    const dictMatch = medicalDataService.matchMedicine(matched.productName);
    const parsed = parseHistoricalMedication(medication);

    // 合理填充剂量、天数、频次、用法及总量等字段
    const dosage = parsed.dosage 
      || readFirstString(dictMatch?.raw, ['dftDoseOnce']) 
      || '1';
    const dosageUnit = parsed.dosageUnit 
      || readFirstString(dictMatch?.raw, ['unitDose', 'unitPre'])
      || matched.unit
      || '片';

    const frequency = parsed.frequency 
      || readFirstString(dictMatch?.raw, ['dftFreq'])
      || '';
    const route = parsed.route 
      || readFirstString(dictMatch?.raw, ['dftUsage'])
      || '';

    const days = parsed.days || '14';
    const totalQty = parsed.totalQty || '';
    const totalUnit = parsed.totalUnit 
      || readFirstString(dictMatch?.raw, ['unitSale']) 
      || matched.unit 
      || '';

    treatments.push({
      type: 'medicine',
      name: matched.productName,
      spec: matched.spec || '',
      text: `历史慢病处方药品，当前可用库存${matched.availableQuantity}${matched.unit || ''}`,
      evidenceText: `历史用药：${medication}；当前药房有效库存可用`,
      sourceType: 'explicit',
      matchStatus: 'exact',
      selected: true,
      reason: '历史慢病处方药品，且当前发药药房存在有效库存',
      dosage,
      dosageUnit,
      frequency,
      route,
      days,
      totalQty,
      totalUnit,
      matchedItem: {
        id: matched.productId,
        name: matched.productName,
        spec: matched.spec,
        storeIds: matched.storeIds,
        raw: {
          idMedPro: matched.productId,
          storeIds: matched.storeIds,
          ...(dictMatch?.raw || {}), // 合并完整的字典属性，供后续 normalize 使用
        },
      },
    });
  });

  return treatments;
}
