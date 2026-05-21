import { ref, type Ref } from 'vue';
import { getHisAdapter, type PharmacyOption } from '@/services/his';
import {
  DEFAULT_FREQUENCY_OPTIONS,
  DEFAULT_ROUTE_OPTIONS,
  createUsageOption,
  dedupeExecDeptOptions,
  dedupeUsageOptions,
  type ExecDeptOption,
  type UsageOption,
} from '@/utils/medicalDictionaryHelpers';

export interface MedicalDictionaries {
  frequencyOptions: Ref<UsageOption[]>;
  routeOptions: Ref<UsageOption[]>;
  pharmacyOptions: Ref<PharmacyOption[]>;
  execDeptOptions: Ref<ExecDeptOption[]>;
  loadFrequencyOptions: () => Promise<void>;
  loadRouteOptions: () => Promise<void>;
  loadPharmacyOptions: () => Promise<void>;
  loadExecDeptOptions: () => Promise<void>;
  loadAllDictionaries: () => Promise<void>;
}

export function useMedicalDictionaries(): MedicalDictionaries {
  const frequencyOptions = ref<UsageOption[]>([...DEFAULT_FREQUENCY_OPTIONS]);
  const routeOptions = ref<UsageOption[]>([...DEFAULT_ROUTE_OPTIONS]);
  const pharmacyOptions = ref<PharmacyOption[]>([]);
  const execDeptOptions = ref<ExecDeptOption[]>([]);

  let pharmacyLoadPromise: Promise<void> | null = null;

  async function loadFrequencyOptions(): Promise<void> {
    const his = getHisAdapter();
    if (!his) {
      console.warn('[useMedicalDictionaries] HisService not initialized, using default frequency options');
      return;
    }

    try {
      const items = await his.fetchFrequencyDictionary();
      if (items.length) {
        frequencyOptions.value = dedupeUsageOptions(items.map((item) => createUsageOption(item)));
      }
    } catch (error) {
      console.error('[useMedicalDictionaries] Failed to load frequency options from HIS', error);
    }
  }

  async function loadRouteOptions(): Promise<void> {
    const his = getHisAdapter();
    if (!his) {
      console.warn('[useMedicalDictionaries] HisService not initialized, using default route options');
      return;
    }

    try {
      const items = await his.fetchMedicineUsageDictionary();
      if (items.length > 0) {
        routeOptions.value = dedupeUsageOptions(items.map((item) => createUsageOption(item)));
      }
    } catch (error) {
      console.error('[useMedicalDictionaries] Failed to load route options from HIS', error);
    }
  }

  async function doLoadPharmacyOptions(): Promise<void> {
    const his = getHisAdapter();
    if (!his) {
      console.warn('[useMedicalDictionaries] HisService not initialized, pharmacy options skipped');
      pharmacyOptions.value = [];
      return;
    }

    try {
      const availablePharmacies = await his.fetchAvailablePharmacies();
      pharmacyOptions.value = availablePharmacies.length > 0
        ? availablePharmacies
        : (await his.fetchMedicineStoreIds('')).map((idSto) => ({
            name: idSto,
            idDept: '',
            idSto,
          }));
    } catch (error) {
      console.error('[useMedicalDictionaries] Failed to load pharmacy options from HIS', error);
      pharmacyOptions.value = [];
    }
  }

  function loadPharmacyOptions(): Promise<void> {
    if (!pharmacyLoadPromise) {
      pharmacyLoadPromise = doLoadPharmacyOptions().finally(() => {
        pharmacyLoadPromise = null;
      });
    }
    return pharmacyLoadPromise;
  }

  async function loadExecDeptOptions(): Promise<void> {
    const his = getHisAdapter();
    if (!his) {
      console.warn('[useMedicalDictionaries] HisService not initialized, execution department options skipped');
      execDeptOptions.value = [];
      return;
    }

    try {
      const items = await his.fetchExecutionDepartments();
      execDeptOptions.value = dedupeExecDeptOptions(items);
    } catch (error) {
      console.error('[useMedicalDictionaries] Failed to load execution department options from HIS', error);
      execDeptOptions.value = [];
    }
  }

  async function loadAllDictionaries(): Promise<void> {
    await Promise.all([
      loadFrequencyOptions(),
      loadRouteOptions(),
      loadPharmacyOptions(),
      loadExecDeptOptions(),
    ]);
  }

  return {
    frequencyOptions,
    routeOptions,
    pharmacyOptions,
    execDeptOptions,
    loadFrequencyOptions,
    loadRouteOptions,
    loadPharmacyOptions,
    loadExecDeptOptions,
    loadAllDictionaries,
  };
}
