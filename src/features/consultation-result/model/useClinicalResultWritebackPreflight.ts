import type { Ref } from 'vue';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import {
  buildInventoryBlockedSubmitMessage,
  getStandardDiagnosisId,
  validateTreatmentRequiredFields,
  type TreatmentRequiredFieldResolverOptions,
} from '@features/clinical-result';

export type ClinicalResultWritebackPreflightNotify = (message: string, type?: string) => void;

export interface ClinicalResultWritebackPreflightOptions {
  selectedDiagnoses: Readonly<Ref<readonly Diagnosis[]>>;
  treatments: Readonly<Ref<readonly TreatmentRecommendation[]>>;
  ensureMedicineSelectable: (rec: TreatmentRecommendation, showWarning?: boolean) => Promise<boolean>;
  checkMedicineInventoryEnough: (rec: TreatmentRecommendation, showWarning?: boolean) => Promise<boolean>;
  hydrateMedicalItemDetail: (rec: TreatmentRecommendation) => Promise<unknown>;
  hasRequiredPharmacy: (rec: TreatmentRecommendation) => boolean;
  hasRequiredExecDept: (rec: TreatmentRecommendation) => boolean;
  hasRequiredBodySite: (rec: TreatmentRecommendation) => boolean;
  openPharmacySelector: (rec: TreatmentRecommendation) => void;
  openExecDeptSelector: (rec: TreatmentRecommendation) => void;
  openBodySiteSelector: (rec: TreatmentRecommendation) => void;
  requiredFieldOptions?: TreatmentRequiredFieldResolverOptions;
  notify?: ClinicalResultWritebackPreflightNotify;
}

export interface ClinicalResultWritebackPreflightResult {
  ready: boolean;
  selected: TreatmentRecommendation[];
}

export function useClinicalResultWritebackPreflight(options: ClinicalResultWritebackPreflightOptions) {
  function block(selected: TreatmentRecommendation[] = []): ClinicalResultWritebackPreflightResult {
    return {
      ready: false,
      selected,
    };
  }

  async function run(): Promise<ClinicalResultWritebackPreflightResult> {
    if (options.selectedDiagnoses.value.length === 0) {
      options.notify?.('缺少当前诊断，请先在 HIS 中补齐标准诊断后再回写', 'warning');
      return block();
    }

    const invalidDiagnosis = options.selectedDiagnoses.value.find((item) => !getStandardDiagnosisId(item));
    if (invalidDiagnosis) {
      options.notify?.(`${invalidDiagnosis.name} 未匹配标准诊断库，请先切换为标准诊断后再回写`, 'warning');
      return block();
    }

    const selected = options.treatments.value.filter((item) => item.selected);
    const medicinesReady = await Promise.all(selected
      .filter((item) => item.type === 'medicine')
      .map((item) => options.ensureMedicineSelectable(item, true)));
    if (medicinesReady.some((ready) => !ready)) {
      options.notify?.('存在当前药房无有效详情的药品，请取消选择后再提交', 'warning');
      return block(selected);
    }

    const selectedMedicines = selected.filter((item) => item.type === 'medicine');
    const medicineInventoriesReady = await Promise.all(selectedMedicines
      .map((item) => options.checkMedicineInventoryEnough(item, false)));
    const inventoryBlockedItems = selectedMedicines.filter((_, index) => !medicineInventoriesReady[index]);
    if (inventoryBlockedItems.length > 0) {
      options.notify?.(buildInventoryBlockedSubmitMessage(inventoryBlockedItems), 'warning');
      return block(selected);
    }

    const selectedNonMedicines = selected.filter((item) => item.type !== 'medicine');
    if (selectedNonMedicines.length > 0) {
      await Promise.all(selectedNonMedicines.map((item) => options.hydrateMedicalItemDetail(item)));
    }

    const missingPharmacy = selected.find((item) => !options.hasRequiredPharmacy(item));
    if (missingPharmacy) {
      options.openPharmacySelector(missingPharmacy);
      options.notify?.(`${missingPharmacy.name} 当前发药药房不可用，请选择实际拥有该药品的药房后再提交`, 'warning');
      return block(selected);
    }

    const missingExecDept = selected.find((item) => !options.hasRequiredExecDept(item));
    if (missingExecDept) {
      options.openExecDeptSelector(missingExecDept);
      options.notify?.(`${missingExecDept.name} 未设置执行科室，请先设置后再提交`, 'warning');
      return block(selected);
    }

    const missingBodySite = selected.find((item) => !options.hasRequiredBodySite(item));
    if (missingBodySite) {
      options.openBodySiteSelector(missingBodySite);
      options.notify?.(`${missingBodySite.name} 未设置检查部位，请先设置后再提交`, 'warning');
      return block(selected);
    }

    const invalidRequiredFields = selected
      .map((item) => ({
        item,
        result: validateTreatmentRequiredFields(item, options.requiredFieldOptions || {}),
      }))
      .find(({ result }) => !result.ready);
    if (invalidRequiredFields) {
      if (invalidRequiredFields.result.issues[0]?.field === 'idPart') {
        options.openBodySiteSelector(invalidRequiredFields.item);
      }
      options.notify?.(invalidRequiredFields.result.issues[0]?.message || `${invalidRequiredFields.item.name} 缺少必要字段，请补齐后再提交`, 'warning');
      return block(selected);
    }

    return {
      ready: true,
      selected,
    };
  }

  return {
    run,
  };
}

export type ClinicalResultWritebackPreflight = ReturnType<typeof useClinicalResultWritebackPreflight>;
