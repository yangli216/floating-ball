/**
 * PhisHisAdapter
 *
 * 默认 HIS 厂商适配器：包装现有 `HisService` 类（即"国卫 PHIS / 院端 HIS"接入形态）。
 *
 * 之所以做成 thin wrapper 而不是搬代码：
 * - `HisService` 已稳定运行，方法签名和返回值都被业务方依赖，不能在抽象迁移这一步顺便改行为；
 * - 通过 wrapper 暴露 `HisAdapter` 接口后，业务方就只面向接口编程，未来要替换/迁移
 *   `HisService` 内部实现时不会牵连上层；
 * - 新厂商对接时不再需要复用 `HisService`，可以直接独立实现 `HisAdapter`。
 *
 * 当前会话/认证状态仍由 `HisService` 自己持有（baseUrl + token），由
 * `useEventListeners` 在 SDK handshake 时通过 `getHisService(baseUrl, auth)` 注入。
 * 适配器层对此无感。
 */

import { HisService } from '../hisService';
import type {
  HisDiagnosisCatalogItem,
  HisDictionaryItem,
  HisMedicalItemCatalogItem,
  HisMedicalItemPartOption,
  HisMedicineCatalogItem,
  HisVisitHistoryItem,
  HisVisitDetailBody,
  HisInpatientDiagnosisBody,
  HisInpatientOrderBody,
  HisInpatientRegistrationBody,
  HisInpatientTemperatureChartBody,
  HisInpatientTemperatureRecordBody,
} from '../hisService';
import type { HisAdapter, HisServiceContext } from './HisAdapter';
import type { HisVisitRecord } from './types';
import type {
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
  HisInpatientEmrContextPackage,
  HisInpatientEmrContextQuery,
  HisInpatientQuery,
  HisInpatientRegistrationInfo,
  HisInpatientTemperatureChart,
  HisInpatientTemperatureRecord,
  HisOutpatientVisit,
  HisOutpatientMedicalRecord,
} from './types';

const trim = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
};

const firstTrim = (record: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = trim(record[key]);
    if (value) return value;
  }
  return undefined;
};

const firstNumber = (record: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
};

const firstBool = (record: Record<string, unknown>, keys: string[]): boolean | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'y', 'yes', 'main', 'primary'].includes(normalized)) return true;
      if (['0', 'false', 'n', 'no'].includes(normalized)) return false;
    }
  }
  return undefined;
};

/** PHIS 业务类型编码 ↔ 中性枚举 */
const PHIS_BUSINESS_TYPE_MAP: Record<InventoryCheckRequest['businessType'], '1' | '2' | '3'> = {
  outpatient: '1',
  inpatient: '2',
  emergency: '3',
};

function mapDiagnosisCatalog(item: HisDiagnosisCatalogItem): DiagnosisCatalogEntry {
  return {
    id: trim(item.id) ?? trim(item.code) ?? '',
    code: trim(item.code),
    name: trim(item.name) ?? '',
    keywords: item.keywords,
    raw: { ...item },
  };
}

function mapMedicineCatalog(item: HisMedicineCatalogItem): MedicineCatalogEntry {
  const storeIds = Array.isArray(item.storeIds)
    ? Array.from(new Set(item.storeIds.map((value) => trim(value)).filter((value): value is string => Boolean(value))))
    : [];
  // PHIS 私有字段（idSrv / naSrv / sdSrv / idDeptExec / fgCheckOrd / fgSkintest）
  // 全部塞进 raw，业务通用代码不再访问
  return {
    id: trim(item.id) ?? '',
    code: trim(item.code),
    name: trim(item.name) ?? '',
    spec: trim(item.spec),
    storeIds,
    raw: {
      ...(item.raw && typeof item.raw === 'object' ? item.raw : {}),
      storeIds,
      idSrv: item.idSrv,
      naSrv: item.naSrv,
      sdSrv: item.sdSrv,
      idDeptExec: item.idDeptExec,
      fgCheckOrd: item.fgCheckOrd,
      fgSkintest: item.fgSkintest,
    },
  };
}


function mapMedicalItemPartOption(item: HisMedicalItemPartOption): MedicalItemPartOption | null {
  const partId = trim(item.idPart);
  const name = trim(item.partAndWay) ?? trim(item.sdPartText) ?? trim(item.sdWayText) ?? '无部位';
  if (!partId && !name) return null;

  return {
    partId: partId ?? '',
    itemId: trim(item.idCli),
    name,
    partAndWay: trim(item.partAndWay),
    partAndWayCode: trim(item.sdPartAndWay),
    pacsType: trim(item.sdPacstype),
    pacsTypeText: trim(item.sdPacstypeText),
    partText: trim(item.sdPartText),
    wayText: trim(item.sdWayText),
    amount: typeof item.amount === 'number' ? item.amount : undefined,
    raw: item as unknown as Record<string, unknown>,
  };
}

function mapMedicalItemCatalog(item: HisMedicalItemCatalogItem): MedicalItemCatalogEntry {
  return {
    id: trim(item.id) ?? '',
    code: trim(item.code),
    name: trim(item.name) ?? '',
    category: trim(item.category),
    keywords: item.keywords,
    raw: {
      ...(item.raw && typeof item.raw === 'object' ? item.raw : {}),
      idSrv: item.idSrv,
      naSrv: item.naSrv,
      sdSrv: item.sdSrv,
      idDeptExec: item.idDeptExec,
      idPart: item.idPart,
      jsonField: item.jsonField,
      fgCheckOrd: item.fgCheckOrd,
    },
  };
}

function mapDictionaryItem(item: HisDictionaryItem): DictionaryEntry | null {
  const text = trim(item.text);
  const key = trim(item.key) ?? text;
  if (!key || !text) return null;

  // 抽出已知中性字段，剩余的塞进 properties 透传
  const { key: _k, text: _t, py, wb, mcode, ...rest } = item;
  return {
    key,
    text,
    py: trim(py),
    wb: trim(wb),
    mcode: trim(mcode),
    properties: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

function mapDictionaryItems(items: HisDictionaryItem[]): DictionaryEntry[] {
  const result: DictionaryEntry[] = [];
  for (const item of items) {
    const entry = mapDictionaryItem(item);
    if (entry) result.push(entry);
  }
  return result;
}

/**
 * 把 PHIS 单次就诊详情映射为中性 HisVisitRecord。
 *
 * 时间字段在 queryVisitHistory 列表项中可能位于 dtReg / dtVisit / dtBgn；详情接口
 * 当前响应未提供时间，因此优先取列表项里的时间，缺失时回退到 Date.now()，避免上层
 * 排序/落地时丢失整条记录。
 */
function mapVisitDetail(
  visit: HisVisitHistoryItem,
  detail: HisVisitDetailBody,
): HisVisitRecord {
  const visitTimeRaw = visit.visitTime ?? visit.dtReg ?? visit.dtBgn;
  let visitTime: number;
  if (typeof visitTimeRaw === 'number' && Number.isFinite(visitTimeRaw)) {
    visitTime = visitTimeRaw;
  } else if (typeof visitTimeRaw === 'string' && visitTimeRaw.trim()) {
    const parsed = Date.parse(visitTimeRaw);
    visitTime = Number.isFinite(parsed) ? parsed : Date.now();
  } else {
    visitTime = Date.now();
  }

  const soap = detail.soapData ?? {};
  const chiefComplaint = trim((soap as Record<string, unknown>)['chiefComplaint'] as string | undefined);
  const presentIllness = trim((soap as Record<string, unknown>)['presentIllness'] as string | undefined);

  const diagnoses = (detail.diagList ?? [])
    .map((d) => trim(d.naDiag) ?? trim(d.naIcd10))
    .filter((value): value is string => Boolean(value));

  const medications = (detail.orderList ?? [])
    .map((order) => {
      const name = trim(order.naOrd);
      if (!name) return undefined;
      const desc = trim(order.desOrd);
      // 数量+单位若与 desOrd 重复则不再追加；这里简单拼接，便于上层 LLM 清洗
      const amount = typeof order.amount === 'number' ? order.amount : undefined;
      const unit = trim(order.unitOrd);
      const qty = amount !== undefined ? `${amount}${unit ?? ''}` : '';
      const tail = [desc, qty].filter(Boolean).join(' ');
      return tail ? `${name}（${tail}）` : name;
    })
    .filter((value): value is string => Boolean(value));

  return {
    visitTime,
    chiefComplaint,
    presentIllness,
    diagnoses: diagnoses.length > 0 ? diagnoses : undefined,
    medications: medications.length > 0 ? medications : undefined,
  };
}

function mapInpatientDiagnosis(item: HisInpatientDiagnosisBody): HisInpatientDiagnosis | null {
  const raw = item as unknown as Record<string, unknown>;
  const diagnosisType = firstTrim(raw, ['sdDiagText', 'diagnosisType', 'sdDiag']);
  const name = firstTrim(raw, ['naDiag', 'naIcd10', 'name']) ?? diagnosisType;
  if (!name) return null;

  return {
    id: firstTrim(raw, ['idDiag', 'id', 'idDie', 'cdIcd', 'cdIcd10', 'cdDiag']) ?? name,
    code: firstTrim(raw, ['cdIcd', 'cdIcd10', 'cdDiag', 'code']),
    name,
    diagnosisType,
    diagnosedAt: firstTrim(raw, ['dtDiag', 'diagnosedAt']),
    isPrimary: firstBool(raw, ['fgMain', 'isPrimary']),
    doctorName: firstTrim(raw, ['idDiagUserText', 'doctorName', 'naDoctor', 'insertUserText']),
    deptName: firstTrim(raw, ['deptName', 'naDept']),
    raw,
  };
}

function mapInpatientOrder(item: HisInpatientOrderBody): HisInpatientOrder | null {
  const raw = item as unknown as Record<string, unknown>;
  const sourceName = firstTrim(raw, ['fullText', 'naOrd', 'displayText', 'name', 'naSrv']);
  const name = firstTrim(raw, ['name', 'naSrv']) ?? sourceName;
  if (!name && !sourceName) return null;
  const frequency = firstTrim(raw, ['frequencyText', 'idFreqText', 'frequency']);
  const route = firstTrim(raw, ['sdUsageText', 'idUsgeText', 'route']);
  const dose = firstTrim(raw, ['doseOnce', 'dose']);

  return {
    orderId: firstTrim(raw, ['idOrd', 'idOrder', 'orderId'])
      ?? [
        firstTrim(raw, ['groupId']),
        firstTrim(raw, ['orderIndex']),
        name ?? sourceName,
      ].filter(Boolean).join('-'),
    groupId: firstTrim(raw, ['idGrp', 'groupId']),
    name: name ?? sourceName ?? '',
    fullText: sourceName,
    displayText: firstTrim(raw, ['displayText']) ?? buildInpatientOrderDisplayText(sourceName, name, dose, firstTrim(raw, ['doseUnit']), frequency, route),
    orderType: firstTrim(raw, ['sdOrdText', 'sdSrvText', 'orderType', 'sdOrd', 'sdSrv']),
    status: firstTrim(raw, ['hiHosOrderStatusText', 'sdStatus', 'status', 'hiHosOrderStatus']),
    startTime: firstTrim(raw, ['dtBgn', 'startTime']),
    stopTime: firstTrim(raw, ['dtEnd', 'stopTime']),
    dose,
    frequency,
    route,
    quantity: firstNumber(raw, ['amount', 'quantity']),
    unit: firstTrim(raw, ['unitOrd', 'unit']),
    doctorName: firstTrim(raw, ['doctorName', 'naDoctor']),
    deptName: firstTrim(raw, ['deptName', 'naDept']),
    raw,
  };
}

function buildInpatientOrderDisplayText(
  sourceName: string | undefined,
  baseName: string | undefined,
  dose: string | undefined,
  doseUnit: string | undefined,
  frequency: string | undefined,
  route: string | undefined,
): string | undefined {
  if (sourceName && sourceName !== baseName) {
    return sourceName;
  }
  let text = baseName ?? sourceName ?? '';
  const doseText = dose && doseUnit ? `${dose}${doseUnit}` : undefined;
  text = appendOrderFragmentIfMissing(text, doseText);
  text = appendOrderFragmentIfMissing(text, route);
  text = appendOrderFragmentIfMissing(text, frequency);
  return text || undefined;
}

function appendOrderFragmentIfMissing(text: string, fragment: string | undefined): string {
  if (!fragment) return text;
  if (containsIgnoreSpaces(text, fragment)) return text;
  return text ? `${text} ${fragment}` : fragment;
}

function containsIgnoreSpaces(text: string, fragment: string): boolean {
  return text.replace(/\s+/g, '').toLowerCase().includes(fragment.replace(/\s+/g, '').toLowerCase());
}

function readDetailNumber(detail: string | undefined, labels: string[]): number | undefined {
  if (!detail) return undefined;

  const segments = detail
    .split(/[;；]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const [labelPart, valuePart] = segment.split(/[:：]/);
    if (!labelPart || valuePart === undefined) continue;
    if (!labels.some((label) => labelPart.includes(label))) continue;

    const matched = valuePart.match(/-?\d+(?:\.\d+)?/);
    if (!matched) continue;
    const value = Number(matched[0]);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function buildTemperatureRecordTime(raw: Record<string, unknown>): string | undefined {
  const explicit = firstTrim(raw, ['recordTime', 'dtRecord']);
  if (explicit) return explicit;

  const surveyedAt = firstTrim(raw, ['dtSurvey']);
  const timeText = firstTrim(raw, ['dtSdStr']);
  if (!surveyedAt) return firstTrim(raw, ['dateStr']);

  if (!timeText) return surveyedAt;

  const datePart = surveyedAt.split(/\s+/)[0];
  return datePart ? `${datePart} ${timeText}` : `${surveyedAt} ${timeText}`;
}

function mapInpatientTemperatureRecord(item: HisInpatientTemperatureRecordBody): HisInpatientTemperatureRecord | null {
  const raw = item as unknown as Record<string, unknown>;
  const recordTime = buildTemperatureRecordTime(raw);
  if (!recordTime) return null;
  const detailText = firstTrim(raw, ['detail']);

  return {
    recordTime,
    dtSurvey: firstTrim(raw, ['dtSurvey']),
    dateText: firstTrim(raw, ['dateStr']),
    timeText: firstTrim(raw, ['dtSdStr']),
    level: firstTrim(raw, ['level']),
    temperature: firstNumber(raw, ['temperature', 'temp']),
    temperatureType: firstTrim(raw, ['temperatureType', 'tempType']),
    isRetest: firstBool(raw, ['fgRetest']),
    retestTemperature: firstNumber(raw, ['tempRetest']),
    pulse: firstNumber(raw, ['pulse']),
    heartRate: firstNumber(raw, ['heartRate']),
    respiration: firstNumber(raw, ['respiration']) ?? readDetailNumber(detailText, ['呼吸']),
    bloodPressureSystolic: firstNumber(raw, ['bloodPressureSystolic', 'systolicPressure'])
      ?? readDetailNumber(detailText, ['收缩压']),
    bloodPressureDiastolic: firstNumber(raw, ['bloodPressureDiastolic', 'diastolicPressure'])
      ?? readDetailNumber(detailText, ['舒张压']),
    spo2: firstNumber(raw, ['spo2']) ?? readDetailNumber(detailText, ['血氧饱和度', '血氧']),
    painScore: firstNumber(raw, ['painScore']),
    intake: firstNumber(raw, ['intake']),
    output: firstNumber(raw, ['output']),
    stoolCount: firstNumber(raw, ['stoolCount']),
    urineVolume: firstNumber(raw, ['urineVolume']),
    weight: firstNumber(raw, ['weight']),
    detailText,
    raw,
  };
}

function mapInpatientTemperatureChart(
  query: HisInpatientQuery,
  chart: HisInpatientTemperatureChartBody,
): HisInpatientTemperatureChart {
  const raw = chart as unknown as Record<string, unknown>;
  const sourceRecords = Array.isArray(chart.records)
    ? chart.records
    : Array.isArray(chart.items)
      ? chart.items
      : [];
  const records = sourceRecords
    .map(mapInpatientTemperatureRecord)
    .filter((item): item is HisInpatientTemperatureRecord => Boolean(item));

  let todayRecords: HisInpatientTemperatureRecord[] = [];
  let historyRecords: HisInpatientTemperatureRecord[] = [];

  if (records.length > 0) {
    const getLocalDateString = (rec: HisInpatientTemperatureRecord): string => {
      const dateStr = rec.dtSurvey || rec.recordTime;
      if (!dateStr) return '';
      return dateStr.split(/\s+/)[0] || '';
    };

    let latestDate = '';
    records.forEach((rec) => {
      const d = getLocalDateString(rec);
      if (d && (!latestDate || d > latestDate)) {
        latestDate = d;
      }
    });

    if (latestDate) {
      records.forEach((rec) => {
        const d = getLocalDateString(rec);
        if (d === latestDate) {
          todayRecords.push(rec);
        } else {
          historyRecords.push(rec);
        }
      });
    } else {
      todayRecords = [records[0]];
      historyRecords = records.slice(1);
    }
  }

  return {
    patientId: firstTrim(raw, ['patientId', 'idPi'])
      ?? query.patientId
      ?? query.admissionId
      ?? query.inpatientVisitId
      ?? query.encounterId
      ?? '',
    inpatientVisitId: firstTrim(raw, ['inpatientVisitId', 'idVis']) ?? query.inpatientVisitId,
    records,
    todayRecords,
    historyRecords,
    raw,
  };
}

function mapInpatientRegistration(
  query: HisInpatientQuery,
  item: HisInpatientRegistrationBody,
): HisInpatientRegistrationInfo {
  const raw = item as unknown as Record<string, unknown>;
  const diagnoses = Array.isArray(item.diagList)
    ? item.diagList
      .map(mapInpatientDiagnosis)
      .filter((diagnosis): diagnosis is HisInpatientDiagnosis => Boolean(diagnosis))
    : [];
  return {
    patientId: firstTrim(raw, ['patientId', 'idPi'])
      ?? query.patientId
      ?? query.admissionId
      ?? query.inpatientVisitId
      ?? query.encounterId
      ?? '',
    name: firstTrim(raw, ['naPi', 'name']),
    gender: firstTrim(raw, ['sdSexText', 'gender', 'sdSex']),
    birthday: firstTrim(raw, ['birthday']),
    ageText: firstTrim(raw, ['age', 'ageText']),
    inHospitalAgeText: firstTrim(raw, ['inHosAge']),
    inpatientVisitId: firstTrim(raw, ['idAdsn', 'inpatientVisitId', 'idVis'])
      ?? query.admissionId
      ?? query.inpatientVisitId,
    inpatientNo: firstTrim(raw, ['cdHos', 'inpatientNo']),
    medicalRecordNo: firstTrim(raw, ['cdFile']),
    admissionNo: firstTrim(raw, ['admissionNo']),
    admissionTime: firstTrim(raw, ['dtInHos', 'admissionTime', 'dtAdmission']),
    clinicalTime: firstTrim(raw, ['dtClinical']),
    dischargeTime: firstTrim(raw, ['dischargeTime', 'dtDischarge']),
    deptId: firstTrim(raw, ['deptId', 'idDept']),
    deptName: firstTrim(raw, ['deptName', 'naDept']),
    wardId: firstTrim(raw, ['wardId', 'idWard']),
    wardName: firstTrim(raw, ['wardName', 'naWard']),
    bedNo: firstTrim(raw, ['bedNo', 'bedName']),
    attendingDoctorName: firstTrim(raw, ['attendingDoctorName', 'naDoctor']),
    residentDoctorId: firstTrim(raw, ['idHosUser']),
    attendingDoctorId: firstTrim(raw, ['idAttendUser']),
    chiefDoctorId: firstTrim(raw, ['idChiefUser']),
    admittingDoctorId: firstTrim(raw, ['idOdsUser']),
    nursingLevel: firstTrim(raw, ['nursingLevel']),
    admissionDiagnosis: firstTrim(raw, ['hosDiag', 'admissionDiagnosis']),
    admissionDiagnosisCode: firstTrim(raw, ['sdHosDiag']),
    dischargeDiagnosis: firstTrim(raw, ['odsDiag']),
    dischargeDiagnosisCode: firstTrim(raw, ['sdOdsDiag']),
    allergyText: firstTrim(raw, ['sdAllergyText', 'sdAllergy']),
    allergyItems: Array.isArray(item.sdAllergyList) ? item.sdAllergyList : undefined,
    isSevere: firstBool(raw, ['fgSevere']),
    isTransfer: firstBool(raw, ['isTransfer']),
    isGestation: firstBool(raw, ['fgGestation']),
    status: firstTrim(raw, ['status']),
    diagnoses: diagnoses.length > 0 ? diagnoses : undefined,
    raw,
  };
}

export class PhisHisAdapter implements HisAdapter {
  readonly vendor = 'phis';
  private visitPatientMap = new Map<string, string>();
  private lastPatientId?: string;

  constructor(private readonly service: HisService) {}

  updateContext(context: HisServiceContext): void {
    this.service.updateContext(context);
  }

  getDefaultExecDeptId(): string {
    return this.service.getDefaultExecDeptId();
  }

  // ---- 目录 ----

  async fetchDiagnosisCatalog(): Promise<DiagnosisCatalogEntry[]> {
    const items = await this.service.fetchDiagnosisCatalog();
    return items.map(mapDiagnosisCatalog);
  }

  async fetchInstitutionMedicalItemsCatalog(orgCode: string): Promise<MedicalItemCatalogEntry[]> {
    const items = await this.service.fetchInstitutionMedicalItemsCatalog(orgCode);
    return items.map(mapMedicalItemCatalog);
  }

  async fetchInstitutionMedicineCatalog(orgCode: string): Promise<MedicineCatalogEntry[]> {
    const items = await this.service.fetchInstitutionMedicineCatalog(orgCode);
    return items.map(mapMedicineCatalog);
  }

  fetchMedicineStoreIds(orgCode: string) {
    return this.service.fetchMedicineStoreIds(orgCode);
  }

  // ---- 字典 ----

  async fetchFrequencyDictionary(): Promise<DictionaryEntry[]> {
    return mapDictionaryItems(await this.service.fetchFrequencyDictionary());
  }

  async fetchMedicineUsageDictionary(): Promise<DictionaryEntry[]> {
    return mapDictionaryItems(await this.service.fetchMedicineUsageDictionary());
  }

  async fetchExecutionDepartments(): Promise<DictionaryEntry[]> {
    return mapDictionaryItems(await this.service.fetchExecutionDepartments());
  }

  fetchAvailablePharmacies() {
    return this.service.fetchAvailablePharmacies();
  }

  // ---- 详情 ----

  async fetchMedicalItemDetail(itemId: string): Promise<MedicalItemDetail | null> {
    const detail = await this.service.fetchMedicalItemDetail(itemId);
    if (!detail) return null;

    return {
      itemId: trim(detail.idCli) ?? itemId,
      itemName: trim(detail.naCli) ?? '',
      unit: trim(detail.unit),
      executingDeptId: trim(detail.idDeptExec),
      raw: detail as unknown as Record<string, unknown>,
    };
  }

  async fetchMedicalItemPartOptions(itemId: string): Promise<MedicalItemPartOption[]> {
    const items = await this.service.fetchMedicalItemPartOptions(itemId);
    return items
      .map(mapMedicalItemPartOption)
      .filter((item): item is MedicalItemPartOption => Boolean(item));
  }

  async fetchMedicineProDetail(productId: string, storeId: string): Promise<MedicineDetail | null> {
    const detail = await this.service.fetchMedicineProDetail(productId, storeId);
    if (!detail) return null;

    return {
      productId: trim(detail.idMedPro) ?? productId,
      productName: trim(detail.naMedPro) ?? '',
      medicineId: trim(detail.idMed),
      medicineName: trim(detail.naMed),
      active: detail.fgActive !== '0',

      specSale: trim(detail.specSale),
      unitSale: trim(detail.unitSale),
      spec: trim(detail.spec),
      doseUnit: trim(detail.unitDose) ?? trim(detail.unitPre),
      dose: trim(detail.dose),

      defaultSingleDose: trim(detail.dftDoseOnce),
      defaultFrequency: trim(detail.dftFreq),
      defaultRoute: trim(detail.dftUsage),

      storeId: trim(detail.idSto) ?? storeId,
      needsSkinTest: detail.fgSkintest === '1',

      raw: detail as unknown as Record<string, unknown>,
    };
  }

  // ---- 库存校验 ----

  checkMedicineInventoryEnough(items: InventoryCheckRequest[]): Promise<InventoryCheckResult> {
    if (items.length === 0) {
      return Promise.resolve({ code: 200, message: '' });
    }

    const phisItems = items.map((item) => ({
      idSto: item.storeId,
      idMedPro: item.productId,
      naMed: item.medicineName,
      amount: item.quantity,
      priceSale: item.unitPrice,
      sdFrzBiz: PHIS_BUSINESS_TYPE_MAP[item.businessType],
    }));

    return this.service
      .checkMedicineInventoryEnough(phisItems)
      .then((result) => ({ code: result.code, message: result.msg }));
  }

  // ---- 接诊与患者信息 ----

  async fetchPatientInfo(patientId: string): Promise<HisPatientInfo | null> {
    const idPi = trim(patientId);
    if (!idPi) return null;

    const detail = await this.service.searchPatientByIdPi(idPi);
    if (!detail) return null;

    const sdSex = trim(detail.sdSex);
    const gender: HisPatientInfo['gender'] = sdSex === '1' ? 'M' : sdSex === '2' ? 'F' : 'O';

    // 仅当 ageUnit 为年（'Y'）时把 ageNum 当作"岁"返回；其它单位（D/M）下
    // ageNum 不是岁数，留空让上层只用 ageText 展示
    const ageUnit = trim(detail.ageUnit)?.toUpperCase();
    const age = ageUnit === 'Y' && typeof detail.ageNum === 'number' ? detail.ageNum : undefined;

    return {
      patientId: trim(detail.idPi) ?? idPi,
      name: trim(detail.naPi) ?? '',
      gender,
      age,
      ageText: trim(detail.ageText),
      idNo: trim(detail.idCard),
      mobilePhone: trim(detail.mobilePhone),
      raw: detail as unknown as Record<string, unknown>,
    };
  }

  async fetchPatientHistory(patientId: string): Promise<HisPatientHistory | null> {
    const idPi = trim(patientId);
    if (!idPi) return null;

    // 1) 并发拉过敏史与就诊列表；任一失败不中断另一路
    const [allergyItems, visitItems] = await Promise.all([
      this.service.queryPatientAllergy(idPi).catch((error) => {
        console.warn('[PhisHisAdapter] queryPatientAllergy failed', error);
        return [];
      }),
      this.service.queryPatientVisitHistory(idPi, 5).catch((error) => {
        console.warn('[PhisHisAdapter] queryPatientVisitHistory failed', error);
        return [] as HisVisitHistoryItem[];
      }),
    ]);

    const allergyHistory = allergyItems
      .map((item) => trim(item.naAliergy))
      .filter((value): value is string => Boolean(value));

    // 2) 对列表中的每条并发拉明细（失败跳过该条）
    const detailEntries = await Promise.all(
      visitItems.map(async (visit) => {
        const idVis = trim(visit.idVis);
        if (!idVis) return null;
        const visitIdPi = trim(visit.idPi) ?? idPi;
        try {
          const detail = await this.service.loadClinicMedicalRecord(idVis, visitIdPi);
          return detail ? { visit, detail } : null;
        } catch (error) {
          console.warn('[PhisHisAdapter] loadClinicMedicalRecord failed', { idVis, error });
          return null;
        }
      })
    );

    const visits: HisVisitRecord[] = detailEntries
      .filter((entry): entry is { visit: HisVisitHistoryItem; detail: HisVisitDetailBody } => Boolean(entry))
      .map(({ visit, detail }) => mapVisitDetail(visit, detail));

    return {
      patientId: idPi,
      allergyHistory: allergyHistory.length > 0 ? allergyHistory : undefined,
      pastMedicalHistory: undefined,
      visits: visits.length > 0 ? visits : undefined,
      raw: {
        allergyItems,
        visitItems,
      },
    };
  }

  // ---- 住院上下文 ----

  async fetchInpatientDiagnoses(query: HisInpatientQuery): Promise<HisInpatientDiagnosis[]> {
    const items = await this.service.queryInpatientDiagnoses(query);
    return items
      .map(mapInpatientDiagnosis)
      .filter((item): item is HisInpatientDiagnosis => Boolean(item));
  }

  async fetchInpatientOrders(query: HisInpatientQuery): Promise<HisInpatientOrder[]> {
    const items = await this.service.queryInpatientOrders(query);
    return items
      .map(mapInpatientOrder)
      .filter((item): item is HisInpatientOrder => Boolean(item));
  }

  async fetchInpatientTemperatureChart(query: HisInpatientQuery): Promise<HisInpatientTemperatureChart | null> {
    const chart = await this.service.queryInpatientTemperatureChart(query);
    return chart ? mapInpatientTemperatureChart(query, chart) : null;
  }

  async fetchInpatientRegistration(query: HisInpatientQuery): Promise<HisInpatientRegistrationInfo | null> {
    const registration = await this.service.loadInpatientRegistration(query);
    return registration ? mapInpatientRegistration(query, registration) : null;
  }

  async fetchInpatientEmrContext(query: HisInpatientEmrContextQuery): Promise<HisInpatientEmrContextPackage | null> {
    return this.service.buildInpatientEmrContext(query);
  }

  async fetchOutpatientVisitHistory(patientId: string, limit = 3): Promise<HisOutpatientVisit[]> {
    const idPi = trim(patientId);
    if (!idPi) return [];
    this.lastPatientId = idPi;

    try {
      const visitItems = await this.service.queryPatientVisitHistory(idPi, limit);
      if (!Array.isArray(visitItems) || visitItems.length === 0) {
        return [];
      }

      // 并发拉取明细以填充主诉和诊断
      const detailEntries = await Promise.all(
        visitItems.map(async (visit) => {
          const idVis = trim(visit.idVis);
          if (!idVis) return null;
          const visitIdPi = trim(visit.idPi) ?? idPi;
          
          // 填充 Map
          this.visitPatientMap.set(idVis, visitIdPi);

          try {
            const detail = await this.service.loadClinicMedicalRecord(idVis, visitIdPi);
            return detail ? { visit, detail } : { visit, detail: null };
          } catch (error) {
            console.warn('[PhisHisAdapter] loadClinicMedicalRecord failed in fetchOutpatientVisitHistory', { idVis, error });
            return { visit, detail: null };
          }
        })
      );

      return detailEntries
        .filter((entry): entry is { visit: HisVisitHistoryItem; detail: HisVisitDetailBody | null } => Boolean(entry))
        .map(({ visit, detail }) => {
          const visitId = trim(visit.idVis) ?? '';
          const visitDate = firstTrim(visit, ['dtVis', 'dtVisit', 'visitTime']) ?? new Date().toISOString();
          const deptName = firstTrim(visit, ['deptName', 'naDept', 'naDeptExec']);

          let diagnoses: string[] = [];
          let chiefComplaint: string | undefined;

          if (detail) {
            diagnoses = (detail.diagList ?? [])
              .map((d) => trim(d.naDiag) ?? trim(d.naIcd10))
              .filter((v): v is string => Boolean(v));
            const soap = detail.soapData ?? {};
            chiefComplaint = trim((soap as Record<string, unknown>)['chiefComplaint'] as string | undefined);
          } else {
            const rawDiag = firstTrim(visit, ['naDiag', 'diagnoses', 'diagnosis']);
            if (rawDiag) {
              diagnoses = [rawDiag];
            }
            chiefComplaint = firstTrim(visit, ['chiefComplaint', 'complaint']);
          }

          return {
            visitId,
            visitDate,
            deptName,
            diagnoses: diagnoses.length > 0 ? diagnoses : undefined,
            chiefComplaint,
            raw: {
              ...visit,
              detail,
            },
          };
        });
    } catch (error) {
      console.error('[PhisHisAdapter] fetchOutpatientVisitHistory failed', error);
      return [];
    }
  }

  async fetchOutpatientMedicalRecord(visitId: string): Promise<HisOutpatientMedicalRecord | null> {
    const idVis = trim(visitId);
    if (!idVis) return null;

    const idPi = this.visitPatientMap.get(idVis) ?? this.lastPatientId;
    if (!idPi) {
      console.warn('[PhisHisAdapter] Cannot resolve patientId for visitId', idVis);
      return null;
    }

    try {
      const detail = await this.service.loadClinicMedicalRecord(idVis, idPi);
      if (!detail) return null;

      const soapRaw = (detail.soapData ?? {}) as Record<string, unknown>;
      const chiefComplaint = trim(soapRaw.chiefComplaint as string);
      const historyOfPresentIllness = trim(soapRaw.presentIllness as string) ?? trim(soapRaw.historyOfPresentIllness as string);
      const pastHistory = trim(soapRaw.pastHistory as string) ?? trim(soapRaw.pastMedicalHistory as string);
      const physicalExamination = trim(soapRaw.physicalExam as string) ?? trim(soapRaw.physicalExamination as string);
      const auxiliaryExamination = trim(soapRaw.auxiliaryExam as string) ?? trim(soapRaw.auxiliaryExamination as string);

      const diagnoses = (detail.diagList ?? [])
        .map((d) => trim(d.naDiag) ?? trim(d.naIcd10))
        .filter((value): value is string => Boolean(value));
      const diagnosis = diagnoses.join(', ') || undefined;

      const treatmentPlan = (detail.orderList ?? [])
        .map((o) => {
          const name = trim(o.naOrd) ?? '';
          const des = trim(o.desOrd) ? `（${trim(o.desOrd)}）` : '';
          return `${name}${des}`;
        })
        .filter(Boolean)
        .join('; ') || undefined;

      const deptName = trim(detail.deptName as string) ?? trim(detail.naDept as string) ?? '未知科室';
      const visitDate = trim(detail.visitTime as string) ?? trim(detail.dtVis as string) ?? new Date().toISOString().split('T')[0];

      // 生成精美的 HTML 病历
      const htmlContent = `
        <div class="outpatient-record-preview" style="font-family: Inter, system-ui, -apple-system, sans-serif; padding: 20px; color: #1e293b; background: #ffffff; border-radius: 8px; max-width: 680px; margin: 0 auto; line-height: 1.6;">
          <h2 style="text-align: center; margin: 0 0 20px 0; color: #0f172a; font-size: 18px; font-weight: 700; border-bottom: 2px solid #0f8f7b; padding-bottom: 12px; letter-spacing: 0.5px;">门急诊病历记录</h2>
          
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px;">
            <div><span style="color: #64748b; font-weight: 500;">就诊科室：</span><span style="color: #334155; font-weight: 600;">${deptName}</span></div>
            <div><span style="color: #64748b; font-weight: 500;">就诊日期：</span><span style="color: #334155;">${visitDate}</span></div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 16px; font-size: 14px;">
            ${chiefComplaint ? `
            <div>
              <div style="font-weight: 700; color: #0f8f7b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 3px; height: 12px; background: #0f8f7b; display: inline-block; border-radius: 2px;"></span>主诉
              </div>
              <div style="padding-left: 9px; color: #334155;">${chiefComplaint}</div>
            </div>` : ''}

            ${historyOfPresentIllness ? `
            <div>
              <div style="font-weight: 700; color: #0f8f7b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 3px; height: 12px; background: #0f8f7b; display: inline-block; border-radius: 2px;"></span>现病史
              </div>
              <div style="padding-left: 9px; color: #334155;">${historyOfPresentIllness}</div>
            </div>` : ''}

            ${pastHistory ? `
            <div>
              <div style="font-weight: 700; color: #0f8f7b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 3px; height: 12px; background: #0f8f7b; display: inline-block; border-radius: 2px;"></span>既往史
              </div>
              <div style="padding-left: 9px; color: #334155;">${pastHistory}</div>
            </div>` : ''}

            ${physicalExamination ? `
            <div>
              <div style="font-weight: 700; color: #0f8f7b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 3px; height: 12px; background: #0f8f7b; display: inline-block; border-radius: 2px;"></span>体格检查
              </div>
              <div style="padding-left: 9px; color: #334155;">${physicalExamination}</div>
            </div>` : ''}

            ${auxiliaryExamination ? `
            <div>
              <div style="font-weight: 700; color: #0f8f7b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 3px; height: 12px; background: #0f8f7b; display: inline-block; border-radius: 2px;"></span>辅助检查
              </div>
              <div style="padding-left: 9px; color: #334155;">${auxiliaryExamination}</div>
            </div>` : ''}

            ${diagnosis ? `
            <div>
              <div style="font-weight: 700; color: #0f8f7b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 3px; height: 12px; background: #0f8f7b; display: inline-block; border-radius: 2px;"></span>初步诊断
              </div>
              <div style="padding-left: 9px; color: #0f172a; font-weight: 600;">${diagnosis}</div>
            </div>` : ''}

            ${treatmentPlan ? `
            <div>
              <div style="font-weight: 700; color: #0f8f7b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 3px; height: 12px; background: #0f8f7b; display: inline-block; border-radius: 2px;"></span>治疗意见/处置
              </div>
              <div style="padding-left: 9px; color: #334155;">${treatmentPlan}</div>
            </div>` : ''}
          </div>
        </div>
      `;

      return {
        visitId,
        chiefComplaint,
        historyOfPresentIllness,
        pastHistory,
        physicalExamination,
        auxiliaryExamination,
        diagnosis,
        treatmentPlan,
        htmlContent,
        raw: detail as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error('[PhisHisAdapter] fetchOutpatientMedicalRecord failed', error);
      return null;
    }
  }
}
