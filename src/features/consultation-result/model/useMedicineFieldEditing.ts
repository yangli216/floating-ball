import type { TreatmentRecommendation } from '@/types/consultation';
import type { MedicinePrimaryField } from '@features/clinical-result';

export interface MedicineFieldEditingOptions {
  normalize: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
  syncUsageKeyword: (rec: TreatmentRecommendation, field: Extract<MedicinePrimaryField, 'frequency' | 'route'>) => void;
  resolveUsageValue: (rec: TreatmentRecommendation, field: Extract<MedicinePrimaryField, 'frequency' | 'route'>) => string;
  resolveUsageKey: (rec: TreatmentRecommendation, field: Extract<MedicinePrimaryField, 'frequency' | 'route'>) => string;
  setActiveField: (rec: TreatmentRecommendation, field: MedicinePrimaryField) => void;
  isFieldActive: (rec: TreatmentRecommendation, field: MedicinePrimaryField) => boolean;
  clearActiveField: (rec?: TreatmentRecommendation, field?: MedicinePrimaryField) => void;
  focusActiveField: () => void;
  clearInventoryWarning: (rec: TreatmentRecommendation) => void;
  checkInventoryEnough: (rec: TreatmentRecommendation, showWarning?: boolean) => Promise<boolean>;
}

function isUsageField(field: MedicinePrimaryField): field is Extract<MedicinePrimaryField, 'frequency' | 'route'> {
  return field === 'frequency' || field === 'route';
}

function shouldKeepFieldOpen(event: FocusEvent): boolean {
  const container = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  return Boolean(container && nextTarget && container.contains(nextTarget));
}

export function useMedicineFieldEditing(options: MedicineFieldEditingOptions) {
  function activateField(rec: TreatmentRecommendation, field: MedicinePrimaryField, event?: Event): void {
    event?.stopPropagation();

    if (rec.type === 'medicine') {
      const normalized = options.normalize(rec);
      Object.assign(rec, normalized);
      if (field === 'total' && !rec.totalManualEdited && normalized.totalQty) {
        rec.totalQty = normalized.totalQty;
      }
      if (field === 'total' && normalized.totalUnit) {
        rec.totalUnit = normalized.totalUnit;
      }
    }

    if (isUsageField(field)) {
      options.syncUsageKeyword(rec, field);
    }

    options.setActiveField(rec, field);
    options.focusActiveField();
  }

  function handleFieldBlur(rec: TreatmentRecommendation, field: MedicinePrimaryField, event: FocusEvent): void {
    if (shouldKeepFieldOpen(event) || !options.isFieldActive(rec, field)) {
      return;
    }

    if (isUsageField(field)) {
      const value = options.resolveUsageValue(rec, field);
      const key = options.resolveUsageKey(rec, field);
      if (field === 'frequency') {
        rec.frequency = value;
        rec.frequencyKey = key;
      } else {
        rec.route = value;
        rec.routeKey = key;
      }
      options.syncUsageKeyword(rec, field);
    }

    if (field === 'total') {
      void options.checkInventoryEnough(rec, true);
    }

    options.clearActiveField(rec, field);
  }

  function handleTotalQtyInput(rec: TreatmentRecommendation, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    rec.totalQty = target?.value || '';
    rec.totalManualEdited = rec.totalQty.trim().length > 0;
    if (!rec.totalUnit) {
      rec.totalUnit = options.normalize(rec).totalUnit || '';
    }
    options.clearInventoryWarning(rec);
  }

  function handleUsageOpenChange(
    rec: TreatmentRecommendation,
    field: Extract<MedicinePrimaryField, 'frequency' | 'route'>,
    open: boolean,
  ): void {
    if (open) {
      activateField(rec, field);
      return;
    }

    if (options.isFieldActive(rec, field)) {
      options.clearActiveField(rec, field);
    }
  }

  return {
    activateField,
    handleFieldBlur,
    handleTotalQtyInput,
    handleUsageOpenChange,
  };
}

export type MedicineFieldEditing = ReturnType<typeof useMedicineFieldEditing>;
