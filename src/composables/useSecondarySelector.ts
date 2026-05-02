/**
 * useSecondarySelector: 治疗推荐卡片"二级搜索下拉"统一状态。
 *
 * 抽自语音问诊 (`VoiceConsultationNew.vue`) 的 pharmacy/execDept/bodySite/insurance 四个搜索下拉，
 * 统一管理：
 * - `activeKey`：当前展开的（rec, field）；同一时间只有一个。
 * - 每条 rec × field 的 keyword 缓存（用户在搜索框里临时输入的过滤词）。
 * - open / close / isOpen / sync / setKeyword / handleInput / resetAll。
 * - 通用过滤辅助 `resolveFilterKeyword`（normalizeUsageKeyword + 与当前值相同则视为空）。
 *
 * 调用方提供 `getEditorKey(rec)`（与原 voice 实现一致用 `getTreatmentEditorKey`），
 * 与每个 field 的 `getCurrentValue(rec)` 用于 sync 时回写当前 rec.xxx。
 */

import { ref } from 'vue';
import type { TreatmentRecommendation } from '../types/consultation';
import { normalizeUsageKeyword } from '../utils/medicalDictionaryHelpers';

export type SecondarySelectorField = 'pharmacy' | 'execDept' | 'bodySite' | 'insurance';

export interface SecondarySelectorFieldSpec {
  /** 给定 rec，从业务字段读出当前值。用于 sync 时把搜索框还原成"当前已选" */
  getCurrentValue: (rec: TreatmentRecommendation) => string;
}

interface Options {
  getEditorKey: (rec: TreatmentRecommendation) => string;
  fields: Record<SecondarySelectorField, SecondarySelectorFieldSpec>;
}

export function useSecondarySelector(options: Options) {
  const { getEditorKey, fields } = options;

  const activeKey = ref<string | null>(null);
  // 每个 field 一份独立的 keyword 缓存
  const keywordMaps: Record<SecondarySelectorField, Record<string, string>> = {
    pharmacy: {},
    execDept: {},
    bodySite: {},
    insurance: {},
  };

  function getKey(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
    return `${getEditorKey(rec)}:${field}`;
  }

  function getSearchKey(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
    return `${getEditorKey(rec)}:${field}-search`;
  }

  function isOpen(rec: TreatmentRecommendation, field: SecondarySelectorField): boolean {
    return activeKey.value === getKey(rec, field);
  }

  function syncKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField): void {
    const value = fields[field].getCurrentValue(rec) || '';
    keywordMaps[field][getSearchKey(rec, field)] = value;
  }

  function setKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField, value: string): void {
    keywordMaps[field][getSearchKey(rec, field)] = value;
  }

  function getKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
    const cached = keywordMaps[field][getSearchKey(rec, field)];
    if (typeof cached === 'string') return cached;
    return fields[field].getCurrentValue(rec) || '';
  }

  function handleInput(rec: TreatmentRecommendation, field: SecondarySelectorField, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    setKeyword(rec, field, target?.value || '');
  }

  function open(rec: TreatmentRecommendation, field: SecondarySelectorField): void {
    activeKey.value = getKey(rec, field);
    syncKeyword(rec, field);
  }

  function close(rec: TreatmentRecommendation, field: SecondarySelectorField, event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement | null;
    const nextTarget = event.relatedTarget as Node | null;
    if (container && nextTarget && container.contains(nextTarget)) return;
    syncKeyword(rec, field);
    if (isOpen(rec, field)) {
      activeKey.value = null;
    }
  }

  function closeAll(): void {
    activeKey.value = null;
  }

  function resetAll(): void {
    activeKey.value = null;
    (Object.keys(keywordMaps) as SecondarySelectorField[]).forEach((field) => {
      keywordMaps[field] = {};
    });
  }

  /**
   * 通用过滤词解析：当用户输入的关键字与"当前选中值"相同时，视为未输入（避免列表只剩自己）。
   */
  function resolveFilterKeyword(keyword: string, currentValue?: string): string {
    const normalizedKeyword = normalizeUsageKeyword(keyword);
    if (!normalizedKeyword) return '';
    const normalizedCurrent = normalizeUsageKeyword((currentValue || '').trim());
    if (normalizedCurrent && normalizedKeyword === normalizedCurrent) return '';
    return normalizedKeyword;
  }

  return {
    activeKey,
    isOpen,
    open,
    close,
    closeAll,
    getKeyword,
    setKeyword,
    syncKeyword,
    handleInput,
    resetAll,
    resolveFilterKeyword,
  };
}

export type SecondarySelector = ReturnType<typeof useSecondarySelector>;
