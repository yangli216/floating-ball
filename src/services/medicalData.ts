// @ts-ignore
import diagnosesRaw from '../assets/diagnoses.csv?raw';
// @ts-ignore
import medicinesRaw from '../assets/medicines.csv?raw';
// @ts-ignore
import itemsRaw from '../assets/items.csv?raw';
// @ts-ignore
import tcmDiagnosesRaw from '../assets/tcm-diagnoses.csv?raw';
// @ts-ignore
import tcmSyndromesRaw from '../assets/tcm-syndromes.csv?raw';
// @ts-ignore
import tcmTreatmentsRaw from '../assets/tcm-treatments.csv?raw';
import { invoke } from '@tauri-apps/api/core';
import {
  getHisService,
  type HisDiagnosisCatalogItem,
  type HisMedicalItemCatalogItem,
  type HisMedicineCatalogItem,
  type HisService
} from './hisService';
import { isRegionalMode, regionalGet } from './regionalClient';

export interface DiagnosisItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface TCMDiagnosisItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface TCMSyndromeItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface TCMTreatmentItem {
  id: string;
  code: string;
  name: string;
  keywords?: string[];
}

export interface MedicineItem {
  id: string;
  name: string;
  spec: string;
  idSrv?: string;
  naSrv?: string;
  sdSrv?: string;
  idDeptExec?: string;
  fgCheckOrd?: string;
  fgSkintest?: string;
  raw?: Record<string, unknown>;
}

export interface MedicalItem {
  id: string;
  code: string;
  name: string;
  category: string;
  keywords?: string[];
  idSrv?: string;
  naSrv?: string;
  sdSrv?: string;
  idDeptExec?: string;
  idPart?: string;
  jsonField?: string;
  fgCheckOrd?: string;
  raw?: Record<string, unknown>;
}

export interface MedicalCatalog {
  diagnoses: DiagnosisItem[];
  tcmDiagnoses: TCMDiagnosisItem[];
  tcmSyndromes: TCMSyndromeItem[];
  tcmTreatments: TCMTreatmentItem[];
  medicines: MedicineItem[];
  items: MedicalItem[];
}

export interface Icd10CategoryInfo {
  key: string;
  range: string;
  title: string;
  order: number;
}

export interface MedicalCatalogContext {
  orgCode?: string | null;
}

interface MedicalCatalogSnapshot {
  diagnoses: DiagnosisItem[];
  diagnosisSyncedAt?: number | null;
  items: MedicalItem[];
  itemSyncDate?: string | null;
  medicines: MedicineItem[];
  medicineSyncDate?: string | null;
}

export interface MedicalCatalogDebugState {
  dbPath: string;
  diagnosisCount: number;
  itemCount: number;
  medicineCount: number;
  syncStates: Array<{
    catalogType: string;
    orgCode: string;
    lastSyncAt: number;
    syncDate?: string | null;
    rowCount: number;
  }>;
}

export interface MedicalCatalogClearOptions {
  catalogType?: 'all' | 'diagnoses' | 'items' | 'medicines';
  orgCode?: string;
}

export interface MedicalCatalogClearResult {
  diagnosisRows: number;
  itemRows: number;
  medicineRows: number;
  syncStateRows: number;
}

interface MatchVariant {
  normalized: string;
  weight: number;
  normalizedRoutineAlias: string;
}

interface ScoredCandidate<T> {
  item: T;
  score: number;
  primaryScore: number;
}

export type CatalogMatchStatus = 'exact' | 'probable' | 'unmatched';

export interface CatalogMatchAssessment<T> {
  status: CatalogMatchStatus;
  candidate: T | null;
  confidence: number;
}

const ICD10_CATEGORY_GROUPS: Icd10CategoryInfo[] = [
  { key: 'A00-B99', range: 'A00-B99', title: '某些传染病和寄生虫病', order: 1 },
  { key: 'C00-D48', range: 'C00-D48', title: '肿瘤', order: 2 },
  { key: 'D50-D89', range: 'D50-D89', title: '血液和造血器官疾病及某些涉及免疫机制的疾患', order: 3 },
  { key: 'E00-E90', range: 'E00-E90', title: '内分泌、营养和代谢疾病', order: 4 },
  { key: 'F00-F99', range: 'F00-F99', title: '精神和行为障碍', order: 5 },
  { key: 'G00-G99', range: 'G00-G99', title: '神经系统疾病', order: 6 },
  { key: 'H00-H59', range: 'H00-H59', title: '眼和附器疾病', order: 7 },
  { key: 'H60-H95', range: 'H60-H95', title: '耳和乳突疾病', order: 8 },
  { key: 'I00-I99', range: 'I00-I99', title: '循环系统疾病', order: 9 },
  { key: 'J00-J99', range: 'J00-J99', title: '呼吸系统疾病', order: 10 },
  { key: 'K00-K93', range: 'K00-K93', title: '消化系统疾病', order: 11 },
  { key: 'L00-L99', range: 'L00-L99', title: '皮肤和皮下组织疾病', order: 12 },
  { key: 'M00-M99', range: 'M00-M99', title: '肌肉骨骼系统和结缔组织疾病', order: 13 },
  { key: 'N00-N99', range: 'N00-N99', title: '泌尿生殖系统疾病', order: 14 },
  { key: 'O00-O99', range: 'O00-O99', title: '妊娠、分娩和产褥期', order: 15 },
  { key: 'P00-P96', range: 'P00-P96', title: '起源于围生期的某些情况', order: 16 },
  { key: 'Q00-Q99', range: 'Q00-Q99', title: '先天性畸形、变形和染色体异常', order: 17 },
  { key: 'R00-R99', range: 'R00-R99', title: '症状、体征和临床与实验室异常所见，不可归类在他处者', order: 18 },
  { key: 'S00-T98', range: 'S00-T98', title: '损伤、中毒和外因的某些其他后果', order: 19 },
  { key: 'V01-Y98', range: 'V01-Y98', title: '疾病和死亡的外因', order: 20 },
  { key: 'Z00-Z99', range: 'Z00-Z99', title: '影响健康状态和与保健机构接触的因素', order: 21 },
  { key: 'U00-U99', range: 'U00-U99', title: '用于特殊目的的编码', order: 22 }
];

class MedicalDataService {
  private static readonly PROBABLE_MATCH_THRESHOLD = 0.86;
  private static readonly PROBABLE_MATCH_MARGIN = 0.08;
  private static readonly DATA_CACHE_KEY = 'REGIONAL_MEDICAL_DATA_CACHE';
  private static readonly DATA_VERSION_KEY = 'REGIONAL_MEDICAL_DATA_VERSION';

  private catalog: MedicalCatalog;
  private currentOrgCode: string | null = null;
  private localSyncPromise: Promise<void> | null = null;

  constructor() {
    this.catalog = {
      diagnoses: this.loadDiagnoses(),
      tcmDiagnoses: this.loadTCMDiagnoses(),
      tcmSyndromes: this.loadTCMSyndromes(),
      tcmTreatments: this.loadTCMTreatments(),
      medicines: this.loadMedicines(),
      items: this.loadItems()
    };
  }

  private loadDiagnoses(): DiagnosisItem[] {
    const records = this.parseCSV(diagnosesRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadTCMDiagnoses(): TCMDiagnosisItem[] {
    const records = this.parseCSV(tcmDiagnosesRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadTCMSyndromes(): TCMSyndromeItem[] {
    const records = this.parseCSV(tcmSyndromesRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadTCMTreatments(): TCMTreatmentItem[] {
    const records = this.parseCSV(tcmTreatmentsRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private loadMedicines(): MedicineItem[] {
    const records = this.parseCSV(medicinesRaw);
    return records.map(r => ({
      id: r.id,
      name: r.name,
      spec: r.spec
    }));
  }

  private loadItems(): MedicalItem[] {
    const records = this.parseCSV(itemsRaw);
    return records.map(r => ({
      id: r.id,
      code: r.code || r.id || r.name,
      name: r.name,
      category: r.category,
      keywords: this.parseKeywords(r.keywords)
    }));
  }

  private parseKeywords(str?: string): string[] | undefined {
    if (!str) return undefined;
    return str.split('|').map(s => s.trim()).filter(Boolean);
  }

  private parseCSV(content: string): Record<string, string>[] {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = this.parseCSVLine(line);
      // Allow for some leniency in trailing commas or missing fields
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      result.push(obj);
    }
    return result;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (inQuote) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            // Escaped quote
            current += '"';
            i++;
          } else {
            inQuote = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuote = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  private normalizeOrgCode(orgCode?: string | null): string | null {
    const normalized = orgCode?.trim();
    return normalized ? normalized : null;
  }

  private getTodayTag(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private resetOrgScopedCatalogs(): void {
    this.catalog.items = this.loadItems();
    this.catalog.medicines = this.loadMedicines();
  }

  private async loadPersistedCatalogSnapshot(): Promise<MedicalCatalogSnapshot | null> {
    try {
      return await invoke<MedicalCatalogSnapshot>('load_medical_catalog_snapshot', {
        orgCode: this.currentOrgCode,
      });
    } catch (error) {
      console.warn('[MedicalData] Failed to load SQLite catalog snapshot:', error);
      return null;
    }
  }

  private applyPersistedCatalogSnapshot(snapshot: MedicalCatalogSnapshot | null): void {
    if (!snapshot) {
      return;
    }

    if (snapshot.diagnoses.length > 0) {
      this.catalog.diagnoses = this.normalizeDiagnosisItems(snapshot.diagnoses);
      console.log('[MedicalData] Diagnosis cache restored from SQLite', {
        itemCount: snapshot.diagnoses.length,
      });
    }

    this.resetOrgScopedCatalogs();

    if (!this.currentOrgCode) {
      return;
    }

    if (snapshot.items.length > 0) {
      this.catalog.items = this.normalizeMedicalItems(snapshot.items);
      console.log('[MedicalData] Item cache restored from SQLite', {
        orgCode: this.currentOrgCode,
        itemCount: snapshot.items.length,
        syncDate: snapshot.itemSyncDate,
      });
    }

    if (snapshot.medicines.length > 0) {
      this.catalog.medicines = this.normalizeMedicineItems(snapshot.medicines);
      console.log('[MedicalData] Medicine cache restored from SQLite', {
        orgCode: this.currentOrgCode,
        itemCount: snapshot.medicines.length,
        syncDate: snapshot.medicineSyncDate,
      });
    }
  }

  private async persistDiagnosisCatalog(items: DiagnosisItem[]): Promise<void> {
    await invoke('replace_diagnosis_catalog', { items });
    console.log('[MedicalData] Diagnosis catalog persisted to SQLite', {
      itemCount: items.length,
    });
  }

  private async persistMedicalItemCatalog(orgCode: string, items: MedicalItem[], syncDate: string): Promise<void> {
    await invoke('replace_org_medical_item_catalog', {
      orgCode,
      items,
      syncDate,
    });
    console.log('[MedicalData] Medical items catalog persisted to SQLite', {
      orgCode,
      itemCount: items.length,
      syncDate,
    });
  }

  private async persistMedicineCatalog(orgCode: string, items: MedicineItem[], syncDate: string): Promise<void> {
    await invoke('replace_org_medicine_catalog', {
      orgCode,
      items,
      syncDate,
    });
    console.log('[MedicalData] Medicine catalog persisted to SQLite', {
      orgCode,
      itemCount: items.length,
      syncDate,
    });
  }

  public getAllDiagnoses(): DiagnosisItem[] {
    return this.catalog.diagnoses;
  }

  public getAllTCMDiagnoses(): TCMDiagnosisItem[] {
    return this.catalog.tcmDiagnoses;
  }

  public getAllTCMSyndromes(): TCMSyndromeItem[] {
    return this.catalog.tcmSyndromes;
  }

  public getAllTCMTreatments(): TCMTreatmentItem[] {
    return this.catalog.tcmTreatments;
  }

  public getAllMedicines(): MedicineItem[] {
    return this.catalog.medicines;
  }

  public getAllItems(): MedicalItem[] {
    return this.catalog.items;
  }

  public getAllIcd10CategoryGroups(): Icd10CategoryInfo[] {
    return [...ICD10_CATEGORY_GROUPS];
  }

  public async setCatalogContext(context: MedicalCatalogContext): Promise<void> {
    const nextOrgCode = this.normalizeOrgCode(context.orgCode);
    const orgChanged = nextOrgCode !== this.currentOrgCode;
    console.log('[MedicalData] setCatalogContext', {
      currentOrgCode: this.currentOrgCode,
      nextOrgCode,
      orgChanged,
    });

    this.currentOrgCode = nextOrgCode;

    if (orgChanged) {
      this.resetOrgScopedCatalogs();
    }

    await this.ensureLocalCatalogsSynced();
  }

  public async ensureLocalCatalogsSynced(): Promise<void> {
    if (isRegionalMode()) {
      console.log('[MedicalData] Local HIS catalog sync skipped in regional mode');
      return;
    }

    const snapshot = await this.loadPersistedCatalogSnapshot();
    this.applyPersistedCatalogSnapshot(snapshot);

    const hisService = getHisService();
    if (!hisService) {
      console.warn('[MedicalData] HisService not ready, skip local catalog sync');
      return;
    }

    if (!this.localSyncPromise) {
      console.log('[MedicalData] Start local catalog sync', {
        orgCode: this.currentOrgCode,
      });
      this.localSyncPromise = this.syncLocalCatalogs(hisService, snapshot).finally(() => {
        console.log('[MedicalData] Local catalog sync finished', {
          orgCode: this.currentOrgCode,
        });
        this.localSyncPromise = null;
      });
    } else {
      console.log('[MedicalData] Reuse in-flight local catalog sync', {
        orgCode: this.currentOrgCode,
      });
    }

    await this.localSyncPromise;
  }

  public async getDebugState(): Promise<MedicalCatalogDebugState> {
    return invoke<MedicalCatalogDebugState>('get_medical_catalog_debug_state');
  }

  public async clearDebugCache(options: MedicalCatalogClearOptions = {}): Promise<MedicalCatalogClearResult> {
    const result = await invoke<MedicalCatalogClearResult>('clear_medical_catalog_cache', {
      catalogType: options.catalogType ?? 'all',
      orgCode: options.orgCode ?? this.currentOrgCode ?? '',
    });

    if (!options.catalogType || options.catalogType === 'all' || options.catalogType === 'diagnoses') {
      this.catalog.diagnoses = this.loadDiagnoses();
    }
    if (!options.catalogType || options.catalogType === 'all' || options.catalogType === 'items') {
      this.catalog.items = this.loadItems();
    }
    if (!options.catalogType || options.catalogType === 'all' || options.catalogType === 'medicines') {
      this.catalog.medicines = this.loadMedicines();
    }

    return result;
  }

  /**
   * Find best matching diagnosis
   * @param query AI output string
   */
  public matchDiagnosis(query: string): DiagnosisItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();
    
    // 1. Exact match (name or code)
    const exact = this.catalog.diagnoses.find(d => 
      d.name.toLowerCase() === normalizedQuery || d.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match (New)
    // If the query looks like a code (alphanumeric, maybe dot), try to find best code match
    // E.g. query "R50.9" matches "R50.900"
    // We want the shortest matching code that starts with query
    const codeMatches = this.catalog.diagnoses.filter(d => 
      d.code.toLowerCase().startsWith(normalizedQuery)
    );
    
    if (codeMatches.length > 0) {
      // Sort by code length (ascending) to get "R50.900" before "R50.900x001" if such hierarchy exists
      // Or just return the first one if length is same.
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: DiagnosisItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.diagnoses) {
      const score = this.calculateScore(normalizedQuery, item.name, item.keywords);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Get related diagnoses by ICD10 code prefix
   * @param code ICD10 code
   */
  public getRelatedDiagnoses(code: string): DiagnosisItem[] {
    if (!code) return [];
    // Use the first 3 characters as the prefix (e.g. "J06" from "J06.9")
    // If the code is shorter than 3 chars, use it as is.
    const prefix = code.split('.')[0];
    if (!prefix) return [];

    return this.catalog.diagnoses.filter(d => d.code.startsWith(prefix));
  }

  public extractIcd10CategoryCode(code: string): string | null {
    if (!code) return null;
    const normalized = code.trim().toUpperCase();
    const match = normalized.match(/[A-Z][0-9]{2}/);
    return match ? match[0] : null;
  }

  public getIcd10CategoryInfo(code: string): Icd10CategoryInfo | null {
    const categoryCode = this.extractIcd10CategoryCode(code);
    if (!categoryCode) return null;

    return ICD10_CATEGORY_GROUPS.find(group => {
      const [start, end] = group.range.split('-');
      return this.isIcd10CategoryInRange(categoryCode, start, end);
    }) || null;
  }

  /**
   * Find best matching TCM diagnosis
   * @param query AI output string (e.g., "感冒 - 风寒束表证" or "感冒")
   */
  public matchTCMDiagnosis(query: string): TCMDiagnosisItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // Extract disease name from "disease - syndrome" format
    // e.g., "感冒 - 风寒束表证" -> "感冒"
    const diseaseName = normalizedQuery.split('-')[0].trim();

    // 1. Exact match (name or code)
    const exact = this.catalog.tcmDiagnoses.find(d =>
      d.name.toLowerCase() === normalizedQuery ||
      d.name.toLowerCase() === diseaseName ||
      d.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match
    const codeMatches = this.catalog.tcmDiagnoses.filter(d =>
      d.code.toLowerCase().startsWith(normalizedQuery)
    );

    if (codeMatches.length > 0) {
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: TCMDiagnosisItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.tcmDiagnoses) {
      // Try matching both full query and disease name
      const fullScore = this.calculateScore(normalizedQuery, item.name, item.keywords);
      const diseaseScore = this.calculateScore(diseaseName, item.name, item.keywords);
      const score = Math.max(fullScore, diseaseScore);

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Get related TCM diagnoses by code prefix
   * @param code TCM diagnosis code (e.g., "A01.01.01")
   */
  public getRelatedTCMDiagnoses(code: string): TCMDiagnosisItem[] {
    if (!code) return [];
    // Use the first two segments as prefix (e.g., "A01.01" from "A01.01.01")
    const parts = code.split('.');
    const prefix = parts.slice(0, Math.max(2, parts.length - 1)).join('.');
    if (!prefix) return [];

    return this.catalog.tcmDiagnoses.filter(d => d.code.startsWith(prefix));
  }

  /**
   * Find best matching medicine
   * @param query AI output string
   */
  public matchMedicine(query: string, aliases?: string[]): MedicineItem | null {
    return this.matchMedicineByVariants(query, aliases);
  }

  public searchMedicines(query: string, aliases?: string[], limit = 8): MedicineItem[] {
    return this.searchMedicinesByVariants(query, aliases, limit);
  }

  public assessMedicineMatch(query: string, aliases?: string[]): CatalogMatchAssessment<MedicineItem> {
    return this.assessMedicineByVariants(query, aliases);
  }

  /**
   * Find best matching examination/lab item
   * @param query AI output string
   */
  public matchItem(query: string): MedicalItem | null {
    return this.matchMedicalItemByVariants(this.catalog.items, query);
  }

  /**
   * Find best matching examination item (imaging/device: X-ray, CT, B-ultrasound, ECG, etc.)
   * Only matches items with category === '检查'
   */
  public matchExamItem(query: string, aliases?: string[]): MedicalItem | null {
    return this.matchItemByCategory(query, '检查', aliases);
  }

  public searchExamItems(query: string, aliases?: string[], limit = 8): MedicalItem[] {
    return this.searchItemsByCategory(query, '检查', aliases, limit);
  }

  public assessExamItemMatch(query: string, aliases?: string[]): CatalogMatchAssessment<MedicalItem> {
    return this.assessItemByCategory(query, '检查', aliases);
  }

  /**
   * Find best matching lab test item (blood test, urine test, biochemistry, etc.)
   * Only matches items with category === '检验'
   */
  public matchLabTestItem(query: string, aliases?: string[]): MedicalItem | null {
    return this.matchItemByCategory(query, '检验', aliases);
  }

  public searchLabTestItems(query: string, aliases?: string[], limit = 8): MedicalItem[] {
    return this.searchItemsByCategory(query, '检验', aliases, limit);
  }

  public assessLabTestItemMatch(query: string, aliases?: string[]): CatalogMatchAssessment<MedicalItem> {
    return this.assessItemByCategory(query, '检验', aliases);
  }

  /**
   * Find best matching procedure item (dressing change, suture removal, nebulization, etc.)
   * Only matches items with category === '治疗'
   */
  public matchProcedureItem(query: string, aliases?: string[]): MedicalItem | null {
    return this.matchItemByCategory(query, '治疗', aliases);
  }

  public searchProcedureItems(query: string, aliases?: string[], limit = 8): MedicalItem[] {
    return this.searchItemsByCategory(query, '治疗', aliases, limit);
  }

  public assessProcedureItemMatch(query: string, aliases?: string[]): CatalogMatchAssessment<MedicalItem> {
    return this.assessItemByCategory(query, '治疗', aliases);
  }

  private matchItemByCategory(query: string, category: string, aliases?: string[]): MedicalItem | null {
    if (!query) return null;
    const filtered = this.catalog.items.filter(i => i.category === category);
    return this.matchMedicalItemByVariants(filtered, query, aliases);
  }

  private searchItemsByCategory(query: string, category: string, aliases?: string[], limit = 8): MedicalItem[] {
    if (!query) return [];
    const filtered = this.catalog.items.filter(i => i.category === category);
    return this.searchMedicalItemsByVariants(filtered, query, aliases, limit);
  }

  private assessItemByCategory(query: string, category: string, aliases?: string[]): CatalogMatchAssessment<MedicalItem> {
    if (!query) {
      return { status: 'unmatched', candidate: null, confidence: 0 };
    }

    const filtered = this.catalog.items.filter(i => i.category === category);
    return this.assessMedicalItemByVariants(filtered, query, aliases);
  }

  private matchMedicineByVariants(query: string, aliases?: string[]): MedicineItem | null {
    const top = this.collectScoredMedicineCandidates(query, aliases, 1)[0];
    return top && top.score > 0.3 ? top.item : null;
  }

  private searchMedicinesByVariants(query: string, aliases?: string[], limit = 8): MedicineItem[] {
    return this.collectScoredMedicineCandidates(query, aliases, limit)
      .slice(0, limit)
      .map((candidate) => candidate.item);
  }

  private assessMedicineByVariants(query: string, aliases?: string[]): CatalogMatchAssessment<MedicineItem> {
    const exact = this.findExactMedicineMatch(query);
    if (exact) {
      return { status: 'exact', candidate: exact, confidence: 1 };
    }

    const ranked = this.collectScoredMedicineCandidates(query, aliases, 2);
    const top = ranked[0];
    const second = ranked[1];

    if (top && top.score >= MedicalDataService.PROBABLE_MATCH_THRESHOLD) {
      const margin = second ? top.score - second.score : 1;
      if (margin >= MedicalDataService.PROBABLE_MATCH_MARGIN) {
        return {
          status: 'probable',
          candidate: top.item,
          confidence: Number(top.score.toFixed(3)),
        };
      }
    }

    return { status: 'unmatched', candidate: null, confidence: 0 };
  }

  private matchMedicalItemByVariants(items: MedicalItem[], query: string, aliases?: string[]): MedicalItem | null {
    const top = this.collectScoredMedicalItemCandidates(items, query, aliases, 1)[0];
    return top && top.score > 0.3 ? top.item : null;
  }

  private searchMedicalItemsByVariants(items: MedicalItem[], query: string, aliases?: string[], limit = 8): MedicalItem[] {
    return this.collectScoredMedicalItemCandidates(items, query, aliases, limit)
      .slice(0, limit)
      .map((candidate) => candidate.item);
  }

  private assessMedicalItemByVariants(items: MedicalItem[], query: string, aliases?: string[]): CatalogMatchAssessment<MedicalItem> {
    const exact = this.findExactMedicalItemMatch(items, query);
    if (exact) {
      return { status: 'exact', candidate: exact, confidence: 1 };
    }

    const ranked = this.collectScoredMedicalItemCandidates(items, query, aliases, 2);
    const top = ranked[0];
    const second = ranked[1];

    if (top && top.score >= MedicalDataService.PROBABLE_MATCH_THRESHOLD) {
      const margin = second ? top.score - second.score : 1;
      if (margin >= MedicalDataService.PROBABLE_MATCH_MARGIN) {
        return {
          status: 'probable',
          candidate: top.item,
          confidence: Number(top.score.toFixed(3)),
        };
      }
    }

    return { status: 'unmatched', candidate: null, confidence: 0 };
  }

  private collectScoredMedicineCandidates(query: string, aliases?: string[], limit = Number.POSITIVE_INFINITY): Array<ScoredCandidate<MedicineItem>> {
    const variants = this.buildMatchVariants(query, aliases);
    if (variants.length === 0) {
      return [];
    }

    const primaryVariant = variants[0];
    const medicineCandidates: Array<ScoredCandidate<MedicineItem>> = [];

    for (const item of this.catalog.medicines) {
      const primaryNameScore = this.calculateScore(primaryVariant.normalized, item.name);
      const primaryFullNameScore = this.calculateScore(primaryVariant.normalized, `${item.name} ${item.spec}`);
      const primaryScore = Math.max(primaryNameScore, primaryFullNameScore);

      if (primaryScore < 0.2) {
        continue;
      }

      let score = primaryScore;

      for (const variant of variants.slice(1)) {
        const nameScore = this.calculateScore(variant.normalized, item.name) * variant.weight;
        const fullNameScore = this.calculateScore(variant.normalized, `${item.name} ${item.spec}`) * variant.weight;
        score = Math.max(score, nameScore, fullNameScore);
      }

      medicineCandidates.push({ item, score, primaryScore });
    }

    return medicineCandidates
      .sort((left, right) => right.score - left.score || right.primaryScore - left.primaryScore || left.item.name.localeCompare(right.item.name))
      .slice(0, limit);
  }

  private collectScoredMedicalItemCandidates(items: MedicalItem[], query: string, aliases?: string[], limit = Number.POSITIVE_INFINITY): Array<ScoredCandidate<MedicalItem>> {
    const variants = this.buildMatchVariants(query, aliases);
    if (variants.length === 0) {
      return [];
    }

    const primaryVariant = variants[0];
    const candidates: Array<ScoredCandidate<MedicalItem>> = [];

    for (const item of items) {
      const primaryScore = Math.max(
        this.calculateScore(primaryVariant.normalized, item.name, item.keywords),
        this.normalizeRoutineItemAlias(item.name) === primaryVariant.normalizedRoutineAlias ? 0.96 : 0,
      );

      if (primaryScore < 0.2) {
        continue;
      }

      let score = primaryScore;

      for (const variant of variants.slice(1)) {
        const baseScore = this.calculateScore(variant.normalized, item.name, item.keywords) * variant.weight;
        const routineAliasScore = this.normalizeRoutineItemAlias(item.name) === variant.normalizedRoutineAlias
          ? Math.min(0.94, primaryScore + 0.08) * variant.weight
          : 0;
        score = Math.max(score, baseScore, routineAliasScore);
      }

      candidates.push({ item, score, primaryScore });
    }

    return candidates
      .sort((left, right) => right.score - left.score || right.primaryScore - left.primaryScore || left.item.name.localeCompare(right.item.name))
      .slice(0, limit);
  }

  private buildMatchVariants(query: string, aliases?: string[]): MatchVariant[] {
    const rawValues = [query, ...(aliases || [])]
      .map((item) => item?.trim())
      .filter(Boolean) as string[];

    const seen = new Set<string>();
    const variants: MatchVariant[] = [];

    rawValues.forEach((value, index) => {
      const normalized = value.toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);

      variants.push({
        normalized,
        weight: index === 0 ? 1 : Math.max(0.72, 0.92 - ((index - 1) * 0.08)),
        normalizedRoutineAlias: this.normalizeRoutineItemAlias(value),
      });
    });

    return variants;
  }

  private normalizeRoutineItemAlias(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/gu, '')
      .replace(/^常规/u, '')
      .replace(/(检查|检验|检测|测定|项目)$/u, '');
  }

  private normalizeExactMatchText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s\-_()（）[\]【】,，.。/\\]/gu, '');
  }

  private findExactMedicineMatch(query: string): MedicineItem | null {
    const normalizedQuery = this.normalizeExactMatchText(query);
    if (!normalizedQuery) {
      return null;
    }

    return this.catalog.medicines.find((item) => this.normalizeExactMatchText(item.name) === normalizedQuery) || null;
  }

  private findExactMedicalItemMatch(items: MedicalItem[], query: string): MedicalItem | null {
    const normalizedQuery = this.normalizeExactMatchText(query);
    if (!normalizedQuery) {
      return null;
    }

    return items.find((item) => this.normalizeExactMatchText(item.name) === normalizedQuery || item.code.trim().toLowerCase() === query.trim().toLowerCase()) || null;
  }

  /**
   * Find best matching TCM syndrome
   * @param query AI output string (e.g., "风寒束表证" or "表虚证")
   */
  public matchTCMSyndrome(query: string): TCMSyndromeItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Exact match (name or code)
    const exact = this.catalog.tcmSyndromes.find(s =>
      s.name.toLowerCase() === normalizedQuery ||
      s.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match
    const codeMatches = this.catalog.tcmSyndromes.filter(s =>
      s.code.toLowerCase().startsWith(normalizedQuery)
    );

    if (codeMatches.length > 0) {
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: TCMSyndromeItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.tcmSyndromes) {
      const score = this.calculateScore(normalizedQuery, item.name, item.keywords);

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Find best matching TCM treatment
   * @param query AI output string (e.g., "疏风解表" or "辛温解表法")
   */
  public matchTCMTreatment(query: string): TCMTreatmentItem | null {
    if (!query) return null;
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Exact match (name or code)
    const exact = this.catalog.tcmTreatments.find(t =>
      t.name.toLowerCase() === normalizedQuery ||
      t.code.toLowerCase() === normalizedQuery
    );
    if (exact) return exact;

    // 2. Code prefix match
    const codeMatches = this.catalog.tcmTreatments.filter(t =>
      t.code.toLowerCase().startsWith(normalizedQuery)
    );

    if (codeMatches.length > 0) {
      codeMatches.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      return codeMatches[0];
    }

    // 3. Best fuzzy match
    let bestMatch: TCMTreatmentItem | null = null;
    let maxScore = 0;

    for (const item of this.catalog.tcmTreatments) {
      const score = this.calculateScore(normalizedQuery, item.name, item.keywords);

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Threshold for acceptance
    return maxScore > 0.3 ? bestMatch : null;
  }

  /**
   * Calculate similarity score (0-1)
   * Uses simple character overlap / Jaccard-like approach
   */
  private calculateScore(query: string, target: string, keywords?: string[]): number {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    
    // Direct inclusion
    if (t.includes(q)) return 0.9; // Target contains query (e.g. "Amoxicillin Capsules" contains "Amoxicillin")
    if (q.includes(t)) return 0.8; // Query contains target

    // Keyword match
    if (keywords) {
      for (const k of keywords) {
        if (q.includes(k.toLowerCase())) return 0.85;
      }
    }

    // Character overlap (Jaccard Index)
    const qSet = new Set(q.split(''));
    const tSet = new Set(t.split(''));
    let intersection = 0;
    for (const char of qSet) {
      if (tSet.has(char)) intersection++;
    }
    
    const union = qSet.size + tSet.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private isIcd10CategoryInRange(categoryCode: string, start: string, end: string): boolean {
    const currentValue = this.toIcd10Ordinal(categoryCode);
    const startValue = this.toIcd10Ordinal(start);
    const endValue = this.toIcd10Ordinal(end);

    if (currentValue == null || startValue == null || endValue == null) {
      return false;
    }

    return currentValue >= startValue && currentValue <= endValue;
  }

  private toIcd10Ordinal(categoryCode: string): number | null {
    const match = categoryCode.toUpperCase().match(/^([A-Z])([0-9]{2})$/);
    if (!match) return null;

    const letterValue = match[1].charCodeAt(0) - 65;
    const numberValue = Number.parseInt(match[2], 10);
    return (letterValue * 100) + numberValue;
  }

  private normalizeKeywords(keywords?: string[] | string): string[] | undefined {
    if (Array.isArray(keywords)) {
      return keywords.map(item => item.trim()).filter(Boolean);
    }
    return this.parseKeywords(keywords);
  }

  private normalizeDiagnosisItems(items: Array<Partial<DiagnosisItem> | HisDiagnosisCatalogItem>): DiagnosisItem[] {
    const normalized: DiagnosisItem[] = [];

    items.forEach((item, index) => {
      const name = item.name?.trim();
      const code = item.code?.trim() || '';
      if (!name) {
        return;
      }

      normalized.push({
        id: item.id?.toString().trim() || code || `${index + 1}`,
        code,
        name,
        keywords: this.normalizeKeywords(item.keywords)
      });
    });

    return normalized;
  }

  private normalizeMedicineItems(items: Array<Partial<MedicineItem> | HisMedicineCatalogItem>): MedicineItem[] {
    const normalized: MedicineItem[] = [];

    items.forEach((item, index) => {
      const name = item.name?.trim();
      if (!name) {
        return;
      }

      normalized.push({
        id: item.id?.toString().trim() || `${index + 1}`,
        name,
        spec: item.spec?.trim() || '',
        idSrv: item.idSrv?.toString().trim() || item.id?.toString().trim() || `${index + 1}`,
        naSrv: item.naSrv?.toString().trim() || name,
        sdSrv: item.sdSrv?.toString().trim() || '11',
        idDeptExec: item.idDeptExec?.toString().trim() || '',
        fgCheckOrd: item.fgCheckOrd?.toString().trim() || '1',
        fgSkintest: item.fgSkintest?.toString().trim() || '0',
        raw: item.raw && typeof item.raw === 'object' ? item.raw : undefined,
      });
    });

    return normalized;
  }

  private normalizeMedicalItems(items: Array<Partial<MedicalItem> | HisMedicalItemCatalogItem>): MedicalItem[] {
    const normalized: MedicalItem[] = [];

    items.forEach((item, index) => {
      const name = item.name?.trim();
      if (!name) {
        return;
      }

      normalized.push({
        id: item.id?.toString().trim() || `${index + 1}`,
        code: item.code?.toString().trim() || item.id?.toString().trim() || name,
        name,
        category: item.category?.trim() || '其他',
        keywords: this.normalizeKeywords(item.keywords),
        idSrv: item.idSrv?.toString().trim() || item.id?.toString().trim() || `${index + 1}`,
        naSrv: item.naSrv?.toString().trim() || name,
        sdSrv: item.sdSrv?.toString().trim() || '',
        idDeptExec: item.idDeptExec?.toString().trim() || '',
        idPart: item.idPart?.toString().trim() || '',
        jsonField: item.jsonField?.toString().trim() || '',
        fgCheckOrd: item.fgCheckOrd?.toString().trim() || '1',
        raw: item.raw && typeof item.raw === 'object' ? item.raw : undefined,
      });
    });

    return normalized;
  }

  private async syncLocalCatalogs(
    hisService: HisService,
    snapshot: MedicalCatalogSnapshot | null
  ): Promise<void> {
    await this.syncGlobalDiagnosesIfNeeded(hisService, snapshot);

    if (!this.currentOrgCode) {
      console.warn('[MedicalData] Skip org-scoped catalog sync because orgCode is missing');
      return;
    }

    const orgCode = this.currentOrgCode;
    await Promise.allSettled([
      this.syncInstitutionItemsIfNeeded(hisService, orgCode, snapshot),
      this.syncInstitutionMedicinesIfNeeded(hisService, orgCode, snapshot)
    ]);
  }

  private async syncGlobalDiagnosesIfNeeded(
    hisService: HisService,
    snapshot: MedicalCatalogSnapshot | null
  ): Promise<void> {
    if (snapshot?.diagnoses.length) {
      console.log('[MedicalData] Skip diagnosis sync, cache hit', {
        itemCount: snapshot.diagnoses.length,
        syncedAt: snapshot.diagnosisSyncedAt,
      });
      return;
    }

    try {
      console.log('[MedicalData] Fetch diagnosis catalog from HIS');
      const diagnoses = this.normalizeDiagnosisItems(await hisService.fetchDiagnosisCatalog());
      if (!diagnoses.length) {
        console.warn('[MedicalData] Diagnosis catalog returned empty result');
        return;
      }

      this.catalog.diagnoses = diagnoses;
      await this.persistDiagnosisCatalog(diagnoses);
      console.log('[MedicalData] Diagnosis catalog synced', {
        itemCount: diagnoses.length,
      });
    } catch (error) {
      console.warn('[MedicalData] Failed to sync diagnosis catalog from HIS, fallback to CSV:', error);
    }
  }

  private async syncInstitutionItemsIfNeeded(
    hisService: HisService,
    orgCode: string,
    snapshot: MedicalCatalogSnapshot | null
  ): Promise<void> {
    const today = this.getTodayTag();
    if (snapshot?.items.length && snapshot.itemSyncDate === today) {
      console.log('[MedicalData] Skip medical items sync, same-day SQLite cache hit', {
        orgCode,
        itemCount: snapshot.items.length,
        syncDate: snapshot.itemSyncDate,
      });
      return;
    }

    try {
      console.log('[MedicalData] Fetch medical items catalog from HIS', {
        orgCode,
        hasCache: Boolean(snapshot?.items.length),
        cacheDate: snapshot?.itemSyncDate,
        today,
      });
      const items = this.normalizeMedicalItems(await hisService.fetchInstitutionMedicalItemsCatalog(orgCode));
      if (!items.length) {
        console.warn('[MedicalData] Medical items catalog returned empty result', {
          orgCode,
        });
        return;
      }

      this.catalog.items = items;
      await this.persistMedicalItemCatalog(orgCode, items, today);
      console.log('[MedicalData] Medical items catalog synced', {
        orgCode,
        itemCount: items.length,
      });
    } catch (error) {
      console.warn(`[MedicalData] Failed to sync medical items for org ${orgCode}, fallback to CSV:`, error);
    }
  }

  private async syncInstitutionMedicinesIfNeeded(
    hisService: HisService,
    orgCode: string,
    snapshot: MedicalCatalogSnapshot | null
  ): Promise<void> {
    const today = this.getTodayTag();

    // 获取当前机构的西药房 storeId 列表，以此作为缓存键（按药房缓存）
    let storeIds: string[];
    try {
      storeIds = await hisService.fetchMedicineStoreIds(orgCode);
    } catch (error) {
      console.warn('[MedicalData] Failed to fetch medicine store IDs, fallback to org-scoped cache', { orgCode, error });
      storeIds = [];
    }

    const cacheKey = storeIds.length > 0 ? storeIds.slice().sort().join(',') : orgCode;

    // 用药房维度的 cacheKey 加载 SQLite 快照（与 items 使用的 orgCode 快照分开）
    let pharmacySnapshot: MedicalCatalogSnapshot | null = null;
    if (cacheKey !== orgCode) {
      try {
        pharmacySnapshot = await invoke<MedicalCatalogSnapshot>('load_medical_catalog_snapshot', { orgCode: cacheKey });
      } catch {
        pharmacySnapshot = null;
      }
    } else {
      pharmacySnapshot = snapshot;
    }

    // 先将已缓存的药品目录加载到内存（网络请求完成前先提供可用数据）
    if (pharmacySnapshot?.medicines.length) {
      this.catalog.medicines = this.normalizeMedicineItems(pharmacySnapshot.medicines);
    }

    if (pharmacySnapshot?.medicines.length && pharmacySnapshot.medicineSyncDate === today) {
      console.log('[MedicalData] Skip medicine sync, same-day pharmacy-scoped SQLite cache hit', {
        cacheKey,
        itemCount: pharmacySnapshot.medicines.length,
        syncDate: pharmacySnapshot.medicineSyncDate,
      });
      return;
    }

    try {
      console.log('[MedicalData] Fetch medicine catalog from HIS', {
        orgCode,
        cacheKey,
        hasCache: Boolean(pharmacySnapshot?.medicines.length),
        cacheDate: pharmacySnapshot?.medicineSyncDate,
        today,
      });
      const medicines = this.normalizeMedicineItems(await hisService.fetchInstitutionMedicineCatalog(orgCode));
      if (!medicines.length) {
        console.warn('[MedicalData] Medicine catalog returned empty result', { orgCode, cacheKey });
        return;
      }

      this.catalog.medicines = medicines;
      await this.persistMedicineCatalog(cacheKey, medicines, today);
      console.log('[MedicalData] Medicine catalog synced', {
        orgCode,
        cacheKey,
        itemCount: medicines.length,
      });
    } catch (error) {
      console.warn(`[MedicalData] Failed to sync medicines for org ${orgCode}, fallback to cached/CSV data:`, error);
    }
  }

  // ─── 区域化远程数据同步 ────────────────────────────────────────────────

  /**
   * 从 core-service 增量同步医学数据包
   * 服务端按机构管理数据，返回 CSV 格式数据
   */
  async syncRemoteData(): Promise<void> {
    if (!isRegionalMode()) return;

    try {
      const currentVersion = localStorage.getItem(MedicalDataService.DATA_VERSION_KEY) || '0';
      const resp = await regionalGet<{
        version: string;
        diagnoses?: string;
        medicines?: string;
        items?: string;
        tcmDiagnoses?: string;
        tcmSyndromes?: string;
        tcmTreatments?: string;
      }>(`/v1/client/mappings/delta?version=${encodeURIComponent(currentVersion)}`);

      let updated = false;

      if (resp.diagnoses) {
        this.catalog.diagnoses = this.loadDiagnosesFromRaw(resp.diagnoses);
        updated = true;
      }
      if (resp.medicines) {
        this.catalog.medicines = this.loadMedicinesFromRaw(resp.medicines);
        updated = true;
      }
      if (resp.items) {
        this.catalog.items = this.loadItemsFromRaw(resp.items);
        updated = true;
      }
      if (resp.tcmDiagnoses) {
        this.catalog.tcmDiagnoses = this.loadTCMItemsFromRaw(resp.tcmDiagnoses);
        updated = true;
      }
      if (resp.tcmSyndromes) {
        this.catalog.tcmSyndromes = this.loadTCMItemsFromRaw(resp.tcmSyndromes);
        updated = true;
      }
      if (resp.tcmTreatments) {
        this.catalog.tcmTreatments = this.loadTCMItemsFromRaw(resp.tcmTreatments);
        updated = true;
      }

      if (updated) {
        // 缓存到 localStorage（用于离线场景）
        localStorage.setItem(MedicalDataService.DATA_CACHE_KEY, JSON.stringify(this.catalog));
        localStorage.setItem(MedicalDataService.DATA_VERSION_KEY, resp.version);
        console.log(`[MedicalData] Synced data, version=${resp.version}`);
      }
    } catch (err) {
      console.warn('[MedicalData] Remote sync failed, using local data:', err);
      // 尝试从 localStorage 恢复缓存
      this.restoreFromCache();
    }
  }

  private restoreFromCache(): void {
    try {
      const cached = localStorage.getItem(MedicalDataService.DATA_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as MedicalCatalog;
        if (data.diagnoses?.length > 0) this.catalog = data;
        console.log('[MedicalData] Restored from cache');
      }
    } catch { /* ignore */ }
  }

  private loadDiagnosesFromRaw(raw: string): DiagnosisItem[] {
    return this.normalizeDiagnosisItems(this.parseCSV(raw));
  }

  private loadMedicinesFromRaw(raw: string): MedicineItem[] {
    return this.normalizeMedicineItems(this.parseCSV(raw));
  }

  private loadItemsFromRaw(raw: string): MedicalItem[] {
    return this.normalizeMedicalItems(this.parseCSV(raw));
  }

  private loadTCMItemsFromRaw(raw: string): TCMDiagnosisItem[] {
    const records = this.parseCSV(raw);
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      keywords: this.parseKeywords(r.keywords)
    }));
  }
}

export const medicalDataService = new MedicalDataService();
