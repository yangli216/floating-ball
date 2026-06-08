/**
 * HIS 适配器层公开入口
 *
 * 业务方使用：
 * ```ts
 * import { getHisAdapter } from '@/services/his';
 * const his = getHisAdapter();
 * const diagnoses = await his?.fetchDiagnosisCatalog();
 * ```
 *
 * 新厂商接入：
 * ```ts
 * import { registerHisAdapterFactory, setActiveHisVendor, type HisAdapter } from '@/services/his';
 *
 * class MyVendorAdapter implements HisAdapter { ... }
 *
 * registerHisAdapterFactory('myVendor', () => new MyVendorAdapter(...));
 * setActiveHisVendor('myVendor'); // 或者在 .env 中配置 VITE_HIS_VENDOR=myVendor
 * ```
 */

export type { HisAdapter } from './HisAdapter';
export type {
  HisServiceContext,
  PharmacyOption,
} from './HisAdapter';
export type {
  DiagnosisCatalogEntry,
  DictionaryEntry,
  InventoryCheckRequest,
  InventoryCheckResult,
  MedicalItemCatalogEntry,
  MedicalItemDetail,
  MedicalItemPartOption,
  MedicineCatalogEntry,
  MedicineDetail,
  HisPatientInfo,
  HisPatientHistory,
  HisInpatientDiagnosis,
  HisInpatientOrder,
  HisInpatientQuery,
  HisInpatientRegistrationInfo,
  HisInpatientTemperatureChart,
  HisInpatientTemperatureRecord,
} from './types';
export { PhisHisAdapter } from './PhisHisAdapter';
export { MockHisAdapter } from './MockHisAdapter';

/**
 * 底层 HisService 单例的引用只允许在认证 bootstrap 场景使用（例如 SDK handshake、
 * 区域化 JWT 注入）。业务代码一律走 `getHisAdapter()`，不允许跨层调用。
 */
export { getHisService, resetHisService } from '../hisService';
export {
  getHisAdapter,
  registerHisAdapterFactory,
  setActiveHisVendor,
  resetHisAdapter,
  listRegisteredHisVendors,
  type HisAdapterFactory,
} from './registry';
