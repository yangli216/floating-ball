/**
 * useMedicalDictionaries
 *
 * 统一管理治疗项编辑所需的四类 HIS 字典：频次 / 用法 / 发药药房 / 执行科室。
 * 语音问诊与症状问诊可共用：composable 只负责拉取并维护 reactive 选项列表，不感知组件内部状态。
 *
 * 加载语义：
 * - `loadFrequencyOptions / loadRouteOptions / loadExecDeptOptions`：失败时保留原值（频次/用法）或清空（执行科室），不抛错；
 * - `loadPharmacyOptions`：失败时清空 `pharmacyOptions` 且不抛错；并发请求会去重；
 * - `loadAllDictionaries`：并发执行四项加载，无论成功与否都 resolve。
 *
 * 副作用扩展：
 * - 各 load 函数返回 Promise，调用方可在 await 后读取 `xxxOptions.value` 继续做组件特有的副作用（如药品目录预热、执行科室同步）。
 */

import { ref, type Ref } from 'vue';
import { getHisAdapter } from '../services/his';
import type { PharmacyOption } from '../services/his';
import {
  DEFAULT_FREQUENCY_OPTIONS,
  DEFAULT_ROUTE_OPTIONS,
  createUsageOption,
  dedupeExecDeptOptions,
  dedupeUsageOptions,
  type ExecDeptOption,
  type UsageOption,
} from '../utils/medicalDictionaryHelpers';

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
