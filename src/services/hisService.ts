/**
 * @internal 底层 HIS（PHIS / 国卫）HTTP 客户端，仅供 `services/his/*` 内部包装使用。
 *
 * 业务代码（components / composables / 其它 services）禁止直接 import 本文件。
 * 必须使用 `services/his` 入口暴露的 `getHisAdapter()` / `getHisService()`：
 *
 *   ✗ import { getHisService } from '../services/hisService'
 *   ✓ import { getHisService } from '../services/his'      // 仅限 SDK handshake
 *   ✓ import { getHisAdapter } from '../services/his'      // 业务调用首选
 *
 * 详见 [services/his/index.ts](./his/index.ts) 与 AGENTS.md。
 */
import { fetch } from '@tauri-apps/plugin-http';
import {
  createHisTraceId,
  getHisBusinessCode,
  getHisBusinessMessage,
  recordHisIntegrationLog,
  resolveHisLogStatus,
  summarizeHisPayload,
} from './hisIntegrationLog';
import type {
  HisInpatientEmrContextPackage,
  HisInpatientEmrContextQuery,
  HisOutpatientFollowUpContext,
  HisOutpatientFollowUpContextQuery,
  HisOutpatientFollowUpReportResults,
  HisOutpatientFollowUpReportResultsQuery,
} from './his/types';

/**
 * HIS 服务响应基础结构
 */
export interface HisResponse<T = unknown> {
  success?: boolean;
  message?: string;
  msg?: string;
  body?: T;
  data?: T;
  code?: string | number;
}

export interface HisDiagnosisCatalogItem {
  id?: string;
  code?: string;
  name?: string;
  keywords?: string[] | string;
}

export interface HisMedicineCatalogItem {
  id?: string;
  code?: string;
  name?: string;
  spec?: string;
  /** 该药品在哪些发药药房（idSto）目录中出现 */
  storeIds?: string[];
  idSrv?: string;
  naSrv?: string;
  sdSrv?: string;
  idDeptExec?: string;
  fgCheckOrd?: string;
  fgSkintest?: string;
  raw?: Record<string, unknown>;
}

export interface HisMedicineProDetail {
  specSale?: string;
  unitSale?: string;
  naFac?: string;
  idMedPro?: string;
  priceSale?: number;
  idSto?: string;
  amount?: number;
  naMedPro?: string;
  unitSaleFactor?: number;
  idOrg?: string;
  idFac?: string;
  sdChrgitmLv?: string;
  fgSkintest?: string;
  dftDoseOnce?: string;
  unitDose?: string;
  proUnitFactor?: number;
  idMed?: string;
  naMed?: string;
  sdMed?: string;
  unitPre?: string;
  spec?: string;
  dose?: string;
  sdSkintest?: string;
  dftUsage?: string;
  dftFreq?: string;
  fgActive?: string;
}

export interface HisMedicineInventoryCheckItem {
  idSto: string;
  idMedPro: string;
  naMed: string;
  amount: number;
  priceSale: number;
  sdFrzBiz: '1' | '2' | '3';
}

export interface HisMedicineInventoryCheckResult {
  code: number;
  msg: string;
}

export interface HisAvailableMedicineInventoryBatch {
  idOrg?: string;
  idStoInv?: string;
  idMedPro?: string;
  amount?: number | string;
  amountCur?: number | string;
  priceSale?: number | string;
  cdBatch?: string;
  dtEffect?: string;
  fgActive?: string;
  idSto?: string;
  naMedPro?: string;
  idFac?: string;
  naFac?: string;
  specSale?: string;
  unitSale?: string;
  amtFrz?: number | string;
  unitPre?: string;
  idStoText?: string;
  [key: string]: unknown;
}

interface HisAvailableMedicineInventoryBody {
  start?: number;
  limit?: number;
  total?: number;
  items?: HisAvailableMedicineInventoryBatch[];
}

export interface HisMedicalItemCatalogItem {
  id?: string;
  code?: string;
  name?: string;
  category?: string;
  keywords?: string[] | string;
  idSrv?: string;
  naSrv?: string;
  sdSrv?: string;
  idDeptExec?: string;
  idPart?: string;
  jsonField?: string;
  fgCheckOrd?: string;
  priceSale?: number;
  restricted?: boolean;
  restrictionReason?: string;
  raw?: Record<string, unknown>;
}

export interface PharmacyOption {
  name: string;
  idDept: string;
  idSto?: string;
}

export interface HisDictionaryItem {
  key?: string;
  text?: string;
  py?: string;
  wb?: string;
  mcode?: string;
  [key: string]: unknown;
}

export interface HisDictionaryResponse {
  dicId?: string;
  items?: HisDictionaryItem[];
}

export interface HisServiceContext {
  userRoleDeptIds?: string[];
  orgCode?: string | null;
  tenantId?: string | null;
}

interface HiBdDieListBody {
  start?: number;
  limit?: number;
  total?: number;
  items?: Array<{
    idDie?: string;
    cd?: string;
    na?: string;
    py?: string;
    instr?: string;
    cdIcd?: string;
    naIcd?: string;
    fgActive?: string;
  }>;
}

interface AiAvailableExamLabCatalogBody {
  items?: HisMedicalItemCatalogItem[];
  examinationCount?: number;
  labTestCount?: number;
  total?: number;
}


export interface HisMedicalItemPartOption {
  idPart?: string;
  idCli?: string;
  sdPacstype?: string;
  partAndWay?: string;
  sdPartAndWay?: string;
  naCli?: string;
  count?: number;
  sdPacstypeText?: string;
  sdWayText?: string;
  sdPartText?: string;
  idDeptExecText?: string;
  amount?: number;
}

/**
 * PHIS 患者详情（searchByIdPi 返回 body）
 */
export interface HisPatientDetailBody {
  idPi?: string;
  cdPi?: string;
  naPi?: string;
  sdSex?: string;
  sdSexText?: string;
  birthday?: string;
  ageNum?: number;
  ageUnit?: string;
  ageText?: string;
  idTet?: string;
  sdNation?: string;
  sdNationText?: string;
  sdNaty?: string;
  sdNatyText?: string;
  sdWork?: string;
  sdWorkText?: string;
  sdBlood?: string;
  sdBloodText?: string;
  address?: string;
  cdAddr?: string;
  cdAddrText?: string;
  naCompany?: string;
  fgActive?: string;
  fgActiveText?: string;
  py?: string;
  wb?: string;
  [key: string]: unknown;
}

/**
 * PHIS 过敏史条目（queryHisAllergy 返回 body.items）
 */
export interface HisAllergyItem {
  sdAliergy?: string;
  naAliergy?: string;
  fgDrug?: string;
  [key: string]: unknown;
}

/**
 * PHIS 就诊历史列表条目（queryVisitHistory 返回 body.items）
 *
 * 字段未在用户示例中明确列出（idVis / idPi 之外可能还携带 dtVis / chiefComplaint 等），
 * 因此采用宽松定义，未知字段通过索引签名透传。
 */
export interface HisVisitHistoryItem {
  idVis?: string;
  idPi?: string;
  dtBgn?: string;
  dtReg?: string;
  dtVis?: string;
  dtVisit?: string;
  visitTime?: string | number;
  [key: string]: unknown;
}

export interface HisPatientVisitHistoryQuery {
  limit?: number;
  dtBgn?: [string, string];
  idVis?: string;
}

interface HisVisitHistoryListBody {
  start?: number;
  limit?: number;
  total?: number;
  items?: HisVisitHistoryItem[];
}

/**
 * PHIS 就诊历史详情（loadClinicMedicalRecord 返回 body）
 */
export interface HisVisitDetailDiag {
  naDiag?: string;
  sdDiag?: string;
  cdIcd10?: string;
  naIcd10?: string;
  fgMain?: string;
  [key: string]: unknown;
}

export interface HisVisitDetailOrder {
  idOrd?: string;
  naOrd?: string;
  desOrd?: string;
  amount?: number;
  unitOrd?: string;
  /** PHIS医嘱类型：11药品、31检查、41检验。 */
  sdOrd?: string;
  sdSrv?: string;
  idMed?: string;
  idMedPro?: string;
  fgDrug?: string;
  idApplySim?: string;
  idOrdComb?: string;
  [key: string]: unknown;
}

export interface HisVisitDetailPrescriptionSub {
  idPresSub?: string;
  idPres?: string;
  idOrd?: string;
  idMedPro?: string;
  naMedPro?: string;
  specSale?: string;
  doseOnce?: string | number;
  dose?: string | number;
  unitDose?: string;
  unitPre?: string;
  idFreq?: string;
  idFreqText?: string;
  execCount?: string | number;
  idUsge?: string;
  idUsgeText?: string;
  takeDays?: string | number;
  amount?: string | number;
  unitSale?: string;
  idSto?: string;
  [key: string]: unknown;
}

export interface HisVisitDetailPrescription {
  idPres?: string;
  presSubList?: HisVisitDetailPrescriptionSub[];
  [key: string]: unknown;
}

export interface HisVisitDetailApplyItem {
  idApply?: string;
  idApplySim?: string;
  naApply?: string;
  sdApply?: string;
  naSpecimen?: string;
  sdSpecimen?: string;
  insertTime?: string;
  [key: string]: unknown;
}

export interface HisVisitDetailApplyGroup {
  idApplySim?: string;
  naApplySim?: string;
  naDeptExec?: string;
  sdBusiness?: string;
  insertTime?: string;
  items?: HisVisitDetailApplyItem[];
  [key: string]: unknown;
}

export interface HisVisitDetailBody {
  soapData?: {
    chiefComplaint?: string;
    presentIllness?: string;
    [key: string]: unknown;
  };
  diagList?: HisVisitDetailDiag[];
  orderList?: HisVisitDetailOrder[];
  presList?: HisVisitDetailPrescription[];
  applyList?: HisVisitDetailApplyGroup[];
  [key: string]: unknown;
}

/**
 * PHIS 门诊病历文书列表项（getLookMedList 返回 body.data）
 */
export interface HisOutpatientMedicalRecordDocumentBody {
  idMedrecdoc?: string;
  idApp?: string;
  createTime?: string;
  insertTime?: string;
  insertUser?: string;
  naMed?: string;
  idPatient?: string;
  idHospital?: string;
  idOrg?: string;
  idTet?: string;
  idBdmd?: string;
  idMeca?: string;
  idMedi?: string;
  idTep?: string;
  fgCheck?: string;
  insertDept?: string;
  fgCommit?: string;
  fgClose?: string;
  fgSeal?: string;
  fgNote?: string;
  fgPrint?: string;
  medType?: string;
  titleTime?: string;
  idDs?: string;
  autoRefresh?: string;
  countPrint?: string;
  [key: string]: unknown;
}

interface HisOutpatientMedicalRecordDocumentListBody {
  code?: number | string;
  count?: number;
  message?: string;
  data?: HisOutpatientMedicalRecordDocumentBody[];
  items?: HisOutpatientMedicalRecordDocumentBody[];
}

/**
 * PHIS 门诊病历正文（getMedContentLook 返回 body.data）
 */
export interface HisOutpatientMedicalRecordContentBody {
  idMedrecdoc?: string;
  htmlContent?: string;
  [key: string]: unknown;
}

interface HisOutpatientMedicalRecordContentResponseBody {
  code?: number | string;
  count?: number;
  message?: string;
  data?: HisOutpatientMedicalRecordContentBody;
}

interface HiBdCliPacsPartAndWayListBody {
  start?: number;
  limit?: number;
  total?: number;
  items?: HisMedicalItemPartOption[];
}

export interface HiBdCliDetailBody {
  idTet?: string;
  idCli?: string;
  naCli?: string;
  unit?: string;
  cdCli?: string;
  priceSale?: number;
  idCstmg?: string;
  sdUse?: string;
  fgMed?: string;
  sdCli?: string;
  fgCombination?: string;
  fgSingle?: string;
  py?: string;
  fgPri?: string;
  sdPacstype?: string;
  idSrv?: string;
  fgActive?: string;
  insertUser?: string;
  id?: string;
  count?: number;
  amount?: number;
  quantity?: number;
  sdSpecimenText?: string;
  naCstmg?: string;
  idDeptExec?: string;
  fgImp?: boolean;
  sdUseText?: string;
  fgMedText?: string;
  fgCombinationText?: string;
  fgSingleText?: string;
  fgPriText?: string;
}


interface OrgMedicineConfigItem {
  idMedPro?: string;
  naMed?: string;
  idMed?: string;
  naMedPro?: string;
  sdMed?: string;
  sdMedText?: string;
  orgActive?: string;
  medActive?: string;
  fgActive?: string;
  unitSale?: string;
  specSale?: string;
  idSto?: string;
  idOrg?: string;
  sdSrv?: string;
  idDeptExec?: string;
  fgCheckOrd?: string;
  fgSkintest?: string;
}

interface OrgMedicineConfigListBody {
  start?: number;
  limit?: number;
  total?: number;
  items?: OrgMedicineConfigItem[];
}

interface OrgMedicineStoreItem {
  idTet?: string;
  idOrg?: string;
  id?: string;
  sdDisp?: string;
  idSto?: string;
  idDept?: string;
  sdUse?: string;
  naSto?: string;
  idDeptText?: string;
  sdUseText?: string;
  sdDispText?: string;
}

interface OrgMedicineStoreListBody {
  start?: number;
  limit?: number;
  total?: number;
  items?: OrgMedicineStoreItem[];
}

interface OrganDeptListBody {
  start?: number;
  limit?: number;
  items?: HisDictionaryItem[];
}

const HIS_CATALOG_ENDPOINTS = {
  diagnoses: 'api/base.hiBdDieService/queryList',
  availableExamLabItems: 'api/phis.aiInpatientEmrContextService/queryAvailableExamLabItems',
  medicalItemDetail: 'api/phis.hiBdCliService/loadHiBdCliDetail',
  medicalItemParts: 'api/phis.hiBdCliPacsPartService/queryExaPartAndWayList',
  medicineStores: 'api/phis.medicineDispensingService/queryDispensingSto',
  orgMedicineStores: 'api/phis.orgMedStoManageService/queryOrgSto',
  execDepartments: 'api/base.organDicService/deptListByTec',
  medicines: 'api/phis.orgMedicineConfig/queryList',
  medicineDetail: 'api/phis.orgMedicineConfig/loadMedicinePro',
  availableMedicineInventory: 'api/phis.medicineDrpQueryService/queryInvSubList',
  medicineInventoryCheck: 'api/phis.medicineInventoryService/checkInvEnough',
  patientSearchByIdPi: 'api/phis.patientService/searchByIdPi',
  patientAllergy: 'api/phis.clinicPatientService/queryHisAllergy',
  patientVisitHistory: 'api/phis.clinicPatientService/queryVisitHistory',
  patientVisitDetail: 'api/phis.clinicDoctorCoreService/loadClinicMedicalRecord',
  outpatientMedicalRecordDocuments: 'api/otms.rpcEmrEditorLookService/getLookMedList',
  outpatientMedicalRecordContent: 'api/otms.rpcEmrEditorLookService/getMedContentLook',
  inpatientEmrContext: 'api/phis.aiInpatientEmrContextService/buildContext',
  outpatientFollowUpContext: 'api/phis.aiInpatientEmrContextService/buildOutpatientFollowUpContext',
  outpatientFollowUpReportResults: 'api/phis.aiInpatientEmrContextService/buildOutpatientFollowUpReportResults',
} as const;

/**
 * HIS 接口调用工具类
 * 用于在小球端（Tauri）通过 HTTP 请求调用 HIS 服务的接口
 */
export class HisService {
  private baseUrl: string;
  private token: string;
  private userRoleDeptIds: string[];
  private orgCode: string;
  private tenantId: string;

  /**
   * @param baseUrl HIS 服务的基地址 (例如: http://192.168.1.100:8080/his/)
   * @param token 握手时由网页端自动获取并传给小球的 emrAccessToken
   */
  constructor(baseUrl: string, token: string, context?: HisServiceContext) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.token = token;
    this.userRoleDeptIds = this.normalizeDeptIds(context?.userRoleDeptIds);
    this.orgCode = this.normalizeContextValue(context?.orgCode);
    this.tenantId = this.normalizeContextValue(context?.tenantId);
  }

  /**
   * 发起 HIS POST 请求
   * @param url 相对路径 (例如: 'api/patient/getDetail')
   * @param data 请求体数据
   */
  async post<T = unknown>(url: string, data: unknown = {}): Promise<HisResponse<T>> {
    if (!this.token) {
      throw new Error(`[HisService] Missing tk token, request blocked: ${url}`);
    }

    const traceId = createHisTraceId();
    const startedAt = Date.now();
    let failedHttpStatus: number | undefined;
    const fullUrl = this.baseUrl + url;
    const requestSummary = summarizeHisPayload(data);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cookie': `tk=${this.token}`,
      'Authorization': `Bearer ${this.token}`,
      'X-Access-Token': this.token,
    };
    console.log('[HisService] POST', {
      traceId,
      url: fullUrl,
      body: this.summarizePayload(data),
      hasToken: true,
    });

    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        connectTimeout: 10000,
      });

      if (!response.ok) {
        failedHttpStatus = response.status;
        throw new Error(`HIS HTTP Error: ${response.status}`);
      }

      const result = await response.json();
      const hisResponse = result as HisResponse<T>;
      const responseSummary = summarizeHisPayload(hisResponse.body ?? hisResponse.data ?? hisResponse);
      const status = resolveHisLogStatus(hisResponse);
      console.log('[HisService] RESPONSE', {
        traceId,
        url: fullUrl,
        code: hisResponse.code,
        message: hisResponse.message,
        summary: this.summarizePayload(hisResponse.body ?? hisResponse.data),
      });
      void recordHisIntegrationLog({
        traceId,
        direction: 'outbound',
        operation: url,
        method: 'POST',
        path: url,
        url: fullUrl,
        status,
        httpStatus: response.status,
        businessCode: getHisBusinessCode(hisResponse),
        businessMessage: getHisBusinessMessage(hisResponse),
        durationMs: Date.now() - startedAt,
        requestSummary,
        responseSummary,
      });
      return hisResponse;
    } catch (error) {
      console.error(`[HisService] Request failed: ${fullUrl}`, error);
      void recordHisIntegrationLog({
        traceId,
        direction: 'outbound',
        operation: url,
        method: 'POST',
        path: url,
        url: fullUrl,
        status: 'error',
        httpStatus: failedHttpStatus,
        durationMs: Date.now() - startedAt,
        requestSummary,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 发起 HIS GET 请求
   * @param url 相对路径 (例如: 'rbmh.base.med.usage.dic')
   * @param query 查询参数
   */
  async get<T = unknown>(url: string, query?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
    if (!this.token) {
      throw new Error(`[HisService] Missing tk token, request blocked: ${url}`);
    }

    const traceId = createHisTraceId();
    const startedAt = Date.now();
    let failedHttpStatus: number | undefined;
    const fullUrl = this.buildUrlWithQuery(this.baseUrl + url, query);
    const requestSummary = summarizeHisPayload(query ?? {});
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Cookie': `tk=${this.token}`,
      'Authorization': `Bearer ${this.token}`,
      'X-Access-Token': this.token,
    };
    console.log('[HisService] GET', {
      traceId,
      url: fullUrl,
      hasToken: true,
    });

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers,
        connectTimeout: 10000,
      });

      if (!response.ok) {
        failedHttpStatus = response.status;
        throw new Error(`HIS HTTP Error: ${response.status}`);
      }

      const result = await response.json();
      const responseSummary = summarizeHisPayload(result);
      const status = resolveHisLogStatus(result);
      console.log('[HisService] RESPONSE', {
        traceId,
        url: fullUrl,
        summary: this.summarizePayload(result),
      });
      void recordHisIntegrationLog({
        traceId,
        direction: 'outbound',
        operation: url,
        method: 'GET',
        path: url,
        url: fullUrl,
        status,
        httpStatus: response.status,
        businessCode: getHisBusinessCode(result),
        businessMessage: getHisBusinessMessage(result),
        durationMs: Date.now() - startedAt,
        requestSummary,
        responseSummary,
      });
      return result as T;
    } catch (error) {
      console.error(`[HisService] Request failed: ${fullUrl}`, error);
      void recordHisIntegrationLog({
        traceId,
        direction: 'outbound',
        operation: url,
        method: 'GET',
        path: url,
        url: fullUrl,
        status: 'error',
        httpStatus: failedHttpStatus,
        durationMs: Date.now() - startedAt,
        requestSummary,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 同步全局诊断目录
   * 真实 HIS 服务：api/base.hiBdDieService/queryList
   */
  async fetchDiagnosisCatalog(): Promise<HisDiagnosisCatalogItem[]> {
    const pageSize = 1000;
    let start = 0;
    let total: number | null = null;
    const items: NonNullable<HiBdDieListBody['items']> = [];
    const pageSummaries: Array<{ start: number; rawCount: number; total: number | null }> = [];

    while (true) {
      const response = await this.post<HiBdDieListBody>(
        HIS_CATALOG_ENDPOINTS.diagnoses,
        [{ start, limit: pageSize }]
      );
      this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.diagnoses, response);

      const pageItems = response.body?.items ?? response.data?.items ?? [];
      const rawTotal = response.body?.total ?? response.data?.total;
      const parsedTotal = Number(rawTotal);
      if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
        total = parsedTotal;
      }

      items.push(...pageItems);
      pageSummaries.push({
        start,
        rawCount: pageItems.length,
        total,
      });

      if (pageItems.length === 0) {
        break;
      }
      if (total !== null && items.length >= total) {
        break;
      }
      if (pageItems.length < pageSize) {
        break;
      }

      start += pageSize;
    }

    const activeItems = items.filter((item) => item.fgActive !== '0');
    const normalizedItems = activeItems
      .map((item) => {
        const code = item.cdIcd?.trim() || item.cd?.trim() || '';
        const name = item.naIcd?.trim() || item.na?.trim() || '';
        const keywordParts = [
          item.py?.trim(),
          ...((item.instr || '')
            .split(',')
            .map(part => part.trim())
            .filter((part): part is string => Boolean(part)))
        ];
        const keywords = keywordParts
          .filter((part): part is string => Boolean(part));

        return {
          id: item.idDie?.trim() || code || name,
          code,
          name,
          keywords: keywords.length > 0 ? Array.from(new Set(keywords)) : undefined
        };
      })
      .filter(item => item.code || item.name);

    console.log('[HisService] Diagnosis catalog summary', {
      total,
      pages: pageSummaries,
      rawCount: items.length,
      inactiveFiltered: items.length - activeItems.length,
      normalizedCount: normalizedItems.length,
      sample: normalizedItems[0] ?? null,
    });

    return normalizedItems;
  }

  /** 从 AI 上下文聚合服务查询当前机构、科室真正可开立的检验检查目录。 */
  async fetchInstitutionMedicalItemsCatalog(orgCode: string): Promise<HisMedicalItemCatalogItem[]> {
    const response = await this.post<AiAvailableExamLabCatalogBody>(
      HIS_CATALOG_ENDPOINTS.availableExamLabItems,
      [{ orgCode }],
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.availableExamLabItems, response);
    const body = response.body ?? response.data ?? {};
    const unique = new Map<string, HisMedicalItemCatalogItem>();
    (body.items ?? []).forEach((item) => {
      const id = item.id?.trim();
      const name = item.name?.trim();
      if (!id || !name || unique.has(id)) return;
      unique.set(id, {
        ...item,
        id,
        name,
        code: item.code?.trim() || id,
        category: item.category?.trim() || '其他',
        raw: item as unknown as Record<string, unknown>,
      });
    });
    const normalizedList = Array.from(unique.values());

    console.log('[HisService] Available exam/lab catalog summary', {
      orgCode,
      total: body.total ?? normalizedList.length,
      examinationCount: body.examinationCount ?? 0,
      labTestCount: body.labTestCount ?? 0,
      normalizedCount: normalizedList.length,
      sample: normalizedList[0] ?? null,
    });

    return normalizedList;
  }

  /**
   * 按机构同步药品目录
   */
  async fetchInstitutionMedicineCatalog(orgCode: string): Promise<HisMedicineCatalogItem[]> {
    const storeIds = await this.fetchMedicineStoreIds(orgCode);
    if (storeIds.length === 0) {
      console.warn('[HisService] Medicine catalog skipped because no valid western medicine stores were matched', {
        orgCode,
      });
      return [];
    }

    const responses = await Promise.all(
      storeIds.map((idSto) => this.post<OrgMedicineConfigListBody>(
        HIS_CATALOG_ENDPOINTS.medicines,
        [{ start: 0, limit: -1, params: { idSto } }]
      ))
    );
    responses.forEach((response) => this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.medicines, response));

    const responseSummaries = responses.map((response, index) => {
      const items = response.body?.items ?? response.data?.items ?? [];
      return {
        idSto: storeIds[index],
        rawCount: items.length,
      };
    });
    const perStoreEntries = responses.map((response, index) => ({
      idSto: storeIds[index],
      items: response.body?.items ?? response.data?.items ?? [],
    }));
    const unique = new Map<string, HisMedicineCatalogItem & { storeIds: string[] }>();
    let missingNameCount = 0;
    let inactiveCount = 0;
    let sdMedFiltered = 0;

    perStoreEntries.forEach(({ idSto, items: storeItems }) => {
      storeItems.forEach((item) => {
        if (item.fgActive === '0' || item.orgActive === '0' || item.medActive === '0') {
          inactiveCount += 1;
          return;
        }
        if (!(item.sdMed == '1' || item.sdMed == '2')) {
          sdMedFiltered += 1;
          return;
        }

        const name = item.naMedPro?.trim() || item.naMed?.trim() || '';
        if (!name) {
          missingNameCount += 1;
          return;
        }

        const id = item.idMedPro?.trim() || item.idMed?.trim() || name;
        const existing = unique.get(id);
        if (existing) {
          if (idSto && !existing.storeIds.includes(idSto)) {
            existing.storeIds.push(idSto);
          }
          return;
        }

        unique.set(id, {
          id,
          code: item.idMed?.trim() || item.idMedPro?.trim() || '',
          name,
          spec: this.composeMedicineSpec(item.specSale?.trim(), item.unitSale?.trim()),
          storeIds: idSto ? [idSto] : [],
          idSrv: item.idMedPro?.trim() || item.idMed?.trim() || id,
          naSrv: name,
          sdSrv: item.sdSrv?.trim() || '11',
          idDeptExec: item.idDeptExec?.trim() || '',
          fgCheckOrd: item.fgCheckOrd?.trim() || '1',
          fgSkintest: item.fgSkintest?.trim() || '0',
          raw: {
            ...(item as unknown as Record<string, unknown>),
            idSto,
            storeIds: idSto ? [idSto] : [],
          },
        });
      });
    });

    const normalizedMedicines = Array.from(unique.values());
    const totalRawCount = perStoreEntries.reduce((sum, entry) => sum + entry.items.length, 0);

    console.log('[HisService] Medicine catalog summary', {
      orgCode,
      storeIds,
      responses: responseSummaries,
      mergedCount: totalRawCount,
      inactiveFiltered: inactiveCount,
      sdMedFiltered,
      missingNameCount,
      normalizedCount: normalizedMedicines.length,
      sample: normalizedMedicines[0] ?? null,
    });

    return normalizedMedicines;
  }

  /**
   * 获取药品用法字典
   */
  async fetchMedicineUsageDictionary(): Promise<HisDictionaryItem[]> {
    const response = await this.get<HisDictionaryResponse>('rbmh.base.med.usage.dic');
    return Array.isArray(response?.items) ? response.items : [];
  }

  /**
   * 获取频次字典（每日 X 次 / Q12H 等）。
   * 该方法把 PHIS 私有路径 `api/base.tenantDicService/frequency` 封装到 service 内部，
   * 调用方走 HisAdapter 接口而不再直接走 raw POST。
   */
  async fetchFrequencyDictionary(): Promise<HisDictionaryItem[]> {
    const response = await this.post<{ items?: HisDictionaryItem[] }>(
      'api/base.tenantDicService/frequency',
      {},
    );
    return Array.isArray(response?.body?.items) ? (response.body!.items as HisDictionaryItem[]) : [];
  }


  /**
   * 获取检验检查/处置可选执行科室
   */
  async fetchExecutionDepartments(): Promise<HisDictionaryItem[]> {
    const response = await this.post<OrganDeptListBody>(
      HIS_CATALOG_ENDPOINTS.execDepartments,
      []
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.execDepartments, response);

    const items = response.body?.items ?? response.data?.items ?? [];
    return Array.isArray(items) ? items : [];
  }

  /**
   * 获取诊疗项目详情
   */
  async fetchMedicalItemDetail(idCli: string): Promise<HiBdCliDetailBody | null> {
    const normalizedIdCli = idCli.trim();
    if (!normalizedIdCli) {
      return null;
    }

    const response = await this.post<HiBdCliDetailBody>(
      HIS_CATALOG_ENDPOINTS.medicalItemDetail,
      [normalizedIdCli, 'org']
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.medicalItemDetail, response);

    return response.body ?? response.data ?? null;
  }

  /**
   * 获取检查项目部位 / 方式候选
   */
  async fetchMedicalItemPartOptions(idCli: string): Promise<HisMedicalItemPartOption[]> {
    const normalizedIdCli = idCli.trim();
    if (!normalizedIdCli) {
      return [];
    }

    const response = await this.post<HiBdCliPacsPartAndWayListBody>(
      HIS_CATALOG_ENDPOINTS.medicalItemParts,
      [{ params: { idCli: normalizedIdCli }, limit: -1 }]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.medicalItemParts, response);

    const items = response.body?.items ?? response.data?.items ?? [];
    return Array.isArray(items) ? items : [];
  }

  /**
   * 获取药品详情（按药房维度）
   * @param id 药品目录中的 id (idMedPro)
   * @param idSto 药房 storeId
   */
  async fetchMedicineProDetail(id: string, idSto: string): Promise<HisMedicineProDetail | null> {
    const normalizedId = id.trim();
    const normalizedIdSto = idSto.trim();
    if (!normalizedId || !normalizedIdSto) {
      return null;
    }

    try {
      const response = await this.post<HisMedicineProDetail>(
        HIS_CATALOG_ENDPOINTS.medicineDetail,
        [normalizedId, normalizedIdSto]
      );
      this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.medicineDetail, response);
      return response.body ?? response.data ?? null;
    } catch (error) {
      console.warn('[HisService] Failed to fetch medicine pro detail', {
        id: normalizedId,
        idSto: normalizedIdSto,
        error,
      });
      return null;
    }
  }

  /**
   * 校验药品库存是否充足
   * HIS 约定 code=200 表示库存充足，code>200 表示库存不足，msg 为具体原因。
   */
  async checkMedicineInventoryEnough(items: HisMedicineInventoryCheckItem[]): Promise<HisMedicineInventoryCheckResult> {
    if (items.length === 0) {
      return { code: 200, msg: '' };
    }

    const response = await this.post<unknown>(
      HIS_CATALOG_ENDPOINTS.medicineInventoryCheck,
      [items]
    );

    const body = response.body as HisResponse | string | undefined;
    const data = response.data as HisResponse | string | undefined;
    const rawCode = response.code
      ?? (typeof body === 'object' ? body?.code : undefined)
      ?? (typeof data === 'object' ? data?.code : undefined)
      ?? 500;
    const code = typeof rawCode === 'number' ? rawCode : Number(rawCode);
    const msg = response.msg
      || response.message
      || (typeof body === 'object' ? (body?.msg || body?.message) : body)
      || (typeof data === 'object' ? (data?.msg || data?.message) : data)
      || '';

    return {
      code: Number.isFinite(code) ? code : 500,
      msg: String(msg).trim(),
    };
  }

  async fetchAvailableMedicineInventory(idSto: string): Promise<HisAvailableMedicineInventoryBatch[]> {
    const normalizedIdSto = idSto.trim();
    if (!normalizedIdSto) return [];

    const buildRequest = (start: number, limit: number) => [{
      start,
      limit,
      sort: null,
      params: {
        idSto: normalizedIdSto,
        naMedPro: null,
        sdBasMed: null,
        amountType: '1',
        fgActiveType: '1',
        sdMed: null,
        sdMedType: null,
      },
    }];
    const fetchPage = async (start: number, limit: number): Promise<HisAvailableMedicineInventoryBody> => {
      const response = await this.post<HisAvailableMedicineInventoryBody>(
        HIS_CATALOG_ENDPOINTS.availableMedicineInventory,
        buildRequest(start, limit),
      );
      this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.availableMedicineInventory, response);
      return response.body ?? response.data ?? {};
    };

    const firstPage = await fetchPage(0, -1);
    const total = typeof firstPage.total === 'number' ? firstPage.total : 0;
    const allItems = Array.isArray(firstPage.items) ? [...firstPage.items] : [];
    let start = allItems.length;

    while (total > allItems.length && start < total) {
      const page = await fetchPage(start, 200);
      const pageItems = Array.isArray(page.items) ? page.items : [];
      if (pageItems.length === 0) break;
      allItems.push(...pageItems);
      start += pageItems.length;
    }

    const unique = new Map<string, HisAvailableMedicineInventoryBatch>();
    allItems.forEach((item, index) => {
      const fallbackKey = [
        item.idMedPro,
        item.cdBatch,
        item.dtEffect,
        item.amountCur,
        item.amount,
      ].filter((value) => value != null && String(value).trim()).join('|');
      const key = item.idStoInv?.trim()
        || fallbackKey
        || `row-${index}`;
      unique.set(key, item);
    });

    return Array.from(unique.values());
  }

  /**
   * 根据 idPi 查询患者基本信息
   * PHIS 接口：api/phis.patientService/searchByIdPi
   * 入参：[idPi]，出参 body 为患者详情对象
   */
  async searchPatientByIdPi(idPi: string): Promise<HisPatientDetailBody | null> {
    const normalizedIdPi = idPi.trim();
    if (!normalizedIdPi) {
      return null;
    }

    const response = await this.post<HisPatientDetailBody>(
      HIS_CATALOG_ENDPOINTS.patientSearchByIdPi,
      [normalizedIdPi]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.patientSearchByIdPi, response);

    return response.body ?? response.data ?? null;
  }

  /**
   * 查询患者过敏史
   * PHIS 接口：api/phis.clinicPatientService/queryHisAllergy
   */
  async queryPatientAllergy(idPi: string): Promise<HisAllergyItem[]> {
    const normalizedIdPi = idPi.trim();
    if (!normalizedIdPi) return [];

    const response = await this.post<HisVisitHistoryListBody>(
      HIS_CATALOG_ENDPOINTS.patientAllergy,
      [{ params: { idPi: normalizedIdPi } }]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.patientAllergy, response);

    const items = response.body?.items ?? response.data?.items ?? [];
    return Array.isArray(items) ? (items as HisAllergyItem[]) : [];
  }

  /**
   * 查询患者就诊历史列表
   * PHIS 接口：api/phis.clinicPatientService/queryVisitHistory
   */
  async queryPatientVisitHistory(
    idPi: string,
    query: number | HisPatientVisitHistoryQuery = 5,
  ): Promise<HisVisitHistoryItem[]> {
    const normalizedIdPi = idPi.trim();
    if (!normalizedIdPi) return [];
    const normalizedQuery = typeof query === 'number' ? { limit: query } : query;
    const params: Record<string, unknown> = { idPi: normalizedIdPi };
    if (normalizedQuery.idVis?.trim()) {
      params.idVis = normalizedQuery.idVis.trim();
    }
    if (Array.isArray(normalizedQuery.dtBgn) && normalizedQuery.dtBgn.length === 2) {
      params.dtBgn = normalizedQuery.dtBgn;
    }

    const response = await this.post<HisVisitHistoryListBody>(
      HIS_CATALOG_ENDPOINTS.patientVisitHistory,
      [{ limit: normalizedQuery.limit ?? 5, params }]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.patientVisitHistory, response);

    const items = response.body?.items ?? response.data?.items ?? [];
    return Array.isArray(items) ? items : [];
  }

  /**
   * 加载单次就诊明细（含诊断与医嘱）
   * PHIS 接口：api/phis.clinicDoctorCoreService/loadClinicMedicalRecord
   */
  async loadClinicMedicalRecord(idVis: string, idPi: string): Promise<HisVisitDetailBody | null> {
    const normalizedIdVis = idVis.trim();
    const normalizedIdPi = idPi.trim();
    if (!normalizedIdVis || !normalizedIdPi) return null;

    try {
      const response = await this.post<HisVisitDetailBody>(
        HIS_CATALOG_ENDPOINTS.patientVisitDetail,
        [{ idVis: normalizedIdVis, idPi: normalizedIdPi }]
      );
      this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.patientVisitDetail, response);
      return response.body ?? response.data ?? null;
    } catch (error) {
      console.warn('[HisService] Failed to load clinic medical record', {
        idVis: normalizedIdVis,
        idPi: normalizedIdPi,
        error,
      });
      return null;
    }
  }

  /**
   * 获取门诊病历文书列表。
   * PHIS 接口：api/otms.rpcEmrEditorLookService/getLookMedList
   * 入参：[{"idApp":"42","idTet":"租户ID","idHospital":"门诊idVis"}]
   */
  async queryOutpatientMedicalRecordDocuments(
    idHospital: string,
    options: { idTet?: string | null; idApp?: string } = {},
  ): Promise<HisOutpatientMedicalRecordDocumentBody[]> {
    const normalizedIdHospital = idHospital.trim();
    const normalizedIdTet = this.normalizeContextValue(options.idTet) || this.tenantId;
    const idApp = (options.idApp || '42').trim() || '42';
    if (!normalizedIdHospital) return [];
    if (!normalizedIdTet) {
      throw new Error('[HisService] Missing idTet for getLookMedList');
    }

    const response = await this.post<HisOutpatientMedicalRecordDocumentListBody>(
      HIS_CATALOG_ENDPOINTS.outpatientMedicalRecordDocuments,
      [{
        idApp,
        idTet: normalizedIdTet,
        idHospital: normalizedIdHospital,
      }]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.outpatientMedicalRecordDocuments, response);

    const body = response.body ?? response.data ?? null;
    if (!body) return [];

    const innerCode = body.code;
    if (innerCode != null && innerCode !== 200 && innerCode !== '200') {
      const message = body.message?.trim() || `HIS business error: ${String(innerCode)}`;
      throw new Error(`[HisService] ${HIS_CATALOG_ENDPOINTS.outpatientMedicalRecordDocuments} failed: ${message} (code=${String(innerCode)})`);
    }

    const items = body.data ?? body.items ?? [];
    return Array.isArray(items) ? items : [];
  }

  /**
   * 获取门诊病历正文。
   * PHIS 接口：api/otms.rpcEmrEditorLookService/getMedContentLook
   * 入参：[{"idApp":"42","idTet":"租户ID","idMedrecdoc":"文书ID","courseShow":0}]
   */
  async queryOutpatientMedicalRecordContent(
    idMedrecdoc: string,
    options: { idTet?: string | null; idApp?: string; courseShow?: number } = {},
  ): Promise<HisOutpatientMedicalRecordContentBody | null> {
    const normalizedIdMedrecdoc = idMedrecdoc.trim();
    const normalizedIdTet = this.normalizeContextValue(options.idTet) || this.tenantId;
    const idApp = (options.idApp || '42').trim() || '42';
    if (!normalizedIdMedrecdoc) return null;
    if (!normalizedIdTet) {
      throw new Error('[HisService] Missing idTet for getMedContentLook');
    }

    const response = await this.post<HisOutpatientMedicalRecordContentResponseBody>(
      HIS_CATALOG_ENDPOINTS.outpatientMedicalRecordContent,
      [{
        idApp,
        idTet: normalizedIdTet,
        idMedrecdoc: normalizedIdMedrecdoc,
        courseShow: Number.isFinite(options.courseShow) ? options.courseShow : 0,
      }]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.outpatientMedicalRecordContent, response);

    const body = response.body ?? response.data ?? null;
    if (!body) return null;

    const innerCode = body.code;
    if (innerCode != null && innerCode !== 200 && innerCode !== '200') {
      const message = body.message?.trim() || `HIS business error: ${String(innerCode)}`;
      throw new Error(`[HisService] ${HIS_CATALOG_ENDPOINTS.outpatientMedicalRecordContent} failed: ${message} (code=${String(innerCode)})`);
    }

    return body.data ?? null;
  }

  /**
   * 构建住院病历 AI 上下文。
   * PHIS 接口：api/phis.aiInpatientEmrContextService/buildContext
   * PHIS RPC 网关按方法参数数组传参，HTTP body 必须是 `[requestMap]`。
   *
   * 该接口一次性返回登记、诊断、医嘱、体温单、检验检查、历史病历等裁剪后的 AI 上下文；
   * 住院病历生成统一使用它，不再维护登记/医嘱/体温单分散接口回退。
   */
  async buildInpatientEmrContext(
    query: HisInpatientEmrContextQuery,
  ): Promise<HisInpatientEmrContextPackage | null> {
    const admissionId = query.admissionId?.trim()
      || query.inpatientVisitId?.trim()
      || query.encounterId?.trim()
      || (query.raw && typeof query.raw === 'object' ? String(query.raw.idAdsn ?? '').trim() : '');
    if (!admissionId) return null;

    const payload: Record<string, unknown> = {
      admissionId,
      templateId: query.templateId,
      templateName: query.templateName,
      recordTime: query.recordTime,
      recordDate: query.recordDate,
      contextPolicy: query.contextPolicy,
    };

    const response = await this.post<HisInpatientEmrContextPackage>(
      HIS_CATALOG_ENDPOINTS.inpatientEmrContext,
      [payload]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.inpatientEmrContext, response);

    return response.body ?? response.data ?? null;
  }

  async buildOutpatientFollowUpContext(
    query: HisOutpatientFollowUpContextQuery,
  ): Promise<HisOutpatientFollowUpContext | null> {
    const patientId = query.patientId?.trim();
    const currentVisitId = query.currentVisitId?.trim();
    const currentDiagnosis = query.currentDiagnosis?.trim();
    if (!patientId || !currentVisitId) return null;

    const response = await this.post<HisOutpatientFollowUpContext>(
      HIS_CATALOG_ENDPOINTS.outpatientFollowUpContext,
      [{
        patientId,
        currentVisitId,
        currentDiagnosis: currentDiagnosis || undefined,
        sourceVisitId: query.sourceVisitId?.trim() || undefined,
        contextPolicy: query.contextPolicy,
      }],
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.outpatientFollowUpContext, response);
    return response.body ?? response.data ?? null;
  }

  async buildOutpatientFollowUpReportResults(
    query: HisOutpatientFollowUpReportResultsQuery,
  ): Promise<HisOutpatientFollowUpReportResults | null> {
    const patientId = query.patientId?.trim();
    const currentVisitId = query.currentVisitId?.trim();
    if (!patientId || !currentVisitId) return null;

    const response = await this.post<HisOutpatientFollowUpReportResults>(
      HIS_CATALOG_ENDPOINTS.outpatientFollowUpReportResults,
      [{
        patientId,
        currentVisitId,
        contextPolicy: query.contextPolicy,
      }],
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.outpatientFollowUpReportResults, response);
    return response.body ?? response.data ?? null;
  }

  /**
   * 获取当前用户可见药房列表（仅西药房，且限定当前角色科室）
   */
  async fetchAvailablePharmacies(): Promise<PharmacyOption[]> {
    const response = await this.post<OrgMedicineStoreListBody>(
      HIS_CATALOG_ENDPOINTS.orgMedicineStores,
      [{ start: 0, limit: -1, params: { sdUse: '1' } }]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.orgMedicineStores, response);

    const items = response.body?.items ?? response.data?.items ?? [];
    if (this.userRoleDeptIds.length === 0) {
      console.warn('[HisService] Pharmacy fetch skipped because handshake userRoleDeptIds is empty');
      return [];
    }

    let sdDispFiltered = 0;
    let sdUseFiltered = 0;
    let deptFiltered = 0;
    let deptBypassed = 0;

    const pharmacies = new Map<string, PharmacyOption>();

    items.forEach((item) => {
          if ((item.sdDisp || '').trim() !== '1') {
            sdDispFiltered += 1;
            return;
          }

          const sdUse = (item.sdUse || '').trim();
          if (sdUse !== '1' && sdUse !== '3') {
            sdUseFiltered += 1;
            return;
          }

          const deptIds = this.normalizeDeptIds((item.idDept || '').split(','));
          const hasDeptRestriction = deptIds.length > 0;
          const matchedDeptId = hasDeptRestriction
            ? deptIds.find((deptId) => this.userRoleDeptIds.includes(deptId))
            : '';
          if (hasDeptRestriction && !matchedDeptId) {
            deptFiltered += 1;
            return;
          }
          if (!hasDeptRestriction) {
            deptBypassed += 1;
          }
          const effectiveDeptId = matchedDeptId || '';

          const name = item.naSto?.trim() || '';
          if (!name) {
            return;
          }

          const optionKey = `${name}::${effectiveDeptId}`;
          if (!pharmacies.has(optionKey)) {
            pharmacies.set(optionKey, {
              name,
              idDept: effectiveDeptId,
              idSto: item.idSto?.trim() || '',
            });
          }
        });

    const pharmacyList = Array.from(pharmacies.values());

    console.log('[HisService] Pharmacy filter summary', {
      rawCount: items.length,
      sdDispFiltered,
      sdUseFiltered,
      deptFiltered,
      deptBypassed,
      userRoleDeptIds: this.userRoleDeptIds,
      matchedPharmacies: pharmacyList,
      sampleItem: items[0] ?? null,
    });

    return pharmacyList;
  }

  /**
   * 更新 Token
   */
  updateToken(newToken: string): void {
    this.token = newToken;
  }

  updateContext(context: HisServiceContext): void {
    if ('userRoleDeptIds' in context) {
      this.userRoleDeptIds = this.normalizeDeptIds(context.userRoleDeptIds);
    }
    if ('orgCode' in context) {
      this.orgCode = this.normalizeContextValue(context.orgCode);
    }
    if ('tenantId' in context) {
      this.tenantId = this.normalizeContextValue(context.tenantId);
    }
  }

  getDefaultExecDeptId(): string {
    return this.userRoleDeptIds[0] || '';
  }

  getTenantId(): string {
    return this.tenantId;
  }

  getOrgCode(): string {
    return this.orgCode;
  }

  async fetchMedicineStoreIds(orgCode: string): Promise<string[]> {
    const availablePharmacies = await this.fetchAvailablePharmacies();
    if (availablePharmacies.length > 0) {
      const availableStoreIds = this.extractUniqueStoreIds(availablePharmacies);

      console.log('[HisService] Medicine store filter summary (available pharmacies)', {
        orgCode,
        matchedCount: availablePharmacies.length,
        matchedStoreIds: availableStoreIds,
      });

      return availableStoreIds;
    }

    const response = await this.post<OrgMedicineStoreListBody>(
      HIS_CATALOG_ENDPOINTS.orgMedicineStores,
      [{ start: 0, limit: -1, params: orgCode ? { idOrg: orgCode } : {} }]
    );
    this.assertBusinessSuccess(HIS_CATALOG_ENDPOINTS.orgMedicineStores, response);

    const stores = response.body?.items ?? response.data?.items ?? [];
    let sdDispFiltered = 0;
    let sdUseFiltered = 0;

    const fallbackStores = stores.filter((store) => {
      if ((store.sdDisp || '').trim() !== '1') {
        sdDispFiltered += 1;
        return false;
      }
      const sdUse = (store.sdUse || '').trim();
      if (sdUse && sdUse !== '1' && sdUse !== '3') {
        sdUseFiltered += 1;
        return false;
      }
      return Boolean((store.idSto || '').trim());
    });

    const storeIds = Array.from(new Set(
      fallbackStores
        .map((store) => store.idSto?.trim())
        .filter((idSto): idSto is string => Boolean(idSto))
    ));

    console.log('[HisService] Medicine store filter summary (fallback stores)', {
      orgCode,
      rawCount: stores.length,
      sdDispFiltered,
      sdUseFiltered,
      matchedCount: fallbackStores.length,
      matchedStoreIds: storeIds,
    });

    return storeIds;
  }

  private extractUniqueStoreIds(pharmacies: PharmacyOption[]): string[] {
    return Array.from(new Set(
      pharmacies
        .map((store) => store.idSto?.trim())
        .filter((idSto): idSto is string => Boolean(idSto))
    ));
  }

  private composeMedicineSpec(specSale?: string, unitSale?: string): string {
    if (specSale && unitSale && !specSale.includes(unitSale)) {
      return `${specSale} ${unitSale}`.trim();
    }

    return specSale || unitSale || '';
  }

  private assertBusinessSuccess<T>(endpoint: string, response: HisResponse<T>): void {
    const code = response.code;
    if (code === 200 || code === '200' || response.success === true) {
      return;
    }

    const message = response.message?.trim() || `HIS business error: ${String(code ?? 'unknown')}`;
    console.warn('[HisService] Business response rejected', {
      endpoint,
      code,
      message,
    });
    throw new Error(`[HisService] ${endpoint} failed: ${message} (code=${String(code ?? 'unknown')})`);
  }

  private buildUrlWithQuery(base: string, query?: Record<string, string | number | boolean | null | undefined>): string {
    if (!query) {
      return base;
    }

    const url = new URL(base);
    Object.entries(query).forEach(([key, value]) => {
      if (value == null) {
        return;
      }
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  private summarizePayload(payload: unknown): unknown {
    if (Array.isArray(payload)) {
      return {
        type: 'array',
        length: payload.length,
        first: payload[0] ?? null,
      };
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      if (Array.isArray(record.items)) {
        return {
          keys: Object.keys(record),
          itemsLength: record.items.length,
        };
      }

      return {
        keys: Object.keys(record),
      };
    }

    return payload;
  }

  private normalizeDeptIds(values?: Array<string | null | undefined> | string[]): string[] {
    return Array.from(new Set(
      (values || [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    ));
  }

  private normalizeContextValue(value: string | number | null | undefined): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return '';
  }
}

let instance: HisService | null = null;

/**
 * 获取 HIS 服务实例
 * @param baseUrl 可选，首次初始化时必传
 * @param token 可选，首次初始化时必传
 */
export const getHisService = (
  baseUrl?: string,
  auth?: {
    token?: string;
    userRoleDeptIds?: string[];
    orgCode?: string | null;
    tenantId?: string | null;
  }
): HisService | null => {
  if (baseUrl && auth?.token) {
    if (instance) {
      instance = new HisService(baseUrl, auth.token, { userRoleDeptIds: auth.userRoleDeptIds, orgCode: auth.orgCode, tenantId: auth.tenantId });
    } else {
      instance = new HisService(baseUrl, auth.token, { userRoleDeptIds: auth.userRoleDeptIds, orgCode: auth.orgCode, tenantId: auth.tenantId });
    }
  } else if (instance && auth && ('userRoleDeptIds' in auth || 'orgCode' in auth || 'tenantId' in auth)) {
    const context: HisServiceContext = {};
    if ('userRoleDeptIds' in auth) {
      context.userRoleDeptIds = auth.userRoleDeptIds;
    }
    if ('orgCode' in auth) {
      context.orgCode = auth.orgCode;
    }
    if ('tenantId' in auth) {
      context.tenantId = auth.tenantId;
    }
    instance.updateContext(context);
  }
  return instance;
};

export const resetHisService = (): void => {
  instance = null;
};
