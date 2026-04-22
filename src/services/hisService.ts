import { fetch } from '@tauri-apps/plugin-http';

/**
 * HIS 服务响应基础结构
 */
export interface HisResponse<T = unknown> {
  success?: boolean;
  message?: string;
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
}

export interface HisMedicalItemCatalogItem {
  id?: string;
  code?: string;
  name?: string;
  category?: string;
  keywords?: string[] | string;
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

interface HiBdDieListBody {
  start?: number;
  limit?: number;
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

interface HiBdCliOrgListBody {
  start?: number;
  limit?: number;
  items?: Array<{
    idCli?: string;
    naCli?: string;
    unit?: string;
    sdCli?: string;
    sdCliText?: string;
    py?: string;
    fgActive?: string;
    naCstmg?: string;
  }>;
}

interface DispensingStoreItem {
  idOrg?: string;
  idSto?: string;
  naSto?: string;
  fgActive?: string;
  sdSto?: string;
  sdsStoPro?: string;
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
}

const HIS_CATALOG_ENDPOINTS = {
  diagnoses: 'api/base.hiBdDieService/queryList',
  medicalItems: 'api/phis.hiBdCliOrgService/queryHiBdCliOrgList',
  medicineStores: 'api/phis.medicineDispensingService/queryDispensingSto',
  medicines: 'api/phis.orgMedicineConfig/queryList',
} as const;

/**
 * HIS 接口调用工具类
 * 用于在小球端（Tauri）通过 HTTP 请求调用 HIS 服务的接口
 */
export class HisService {
  private baseUrl: string;
  private token: string;

  /**
   * @param baseUrl HIS 服务的基地址 (例如: http://192.168.1.100:8080/his/)
   * @param token 握手时由网页端自动获取并传给小球的 emrAccessToken
   */
  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.token = token;
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

    const fullUrl = this.baseUrl + url;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cookie': `tk=${this.token}`,
      'Authorization': `Bearer ${this.token}`,
      'X-Access-Token': this.token,
    };
    console.log('[HisService] POST', {
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
        throw new Error(`HIS HTTP Error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[HisService] RESPONSE', {
        url: fullUrl,
        code: (result as HisResponse<T>).code,
        summary: this.summarizePayload((result as HisResponse<T>).body ?? (result as HisResponse<T>).data),
      });
      return result as HisResponse<T>;
    } catch (error) {
      console.error(`[HisService] Request failed: ${fullUrl}`, error);
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

    const fullUrl = this.buildUrlWithQuery(this.baseUrl + url, query);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Cookie': `tk=${this.token}`,
      'Authorization': `Bearer ${this.token}`,
      'X-Access-Token': this.token,
    };
    console.log('[HisService] GET', {
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
        throw new Error(`HIS HTTP Error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[HisService] RESPONSE', {
        url: fullUrl,
        summary: this.summarizePayload(result),
      });
      return result as T;
    } catch (error) {
      console.error(`[HisService] Request failed: ${fullUrl}`, error);
      throw error;
    }
  }

  /**
   * 同步全局诊断目录
   * 真实 HIS 服务：api/base.hiBdDieService/queryList
   */
  async fetchDiagnosisCatalog(): Promise<HisDiagnosisCatalogItem[]> {
    const response = await this.post<HiBdDieListBody>(
      HIS_CATALOG_ENDPOINTS.diagnoses,
      [{ start: 0, limit: -1 }]
    );

    const items = response.body?.items ?? [];
    return items
      .filter((item) => item.fgActive !== '0')
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
  }

  /**
   * 同步诊疗项目目录（检查 / 检验 / 治疗）
   */
  async fetchInstitutionMedicalItemsCatalog(orgCode: string): Promise<HisMedicalItemCatalogItem[]> {
    void orgCode;

    const response = await this.post<HiBdCliOrgListBody>(
      HIS_CATALOG_ENDPOINTS.medicalItems,
      [{ start: 0, limit: -1 }]
    );

    const items = response.body?.items ?? [];
    return items
      .filter((item) => item.fgActive !== '0')
      .map((item) => {
        const name = item.naCli?.trim() || '';
        const sdCliText = item.sdCliText?.trim() || '';
        const keywords = [item.py?.trim(), item.naCstmg?.trim(), sdCliText]
          .filter((part): part is string => Boolean(part));

        return {
          id: item.idCli?.trim() || name,
          code: item.idCli?.trim() || '',
          name,
          category: this.mapCliCategory(sdCliText, item.sdCli?.trim()),
          keywords: keywords.length > 0 ? Array.from(new Set(keywords)) : undefined
        };
      })
      .filter(item => item.id || item.name);
  }

  /**
   * 按机构同步药品目录
   */
  async fetchInstitutionMedicineCatalog(orgCode: string): Promise<HisMedicineCatalogItem[]> {
    const storeIds = await this.fetchWesternMedicineStoreIds(orgCode);
    if (storeIds.length === 0) {
      return [];
    }

    const responses = await Promise.all(
      storeIds.map((idSto) => this.post<OrgMedicineConfigItem[]>(
        HIS_CATALOG_ENDPOINTS.medicines,
        [{ start: 0, limit: -1, params: { idSto } }]
      ))
    );

    const merged = responses.flatMap(response => response.body ?? response.data ?? []);
    const unique = new Map<string, HisMedicineCatalogItem>();

    merged
      .filter(item => item.fgActive !== '0' && item.orgActive !== '0' && item.medActive !== '0')
      .filter(item => (item.sdMed == '1' || item.sdMed == '2'))
      .forEach((item) => {
        const name = item.naMedPro?.trim() || item.naMed?.trim() || '';
        if (!name) {
          return;
        }

        const id = item.idMedPro?.trim() || item.idMed?.trim() || name;
        if (unique.has(id)) {
          return;
        }

        unique.set(id, {
          id,
          code: item.idMed?.trim() || item.idMedPro?.trim() || '',
          name,
          spec: this.composeMedicineSpec(item.specSale?.trim(), item.unitSale?.trim())
        });
      });

    return Array.from(unique.values());
  }

  /**
   * 获取药品用法字典
   */
  async fetchMedicineUsageDictionary(): Promise<HisDictionaryItem[]> {
    const response = await this.get<HisDictionaryResponse>('rbmh.base.med.usage.dic');
    return Array.isArray(response?.items) ? response.items : [];
  }

  /**
   * 更新 Token
   */
  updateToken(newToken: string): void {
    this.token = newToken;
  }

  private mapCliCategory(sdCliText?: string, sdCli?: string): string {
    const normalizedText = sdCliText?.trim();
    if (normalizedText) {
      if (normalizedText.includes('检验')) {
        return '检验';
      }
      if (normalizedText.includes('检查')) {
        return '检查';
      }
      return '治疗';
    }

    switch (sdCli) {
      case '1':
        return '检查';
      case '2':
        return '检验';
      default:
        return '治疗';
    }
  }

  private async fetchWesternMedicineStoreIds(orgCode: string): Promise<string[]> {
    const response = await this.post<DispensingStoreItem[]>(
      HIS_CATALOG_ENDPOINTS.medicineStores,
      []
    );

    const stores = response.body ?? response.data ?? [];
    const validStores = stores.filter((store) => {
      if (store.fgActive === '0') {
        return false;
      }
      if (orgCode && store.idOrg?.trim() && store.idOrg.trim() !== orgCode) {
        return false;
      }

      const sdSto = store.sdSto?.trim();
      const stoScopes = (store.sdsStoPro || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      return sdSto === '2' && stoScopes.includes('1') && stoScopes.includes('2');
    });

    return Array.from(new Set(
      validStores
        .map(store => store.idSto?.trim())
        .filter((idSto): idSto is string => Boolean(idSto))
    ));
  }

  private composeMedicineSpec(specSale?: string, unitSale?: string): string {
    if (specSale && unitSale && !specSale.includes(unitSale)) {
      return `${specSale} ${unitSale}`.trim();
    }

    return specSale || unitSale || '';
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
  }
): HisService | null => {
  if (baseUrl && auth?.token) {
    instance = new HisService(baseUrl, auth.token);
  }
  return instance;
};

export const resetHisService = (): void => {
  instance = null;
};
