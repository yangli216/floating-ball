/**
 * 医学字典辅助工具：频次 / 用法 / 执行科室选项的纯函数与类型
 *
 * 与 `useMedicalDictionaries` 配合使用：
 * - 此文件仅包含纯函数与类型，可在任何位置（组件、composable、services）安全 import；
 * - composable 在此基础上封装 reactive state + HIS 加载逻辑；
 * - 字典选项的本地默认列表（默认频次、默认用法）也定义在此处，便于不同入口共享同一基线。
 */

export interface UsageOption {
  key: string;
  text: string;
  py: string;
  wb: string;
  mcode: string;
  execCount?: number;
  normalizedTokens: string[];
}

export interface ExecDeptOption {
  key: string;
  text: string;
}

export function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function inferExecCountFromFrequencyText(text: string): number | null {
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) {
    return null;
  }

  if (normalizedText === 'qd' || normalizedText.includes('每天一次') || normalizedText.includes('每日一次')) {
    return 1;
  }
  if (normalizedText === 'bid' || normalizedText.includes('每天两次') || normalizedText.includes('每日两次')) {
    return 2;
  }
  if (normalizedText === 'tid' || normalizedText.includes('每天三次') || normalizedText.includes('每日三次')) {
    return 3;
  }
  if (normalizedText === 'qid' || normalizedText.includes('每天四次') || normalizedText.includes('每日四次')) {
    return 4;
  }
  if (normalizedText.includes('隔日一次')) {
    return 0.5;
  }

  const timesPerDayMatch = normalizedText.match(/每[日天]\D*(\d+(?:\.\d+)?)\D*次/);
  if (timesPerDayMatch?.[1]) {
    return parsePositiveNumber(timesPerDayMatch[1]);
  }

  const intervalMatch = normalizedText.match(/q(\d+(?:\.\d+)?)h/);
  if (intervalMatch?.[1]) {
    const hours = parsePositiveNumber(intervalMatch[1]);
    if (hours) {
      return 24 / hours;
    }
  }

  return null;
}

export function normalizeUsageKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function createUsageOption(item: {
  key?: string;
  text?: string;
  py?: string;
  wb?: string;
  mcode?: string;
  properties?: Record<string, unknown>;
  execCount?: number | string;
}): UsageOption {
  const text = (item.text || '').trim();
  const py = (item.py || '').trim();
  const wb = (item.wb || '').trim();
  const mcode = (item.mcode || '').trim();
  const key = (item.key || text).trim();
  const execCount = parsePositiveNumber(item.execCount ?? item.properties?.execCount) ?? inferExecCountFromFrequencyText(text) ?? undefined;

  return {
    key,
    text,
    py,
    wb,
    mcode,
    execCount,
    normalizedTokens: Array.from(new Set(
      [text, py, wb, mcode, key]
        .map(normalizeUsageKeyword)
        .filter(Boolean)
    )),
  };
}

export function dedupeUsageOptions(items: UsageOption[]): UsageOption[] {
  const unique = new Map<string, UsageOption>();

  items.forEach((item) => {
    if (!item.text) return;

    const identity = item.key || item.text;
    if (!unique.has(identity)) {
      unique.set(identity, item);
    }
  });

  return Array.from(unique.values());
}

export function dedupeExecDeptOptions(items: Array<{ key?: string; text?: string }>): ExecDeptOption[] {
  const unique = new Map<string, ExecDeptOption>();

  items.forEach((item) => {
    const key = (item.key || item.text || '').trim();
    const text = (item.text || item.key || '').trim();
    if (!key || !text || unique.has(key)) {
      return;
    }
    unique.set(key, { key, text });
  });

  return Array.from(unique.values());
}

/** 默认频次字典：HIS 字典缺失时使用 */
export const DEFAULT_FREQUENCY_OPTIONS: UsageOption[] = dedupeUsageOptions([
  createUsageOption({ key: '每天一次', text: '每天一次', execCount: 1 }),
  createUsageOption({ key: '每天两次', text: '每天两次', execCount: 2 }),
  createUsageOption({ key: '每天三次', text: '每天三次', execCount: 3 }),
  createUsageOption({ key: '隔日一次', text: '隔日一次', execCount: 0.5 }),
  createUsageOption({ key: '每周一次', text: '每周一次' }),
  createUsageOption({ key: '每周两次', text: '每周两次' }),
  createUsageOption({ key: '必要时', text: '必要时' }),
  createUsageOption({ key: '立即', text: '立即', execCount: 1 }),
]);

/** 默认用法字典：HIS 字典缺失时使用 */
export const DEFAULT_ROUTE_OPTIONS: UsageOption[] = dedupeUsageOptions([
  createUsageOption({ key: '口服', text: '口服', py: 'kf' }),
  createUsageOption({ key: '静脉注射', text: '静脉注射', py: 'jmzs' }),
  createUsageOption({ key: '肌肉注射', text: '肌肉注射', py: 'jrzs' }),
  createUsageOption({ key: '皮下注射', text: '皮下注射', py: 'pxzs' }),
  createUsageOption({ key: '外用', text: '外用', py: 'wy' }),
  createUsageOption({ key: '雾化吸入', text: '雾化吸入', py: 'whxr' }),
  createUsageOption({ key: '舌下含服', text: '舌下含服', py: 'sxhf' }),
  createUsageOption({ key: '直肠给药', text: '直肠给药', py: 'zcgy' }),
  createUsageOption({ key: '滴眼', text: '滴眼', py: 'dy' }),
]);
