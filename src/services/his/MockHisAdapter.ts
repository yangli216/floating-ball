/**
 * MockHisAdapter
 *
 * 不连接任何真实 HIS 的内置适配器，主要用途：
 * 1. **反向验证抽象层是否够用**：能用 mock 跑通业务路径，说明 `HisAdapter` 接口
 *    没有泄漏 PHIS 私有概念（如果某处不得不读 `raw.idMedPro` 才能工作，那就是抽象漏了）。
 * 2. **本地 demo / E2E**：在没有 PHIS 后端时也能演示语音问诊、用药/检查推荐等功能。
 * 3. **新厂商接入示例**：照着实现一遍即可，不用读 `HisService` 950 行旧代码。
 *
 * 启用方式：
 * ```ts
 * import { registerHisAdapterFactory, setActiveHisVendor, MockHisAdapter } from '@/services/his';
 * registerHisAdapterFactory('mock', () => new MockHisAdapter());
 * setActiveHisVendor('mock');
 * ```
 * 或在 .env 里：`VITE_HIS_VENDOR=mock`（仍需在某处调用一次注册）。
 *
 * 行为约定：
 * - 所有"目录"返回内置的少量样本数据（仅用于 mock / demo，不参与运行时 CSV 兜底）。
 * - 所有"详情"按入参伪造一份合理结构。
 * - 库存校验固定通过。
 * - 没有 token / baseUrl 概念，永远 ready。
 */

import type { HisAdapter, HisServiceContext, PharmacyOption } from './HisAdapter';
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
  HisInpatientEmrContextPackage,
  HisInpatientEmrContextQuery,
  HisInpatientOrder,
  HisInpatientQuery,
  HisInpatientRegistrationInfo,
  HisInpatientTemperatureChart,
} from './types';

const MOCK_DIAGNOSES: DiagnosisCatalogEntry[] = [
  { id: 'mock-dx-1', code: 'J00', name: '急性鼻咽炎[普通感冒]', keywords: ['感冒', 'gm', 'ganmao'] },
  { id: 'mock-dx-2', code: 'J20.9', name: '急性支气管炎', keywords: ['支气管炎', 'zqgy'] },
  { id: 'mock-dx-3', code: 'I10.x00', name: '原发性高血压', keywords: ['高血压', 'gxy'] },
];

const MOCK_MEDICINES: MedicineCatalogEntry[] = [
  { id: 'mock-med-1', code: 'M001', name: '阿莫西林胶囊', spec: '0.25g*24粒/盒' },
  { id: 'mock-med-2', code: 'M002', name: '布洛芬缓释胶囊', spec: '0.3g*20粒/盒' },
  { id: 'mock-med-3', code: 'M003', name: '苯磺酸氨氯地平片', spec: '5mg*7片/盒' },
];

const MOCK_MEDICAL_ITEMS: MedicalItemCatalogEntry[] = [
  { id: 'mock-itm-1', code: 'EX001', name: '血常规', category: '检验', keywords: ['血常规', 'xcg'] },
  { id: 'mock-itm-2', code: 'EX002', name: '胸部正位X线', category: '检查', keywords: ['胸片', 'xp'] },
  { id: 'mock-itm-3', code: 'EX003', name: '心电图', category: '检查', keywords: ['心电图', 'xdt'] },
];

const MOCK_FREQUENCIES: DictionaryEntry[] = [
  { key: 'qd', text: '每日一次', py: 'mryc', properties: { execCount: 1 } },
  { key: 'bid', text: '每日两次', py: 'mrlc', properties: { execCount: 2 } },
  { key: 'tid', text: '每日三次', py: 'mrsc', properties: { execCount: 3 } },
  { key: 'qid', text: '每日四次', py: 'mrsic', properties: { execCount: 4 } },
];

const MOCK_USAGES: DictionaryEntry[] = [
  { key: 'po', text: '口服', py: 'kf' },
  { key: 'im', text: '肌肉注射', py: 'jrzs' },
  { key: 'iv', text: '静脉注射', py: 'jmzs' },
  { key: 'ext', text: '外用', py: 'wy' },
];

const MOCK_DEPTS: DictionaryEntry[] = [
  { key: 'dept-001', text: '全科', py: 'qk' },
  { key: 'dept-002', text: '检验科', py: 'jyk' },
  { key: 'dept-003', text: '放射科', py: 'fsk' },
];

const MOCK_PHARMACIES: PharmacyOption[] = [
  { idDept: 'dept-pharm-001', idSto: 'sto-001', name: '门诊药房' },
  { idDept: 'dept-pharm-002', idSto: 'sto-002', name: '住院药房' },
];

export class MockHisAdapter implements HisAdapter {
  readonly vendor = 'mock';

  private execDeptId = 'dept-001';

  private resolveMockInpatientPatientId(query: HisInpatientQuery): string {
    return query.patientId ?? query.admissionId ?? query.inpatientVisitId ?? query.encounterId ?? 'mock-patient';
  }

  updateContext(context: HisServiceContext): void {
    // mock 仅记录第一个角色科室，作为默认执行科室
    const first = context?.userRoleDeptIds?.[0];
    if (first) {
      this.execDeptId = first;
    }
  }

  getDefaultExecDeptId(): string {
    return this.execDeptId;
  }

  // ---- 目录 ----

  async fetchDiagnosisCatalog(): Promise<DiagnosisCatalogEntry[]> {
    return MOCK_DIAGNOSES.map((d) => ({ ...d }));
  }

  async fetchInstitutionMedicalItemsCatalog(_orgCode: string): Promise<MedicalItemCatalogEntry[]> {
    return MOCK_MEDICAL_ITEMS.map((i) => ({ ...i }));
  }

  async fetchInstitutionMedicineCatalog(_orgCode: string): Promise<MedicineCatalogEntry[]> {
    return MOCK_MEDICINES.map((m) => ({ ...m }));
  }

  async fetchMedicineStoreIds(_orgCode: string): Promise<string[]> {
    return MOCK_PHARMACIES.map((p) => p.idSto).filter((id): id is string => !!id);
  }

  // ---- 字典 ----

  async fetchFrequencyDictionary(): Promise<DictionaryEntry[]> {
    return MOCK_FREQUENCIES.map((f) => ({ ...f }));
  }

  async fetchMedicineUsageDictionary(): Promise<DictionaryEntry[]> {
    return MOCK_USAGES.map((u) => ({ ...u }));
  }

  async fetchExecutionDepartments(): Promise<DictionaryEntry[]> {
    return MOCK_DEPTS.map((d) => ({ ...d }));
  }

  async fetchAvailablePharmacies(): Promise<PharmacyOption[]> {
    return MOCK_PHARMACIES.map((p) => ({ ...p }));
  }

  // ---- 详情 ----

  async fetchMedicalItemDetail(itemId: string): Promise<MedicalItemDetail | null> {
    const cat = MOCK_MEDICAL_ITEMS.find((i) => i.id === itemId);
    if (!cat) return null;
    return {
      itemId: cat.id,
      itemName: cat.name,
      unit: '次',
      executingDeptId: this.execDeptId,
      raw: { mock: true },
    };
  }

  async fetchMedicalItemPartOptions(itemId: string): Promise<MedicalItemPartOption[]> {
    const cat = MOCK_MEDICAL_ITEMS.find((i) => i.id === itemId || i.code === itemId);
    if (!cat || cat.category !== 'exam') return [];
    return [{
      partId: 'mock-part-none',
      itemId: cat.id,
      name: '无部位',
      partAndWay: '无部位',
      raw: { mock: true },
    }];
  }

  async fetchMedicineProDetail(productId: string, storeId: string): Promise<MedicineDetail | null> {
    const cat = MOCK_MEDICINES.find((m) => m.id === productId);
    if (!cat) return null;
    return {
      productId: cat.id,
      productName: cat.name,
      medicineId: cat.id,
      medicineName: cat.name,
      active: true,
      specSale: cat.spec,
      unitSale: '盒',
      spec: cat.spec,
      doseUnit: 'mg',
      dose: '1',
      defaultSingleDose: '1',
      defaultFrequency: 'tid',
      defaultRoute: 'po',
      storeId,
      needsSkinTest: false,
      raw: { mock: true },
    };
  }

  // ---- 库存校验 ----

  async checkMedicineInventoryEnough(_items: InventoryCheckRequest[]): Promise<InventoryCheckResult> {
    return { code: 200, message: '' };
  }

  // ---- 接诊与患者信息 ----

  async fetchPatientInfo(patientId: string): Promise<HisPatientInfo | null> {
    return {
      patientId,
      name: '测试患者(Mock)',
      gender: 'M',
      age: 35,
      ageText: '35岁',
      idNo: '110105198801011234',
      insuranceType: '自费',
      raw: { mock: true },
    };
  }

  async fetchPatientHistory(patientId: string): Promise<HisPatientHistory | null> {
    return {
      patientId,
      allergyHistory: ['青霉素过敏'],
      pastMedicalHistory: ['高血压史3年'],
      visits: [
        {
          visitTime: Date.now() - 7 * 24 * 3600 * 1000,
          chiefComplaint: '咳嗽、咳痰3天',
          presentIllness: '患者3天前受凉后出现咳嗽，咳少量白痰，无发热。',
          diagnoses: ['急性支气管炎'],
          medications: ['阿莫西林胶囊', '复方鲜竹沥液'],
        }
      ],
      raw: { mock: true },
    };
  }

  // ---- 住院上下文 ----

  async fetchInpatientDiagnoses(query: HisInpatientQuery): Promise<HisInpatientDiagnosis[]> {
    const registration = await this.fetchInpatientRegistration(query);
    return registration?.diagnoses ?? [];
  }

  async fetchInpatientOrders(query: HisInpatientQuery): Promise<HisInpatientOrder[]> {
    const patientId = this.resolveMockInpatientPatientId(query);
    return [
      {
        orderId: 'mock-inp-ord-1',
        groupId: 'mock-inp-group-1',
        name: '阿莫西林胶囊',
        fullText: '阿莫西林胶囊 0.5g 口服 每日三次',
        displayText: '阿莫西林胶囊 0.5g 口服 每日三次',
        orderType: '药品',
        status: '执行中',
        startTime: '2026-06-01 10:00:00',
        dose: '0.5g',
        frequency: '每日三次',
        route: '口服',
        quantity: 1,
        unit: '盒',
        doctorName: 'Mock医生',
        deptName: '全科病区',
        raw: { mock: true, patientId, idAdsn: query.admissionId },
      },
    ];
  }

  async fetchInpatientTemperatureChart(query: HisInpatientQuery): Promise<HisInpatientTemperatureChart | null> {
    const patientId = this.resolveMockInpatientPatientId(query);
    const records = [
      {
        recordTime: '2026-06-01 14:00:00',
        dtSurvey: '2026-06-01 00:00:00',
        temperature: 38.2,
        temperatureType: '腋温',
        pulse: 92,
        heartRate: 92,
        respiration: 20,
        bloodPressureSystolic: 126,
        bloodPressureDiastolic: 78,
        spo2: 98,
        raw: { mock: true },
      },
    ];
    return {
      patientId,
      inpatientVisitId: query.inpatientVisitId,
      records,
      todayRecords: records,
      historyRecords: [],
      raw: { mock: true },
    };
  }

  async fetchInpatientRegistration(query: HisInpatientQuery): Promise<HisInpatientRegistrationInfo | null> {
    const patientId = this.resolveMockInpatientPatientId(query);
    const diagnoses: HisInpatientDiagnosis[] = [
      {
        id: 'mock-inp-dx-1',
        code: 'J20.9',
        name: '急性支气管炎',
        diagnosisType: '入院诊断',
        diagnosedAt: '2026-06-01 09:30:00',
        isPrimary: true,
        doctorName: 'Mock医生',
        deptName: '全科病区',
        raw: { mock: true, patientId, idAdsn: query.admissionId },
      },
    ];
    return {
      patientId,
      name: '测试住院患者(Mock)',
      gender: '男性',
      ageText: '35岁',
      inHospitalAgeText: '35岁',
      inpatientVisitId: query.admissionId ?? query.inpatientVisitId ?? 'mock-inp-vis-1',
      inpatientNo: query.inpatientNo ?? 'ZY000001',
      medicalRecordNo: 'MR000001',
      admissionNo: 'ADM000001',
      admissionTime: '2026-06-01 08:30:00',
      clinicalTime: '2026-06-01 09:30:00',
      deptId: 'dept-001',
      deptName: '全科病区',
      wardId: query.wardId ?? 'ward-001',
      wardName: '综合病区',
      bedNo: '12床',
      attendingDoctorName: 'Mock医生',
      nursingLevel: '二级护理',
      admissionDiagnosis: '急性支气管炎',
      admissionDiagnosisCode: 'J20.9',
      allergyText: '青霉素过敏',
      isSevere: false,
      isTransfer: false,
      isGestation: false,
      status: '在院',
      diagnoses,
      raw: { mock: true },
    };
  }

  async fetchInpatientEmrContext(query: HisInpatientEmrContextQuery): Promise<HisInpatientEmrContextPackage | null> {
    const registration = await this.fetchInpatientRegistration(query);
    const orders = await this.fetchInpatientOrders(query);
    const temperatureChart = await this.fetchInpatientTemperatureChart(query);
    const recordDate = query.recordDate || (query.recordTime || '').split(/\s+/)[0] || '2026-06-01';
    const recordDateItems = temperatureChart?.todayRecords || [];
    const latestBeforeRecordDate = temperatureChart?.historyRecords?.[0] || temperatureChart?.records?.[0] || null;

    return {
      documentContext: {
        admissionId: query.admissionId,
        templateId: query.templateId,
        templateName: query.templateName,
        recordType: query.templateName || '日常病程记录',
        recordTime: query.recordTime,
        recordDate,
      },
      patient: registration ? {
        patientId: registration.patientId,
        name: registration.name,
        sex: registration.gender,
        age: registration.ageText,
        inpatientNo: registration.inpatientNo,
        medicalRecordNo: registration.medicalRecordNo,
      } : undefined,
      admission: registration ? {
        admissionTime: registration.admissionTime,
        department: registration.deptName,
        ward: registration.wardName,
        bedNo: registration.bedNo,
        attendingDoctor: registration.attendingDoctorName,
        allergyText: registration.allergyText,
        chiefComplaint: '咳嗽、咳痰3天',
        admissionCondition: '神志清，精神可，步入病房',
        severeFlag: false,
      } : undefined,
      diagnoses: registration?.diagnoses,
      vitals: {
        recordDateItems,
        latestBeforeRecordDate,
        summary: recordDateItems.length > 0
          ? '本日体温单显示体温38.2℃，血压126/78mmHg。'
          : '本日体温单暂无记录；最近一次体温单显示体温38.2℃，血压126/78mmHg。',
      },
      orders: {
        active: orders,
        changedNearRecordDate: [],
        summary: '目前予抗感染、止咳化痰等治疗，长期医嘱执行中。',
      },
      labs: {
        abnormal: [],
        recentKeyResults: [],
        summary: '',
      },
      exams: [],
      previousRecords: {
        recentNotes: [
          {
            recordTime: '2026-06-01 10:00',
            recordType: '入院记录',
            recordName: '入院记录',
            medType: '0',
            recordCategory: '入院记录',
            chiefComplaint: '咳嗽、咳痰3天',
            presentIllness: '患者3天前受凉后出现咳嗽，咳少量白痰，无明显发热、胸闷气促。',
            summary: '入院记录；主诉：咳嗽、咳痰3天；现病史：患者3天前受凉后出现咳嗽，咳少量白痰。',
          },
        ],
        longStaySummary: '',
      },
      consultations: [],
      operations: [],
      dataQuality: {
        hasRecordDateVitals: recordDateItems.length > 0,
        latestVitalsDate: latestBeforeRecordDate?.recordTime?.split(/\s+/)[0] || '',
        truncated: true,
        truncatedReason: 'Mock 上下文仅返回演示数据。',
      },
    };
  }
}
