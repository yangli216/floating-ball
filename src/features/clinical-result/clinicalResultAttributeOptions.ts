import type { TreatmentRecommendation } from '@/types/consultation';
import type { PharmacyOption } from '@/services/his';
import type { ExecDeptOption, UsageOption } from '@/utils/medicalDictionaryHelpers';
import { createUsageOption, dedupeUsageOptions } from '@/utils/medicalDictionaryHelpers';
import { resolveUsageFilterKeyword } from './clinicalResultUsageFields';

export function buildPharmacyUsageOptions(pharmacies: PharmacyOption[]): UsageOption[] {
  return dedupeUsageOptions(
    pharmacies.map((option) => createUsageOption({
      key: option.idSto || option.idDept || option.name,
      text: option.name,
      mcode: option.idDept,
    })),
  );
}

export function buildExecDeptUsageOptions(options: ExecDeptOption[]): UsageOption[] {
  return dedupeUsageOptions(
    options.map((option) => createUsageOption({
      key: option.key,
      text: option.text,
      mcode: option.key,
    })),
  );
}

export function buildBodySiteUsageOptions(rec: TreatmentRecommendation): UsageOption[] {
  return dedupeUsageOptions((rec.bodySiteOptions || []).map((option) => createUsageOption({
    key: option.partId || option.name,
    text: option.name,
    mcode: option.partAndWayCode || option.partAndWay,
  })));
}

export function buildInsuranceUsageOptions(options: string[]): UsageOption[] {
  return dedupeUsageOptions(
    options.map((option) => createUsageOption({ key: option, text: option })),
  );
}

export function filterAttributeOptions(input: {
  options: UsageOption[];
  keyword: string;
  currentValue?: string;
  fallbackKey?: string;
}): UsageOption[] {
  const currentValue = (input.currentValue || '').trim();
  const query = resolveUsageFilterKeyword(input.keyword, currentValue);
  const matched = !query
    ? input.options
    : input.options.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (currentValue && !matched.some((option) => option.text === currentValue)) {
    return [
      createUsageOption({ key: input.fallbackKey || currentValue, text: currentValue }),
      ...matched,
    ];
  }

  return matched;
}
