import type { TreatmentRecommendation } from '@/types/consultation';
import type { UsageOption } from '@/utils/medicalDictionaryHelpers';
import { createUsageOption, normalizeUsageKeyword } from '@/utils/medicalDictionaryHelpers';

export type MedicinePrimaryField = 'dosage' | 'frequency' | 'route' | 'total';

export function formatUsageOptionLabel(option: UsageOption): string {
  const text = option.text.trim();
  const key = option.key.trim();
  if (!key || key === text || text.includes(key)) {
    return text;
  }
  return `${text}(${key})`;
}

export function resolveUsageFilterKeyword(keyword: string, currentValue?: string): string {
  const normalizedKeyword = normalizeUsageKeyword(keyword);
  if (!normalizedKeyword) {
    return '';
  }

  const normalizedCurrentValue = normalizeUsageKeyword((currentValue || '').trim());
  if (normalizedCurrentValue && normalizedKeyword === normalizedCurrentValue) {
    return '';
  }

  return normalizedKeyword;
}

export function findUsageOptionByValue(
  options: UsageOption[],
  value?: string,
): UsageOption | undefined {
  const normalizedValue = (value || '').trim();
  if (!normalizedValue) {
    return undefined;
  }

  return options.find((option) => option.text === normalizedValue || option.key === normalizedValue);
}

export function getUsageDisplayValue(
  options: UsageOption[],
  value?: string,
): string {
  const normalizedValue = (value || '').trim();
  if (!normalizedValue) {
    return '';
  }

  const matchedOption = findUsageOptionByValue(options, normalizedValue);
  if (matchedOption) {
    return formatUsageOptionLabel(matchedOption);
  }

  return normalizedValue;
}

export function getMedicineFieldDisplay(
  rec: TreatmentRecommendation,
  field: MedicinePrimaryField,
  frequencyOptions: UsageOption[],
): string {
  switch (field) {
    case 'dosage':
      return [rec.dosage, rec.dosageUnit].filter(Boolean).join(' ') || '点击填写';
    case 'frequency':
      return getUsageDisplayValue(frequencyOptions, rec.frequency) || '点击选择';
    case 'route':
      return rec.route || '点击选择';
    case 'total':
      return [
        [rec.totalQty, rec.totalUnit].filter(Boolean).join(' '),
        rec.days ? `${rec.days}天` : '',
      ].filter(Boolean).join(' / ') || '点击填写';
  }
}

export function getMedicineCollapsedSummary(
  rec: TreatmentRecommendation,
  frequencyOptions: UsageOption[],
): string {
  const parts = [
    rec.dosage || rec.dosageUnit
      ? [rec.dosage, rec.dosageUnit].filter(Boolean).join('')
      : '',
    rec.frequency ? getUsageDisplayValue(frequencyOptions, rec.frequency) : '',
    rec.route || '',
    [
      [rec.totalQty, rec.totalUnit].filter(Boolean).join(''),
      rec.days ? `${rec.days}天` : '',
    ].filter(Boolean).join('/'),
  ].filter(Boolean);

  return parts.join(' · ') || '点击展开设置用法用量';
}

export function filterUsageOptions(
  options: UsageOption[],
  keyword: string,
  currentValue?: string,
): UsageOption[] {
  const normalizedCurrentValue = (currentValue || '').trim();
  const query = resolveUsageFilterKeyword(keyword, normalizedCurrentValue);
  const matchedOptions = !query
    ? options
    : options.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (normalizedCurrentValue && !matchedOptions.some((option) => option.text === normalizedCurrentValue)) {
    return [
      createUsageOption({ key: normalizedCurrentValue, text: normalizedCurrentValue }),
      ...matchedOptions,
    ];
  }

  return matchedOptions;
}

export function resolveUsageValueFromKeyword(input: {
  keyword: string;
  options: UsageOption[];
  filteredOptions: UsageOption[];
  fallbackValue?: string;
}): string {
  const keyword = input.keyword.trim();
  if (!keyword) {
    return '';
  }

  const normalizedKeyword = normalizeUsageKeyword(keyword);
  const exactTextMatch = input.options.find((option) => option.text === keyword);
  if (exactTextMatch) {
    return exactTextMatch.text;
  }

  const exactTokenMatch = input.options.find((option) => option.normalizedTokens.includes(normalizedKeyword));
  if (exactTokenMatch) {
    return exactTokenMatch.text;
  }

  if (input.filteredOptions.length === 1) {
    return input.filteredOptions[0].text;
  }

  return input.fallbackValue || '';
}

export function resolveUsageKeyFromKeyword(input: {
  keyword: string;
  options: UsageOption[];
  filteredOptions: UsageOption[];
  fallbackKey?: string;
}): string {
  const keyword = input.keyword.trim();
  if (!keyword) {
    return '';
  }

  const normalizedKeyword = normalizeUsageKeyword(keyword);
  const exactTextMatch = input.options.find((option) => option.text === keyword);
  if (exactTextMatch) {
    return exactTextMatch.key;
  }

  const exactTokenMatch = input.options.find((option) => option.normalizedTokens.includes(normalizedKeyword));
  if (exactTokenMatch) {
    return exactTokenMatch.key;
  }

  if (input.filteredOptions.length === 1) {
    return input.filteredOptions[0].key;
  }

  return input.fallbackKey || '';
}
