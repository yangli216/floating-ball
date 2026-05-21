import type { TreatmentRecommendation } from '@/types/consultation';

export interface TreatmentSelectionReadinessOptions {
  ensureMedicineSelectable: (rec: TreatmentRecommendation, showWarning?: boolean) => Promise<boolean>;
  hydrateMedicalItemDetail: (rec: TreatmentRecommendation) => Promise<unknown>;
  checkMedicineInventoryEnough: (rec: TreatmentRecommendation, showWarning?: boolean) => Promise<boolean>;
  normalize: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
  hasRequiredPharmacy: (rec: TreatmentRecommendation) => boolean;
  hasRequiredExecDept: (rec: TreatmentRecommendation) => boolean;
  hasRequiredBodySite: (rec: TreatmentRecommendation) => boolean;
  openPharmacySelector: (rec: TreatmentRecommendation) => void;
  openExecDeptSelector: (rec: TreatmentRecommendation) => void;
  openBodySiteSelector: (rec: TreatmentRecommendation) => void;
  expandTreatmentEditor: (rec: TreatmentRecommendation) => void;
  notify?: (message: string, type?: string) => void;
}

export interface EnsureTreatmentSelectableOptions {
  labelName?: string;
  medicineUnavailableMessage?: string;
  pharmacyMissingMessage?: string;
  execDeptMissingMessage?: string;
  bodySiteMissingMessage?: string;
  showMedicineUnavailableWarning?: boolean;
  hydrateNonMedicine?: boolean;
}

export function useTreatmentSelectionReadiness(options: TreatmentSelectionReadinessOptions) {
  async function ensureTreatmentSelectable(
    rec: TreatmentRecommendation,
    input: EnsureTreatmentSelectableOptions = {},
  ): Promise<boolean> {
    const labelName = input.labelName || rec.name;

    if (rec.type === 'medicine') {
      Object.assign(rec, options.normalize(rec));
    }

    if (rec.type === 'medicine' && !(await options.ensureMedicineSelectable(rec, input.showMedicineUnavailableWarning))) {
      if (input.medicineUnavailableMessage) {
        options.notify?.(input.medicineUnavailableMessage, 'warning');
      }
      return false;
    }

    if (rec.type !== 'medicine' && input.hydrateNonMedicine !== false) {
      await options.hydrateMedicalItemDetail(rec);
    }

    if (!options.hasRequiredPharmacy(rec)) {
      options.openPharmacySelector(rec);
      options.notify?.(
        input.pharmacyMissingMessage || `${labelName} 当前发药药房不可用，请选择实际拥有该药品的药房后再选中`,
        'warning',
      );
      return false;
    }

    if (!options.hasRequiredExecDept(rec)) {
      options.openExecDeptSelector(rec);
      options.notify?.(
        input.execDeptMissingMessage || `${labelName} 未设置执行科室，请先设置后再选中`,
        'warning',
      );
      return false;
    }

    if (!options.hasRequiredBodySite(rec)) {
      options.openBodySiteSelector(rec);
      options.notify?.(
        input.bodySiteMissingMessage || `${labelName} 未设置检查部位，请先设置后再选中`,
        'warning',
      );
      return false;
    }

    if (rec.type === 'medicine') {
      Object.assign(rec, options.normalize(rec));
      if (!(await options.checkMedicineInventoryEnough(rec, true))) {
        options.expandTreatmentEditor(rec);
        return false;
      }
    }

    return true;
  }

  return {
    ensureTreatmentSelectable,
  };
}

export type TreatmentSelectionReadiness = ReturnType<typeof useTreatmentSelectionReadiness>;
