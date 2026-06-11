import type { Ref } from 'vue';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type {
  ExecDeptOption,
  UsageOption,
} from '@/utils/medicalDictionaryHelpers';
import {
  buildDiagList as buildClinicalDiagList,
  buildOrderListItem as buildClinicalOrderListItem,
  getMatchedItemRaw,
  getMatchedOrderServiceId,
  getOrderFgCheckOrd,
  getOrderFgSkintest,
  getOrderJsonField,
  getOrderPartId,
  getOrderServiceCode,
  getOrderServiceName,
  readFirstString,
  type OrderItemResolvers,
} from '@features/clinical-result';

export interface ClinicalResultWritebackPharmacyOption {
  idSto?: string;
}

export interface ClinicalResultWritebackPayloadOptions {
  selectedDiagnoses: Ref<Diagnosis[]>;
  primaryDiagnosis: Ref<Diagnosis | null>;
  patientTetId: Ref<string>;
  execDeptOptions: Ref<ExecDeptOption[]>;
  normalizeTreatment: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
  findFrequencyOptionByValue: (value?: string) => UsageOption | undefined;
  findRouteOptionByValue: (value?: string) => UsageOption | undefined;
  getDefaultPharmacyOption: (rec: TreatmentRecommendation) => ClinicalResultWritebackPharmacyOption | undefined;
  findMatchedPharmacyOption: (
    rec: TreatmentRecommendation,
    value: string,
  ) => ClinicalResultWritebackPharmacyOption | undefined;
  getDefaultExecDeptId: () => string;
}

export function createClinicalResultOrderItemResolvers(
  options: ClinicalResultWritebackPayloadOptions,
): OrderItemResolvers {
  function getSelectedPharmacyOption(rec: TreatmentRecommendation): ClinicalResultWritebackPharmacyOption | undefined {
    const pharmacyValue = (rec.pharmacy || '').trim();
    if (!pharmacyValue) {
      return options.getDefaultPharmacyOption(rec);
    }

    return options.findMatchedPharmacyOption(rec, pharmacyValue)
      || options.getDefaultPharmacyOption(rec);
  }

  function getOrderExecDeptId(rec: TreatmentRecommendation): string {
    const raw = getMatchedItemRaw(rec);
    const pharmacyOption = rec.type === 'medicine' ? getSelectedPharmacyOption(rec) : undefined;
    const execDeptValue = (rec.execDept || '').trim();
    const selectedExecDeptKey = rec.type !== 'medicine'
      ? (options.execDeptOptions.value.find((option) => option.key === execDeptValue || option.text === execDeptValue)?.key || execDeptValue)
      : '';

    if (rec.type !== 'medicine') {
      return selectedExecDeptKey.trim();
    }

    return (
      pharmacyOption?.idSto ||
      rec.matchedItem?.idDeptExec ||
      readFirstString(raw, ['idDeptExec', 'idDept']) ||
      options.getDefaultExecDeptId() ||
      ''
    ).trim();
  }

  function getResolvedFrequencyKey(rec: TreatmentRecommendation): string {
    const normalized = options.normalizeTreatment(rec);
    return normalized.frequencyKey || options.findFrequencyOptionByValue(normalized.frequency)?.key || '';
  }

  function getResolvedRouteKey(rec: TreatmentRecommendation): string {
    const normalized = options.normalizeTreatment(rec);
    return normalized.routeKey || options.findRouteOptionByValue(normalized.route)?.key || '';
  }

  return {
    getServiceCode: getOrderServiceCode,
    getServiceId: getMatchedOrderServiceId,
    getServiceName: getOrderServiceName,
    getExecDeptId: getOrderExecDeptId,
    getPartId: getOrderPartId,
    getJsonField: getOrderJsonField,
    getFgCheckOrd: getOrderFgCheckOrd,
    getFgSkintest: getOrderFgSkintest,
    getFrequencyKey: getResolvedFrequencyKey,
    getRouteKey: getResolvedRouteKey,
    normalize: options.normalizeTreatment,
  };
}

export function useClinicalResultWritebackPayload(options: ClinicalResultWritebackPayloadOptions) {
  const orderItemResolvers = createClinicalResultOrderItemResolvers(options);

  function buildOrderListItem(rec: TreatmentRecommendation): Record<string, string | number> {
    return buildClinicalOrderListItem(rec, orderItemResolvers);
  }

  function buildOrderList(items: TreatmentRecommendation[]): Array<Record<string, string | number>> {
    return items.map((item) => buildOrderListItem(item));
  }

  function buildDiagList(): Array<Record<string, string>> {
    return buildClinicalDiagList({
      selectedDiagnoses: options.selectedDiagnoses.value,
      primaryDiagnosis: options.primaryDiagnosis.value,
      patientTetId: options.patientTetId.value,
    });
  }

  return {
    buildDiagList,
    buildOrderList,
    orderItemResolvers,
  };
}

export type ClinicalResultWritebackPayload = ReturnType<typeof useClinicalResultWritebackPayload>;
