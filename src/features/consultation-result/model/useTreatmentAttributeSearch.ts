import type { TreatmentRecommendation } from '@/types/consultation';
import type { PharmacyOption } from '@/services/his';
import type { ExecDeptOption, UsageOption } from '@/utils/medicalDictionaryHelpers';
import {
  buildBodySiteUsageOptions,
  buildExecDeptUsageOptions,
  buildInsuranceUsageOptions,
  buildPharmacyUsageOptions,
  filterAttributeOptions,
} from '@features/clinical-result';
import type { SecondarySelector, SecondarySelectorField } from './useSecondarySelector';

export interface TreatmentAttributeSearchOptions {
  secondarySelector: SecondarySelector;
  pharmacyOptions: () => PharmacyOption[];
  execDeptOptions: () => ExecDeptOption[];
  insuranceOptions?: () => string[];
  getCandidatePharmaciesForMedicine: (rec?: TreatmentRecommendation) => PharmacyOption[];
  getNormalizedPharmacyValue: (rec: TreatmentRecommendation) => string;
}

const DEFAULT_INSURANCE_OPTIONS = ['医保使用', '自费'];

export function useTreatmentAttributeSearch(options: TreatmentAttributeSearchOptions) {
  const {
    secondarySelector,
    getCandidatePharmaciesForMedicine,
    getNormalizedPharmacyValue,
  } = options;

  function getSearchKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
    return secondarySelector.getKeyword(rec, field);
  }

  function setSearchKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField, value: string): void {
    secondarySelector.setKeyword(rec, field, value);
  }

  function handleSearchInput(rec: TreatmentRecommendation, field: SecondarySelectorField, event: Event): void {
    secondarySelector.handleInput(rec, field, event);
  }

  function getPharmacyOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
    const currentValue = getNormalizedPharmacyValue(rec);
    const allowedPharmacies = rec.type === 'medicine' && rec.matchedItem
      ? getCandidatePharmaciesForMedicine(rec)
      : options.pharmacyOptions();

    return filterAttributeOptions({
      options: buildPharmacyUsageOptions(allowedPharmacies),
      keyword: getSearchKeyword(rec, 'pharmacy'),
      currentValue,
    });
  }

  function getExecDeptUsageOptions(): UsageOption[] {
    return buildExecDeptUsageOptions(options.execDeptOptions());
  }

  function getExecDeptOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
    const currentValue = getSearchKeyword(rec, 'execDept').trim();
    return filterAttributeOptions({
      options: getExecDeptUsageOptions(),
      keyword: getSearchKeyword(rec, 'execDept'),
      currentValue,
    });
  }

  function getBodySiteUsageOptions(rec: TreatmentRecommendation): UsageOption[] {
    return buildBodySiteUsageOptions(rec);
  }

  function getBodySiteOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
    const currentValue = (rec.bodySite || '').trim();
    return filterAttributeOptions({
      options: getBodySiteUsageOptions(rec),
      keyword: getSearchKeyword(rec, 'bodySite'),
      currentValue,
      fallbackKey: rec.bodySiteId || currentValue,
    });
  }

  function getInsuranceUsageOptions(): UsageOption[] {
    return buildInsuranceUsageOptions(options.insuranceOptions?.() || DEFAULT_INSURANCE_OPTIONS);
  }

  function getInsuranceOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
    const currentValue = (rec.insuranceType || '').trim();
    return filterAttributeOptions({
      options: getInsuranceUsageOptions(),
      keyword: getSearchKeyword(rec, 'insurance'),
      currentValue,
    });
  }

  return {
    getSearchKeyword,
    setSearchKeyword,
    handleSearchInput,
    getPharmacyOptionsForRecord,
    getExecDeptOptionsForRecord,
    getBodySiteOptionsForRecord,
    getInsuranceOptionsForRecord,
  };
}

export type TreatmentAttributeSearch = ReturnType<typeof useTreatmentAttributeSearch>;
