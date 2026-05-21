export type ConsultationRenderMode = 'western' | 'tcm';

export interface ConsultationRenderConfigLike {
  key: string;
}

export interface BuildConsultationRenderPlanInput<TItem extends ConsultationRenderConfigLike> {
  selectedSymptoms: TItem[];
  mode: ConsultationRenderMode;
  formData: Record<string, unknown>;
  generalConfig: TItem;
  tcmConfig: TItem;
}

export interface ConsultationRenderPlan<TItem extends ConsultationRenderConfigLike> {
  items: TItem[];
  ensureKeys: string[];
  clearKeys: string[];
}

export function buildConsultationRenderPlan<TItem extends ConsultationRenderConfigLike>({
  selectedSymptoms,
  mode,
  formData,
  generalConfig,
  tcmConfig,
}: BuildConsultationRenderPlanInput<TItem>): ConsultationRenderPlan<TItem> {
  if (selectedSymptoms.length === 0) {
    return {
      items: [],
      ensureKeys: [],
      clearKeys: [],
    };
  }

  const modeConfig = mode === 'tcm' ? tcmConfig : generalConfig;
  const inactiveConfig = mode === 'tcm' ? generalConfig : tcmConfig;
  const ensureKeys = formData[modeConfig.key] ? [] : [modeConfig.key];
  const clearKeys = formData[inactiveConfig.key] ? [inactiveConfig.key] : [];

  return {
    items: [...selectedSymptoms, modeConfig],
    ensureKeys,
    clearKeys,
  };
}
