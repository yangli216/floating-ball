/**
 * 人卫 Inside 知识库服务
 * 提供医学知识库的向量搜索和文档检索功能
 */

// 配置常量
const DEFAULT_CONFIG = {
  tokenUrl: 'https://inside.pmphai.com/oauth2/access_token',
  apiBaseUrl: 'https://inside.pmphai.com/gateway/cloud/cloudapi/rest/json',
  apiBaseUrlStandard: 'https://inside.pmphai.com/gateway/cloud/cloudapi/rest',
  // Local proxy endpoints to avoid CORS
  proxyBaseUrl: 'http://localhost:8081/api/pmphai',
};

// 搜索类型
export enum SearchType {
  Knowledge = 1,  // 知识
  Books = 2,      // 图书
  Images = 3,     // 图片
}

// 搜索参数
export interface SearchParams {
  query: string;
  type?: SearchType;
  limit?: number;
  score?: number;
  enableAbstract?: boolean;
}

// 搜索结果来源信息
export interface SourceInfo {
  knowledgeLibName: string;
  knowledgeLibId?: string;
  publishYear?: string;
}

// 搜索结果
export interface SearchResult {
  id: string;
  name: string;
  content: string;
  score?: number;
  words?: number;
  resourcePos?: string;
  sourceInfo?: SourceInfo;
  aiAbstract?: string;
}

// 文档内容
export interface ClipData {
  sourceInfo?: SourceInfo;
  xml: string;
}

// 传统列表搜索参数
export interface ListSearchParams {
  key?: string;           // 搜索关键词
  kgBaseId?: string;      // 知识库ID
  kgBaseName?: string;    // 知识库名称
  tagId?: string;         // 分类ID
  tagName?: string;       // 分类名称
  pageSize?: number;      // 每页条数，默认10
  page?: number;          // 页码，默认0
  sortField?: string;     // 排序字段
  sortRule?: string;      // 排序规则
}

// 传统列表搜索结果项
export interface ListSearchItem {
  id: string;
  name: string;
  kgBaseId?: string;
  kgBaseName?: string;
  kgBaseDisplayName?: string;
  updateTime?: string;
  tagNames?: string[];
}

// 传统列表搜索响应
export interface ListSearchResponse {
  rows: ListSearchItem[];
  totalRows: number;
  totalPage: number;
  page: number;
  pageSize: number;
}

// 知识库信息
export interface KnowledgeBase {
  id: string;
  kgBaseName: string;
  displayName?: string;
  kgBaseDesc?: string;
  kgNum?: number;
  maxReleaseDate?: string;
}

// 知识库分类
export interface KnowledgeCategory {
  id: string;
  name: string;
  child?: KnowledgeCategory[];
}

// 批量搜索结果
export interface BatchSearchResults {
  diagnoses: Map<string, SearchResult[]>;
  medications: Map<string, SearchResult[]>;
  examinations: Map<string, SearchResult[]>;
}

// Token 缓存
interface TokenCache {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;
}

// 搜索结果缓存
interface SearchCache {
  results: SearchResult[];
  timestamp: number;
}

// 缓存过期时间（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 获取知识库配置
 */
export function getPMPHAIConfig() {
  // Trim values to avoid whitespace issues
  const appKey = (localStorage.getItem('PMPHAI_APP_KEY') || import.meta.env.VITE_PMPHAI_APP_KEY || '').trim();
  const appSecret = (localStorage.getItem('PMPHAI_APP_SECRET') || import.meta.env.VITE_PMPHAI_APP_SECRET || '').trim();
  const enabled = localStorage.getItem('PMPHAI_ENABLED') !== 'false'; // 默认启用

  return { appKey, appSecret, enabled };
}

/**
 * 检查知识库是否已配置
 */
export function isPMPHAIConfigured(): boolean {
  const { appKey, appSecret, enabled } = getPMPHAIConfig();
  return enabled && !!appKey && !!appSecret;
}

/**
 * MD5 哈希函数（纯 JavaScript 实现）
 * 基于 Joseph Myers 的 MD5 实现
 */
function md5(text: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }

  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }

  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }

  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function binlMD5(x: number[], len: number): number[] {
    x[len >> 5] |= 0x80 << len % 32;
    x[(((len + 64) >>> 9) << 4) + 14] = len;

    let a = 1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d = 271733878;

    for (let i = 0; i < x.length; i += 16) {
      const olda = a;
      const oldb = b;
      const oldc = c;
      const oldd = d;

      a = md5ff(a, b, c, d, x[i], 7, -680876936);
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
      b = md5gg(b, c, d, a, x[i], 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

      a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
      d = md5hh(d, a, b, c, x[i + 0], 11, -358537222);
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

      a = md5ii(a, b, c, d, x[i], 6, -198630844);
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

      a = safeAdd(a, olda);
      b = safeAdd(b, oldb);
      c = safeAdd(c, oldc);
      d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  }

  function binl2hex(binarray: number[]): string {
    const hexTab = '0123456789abcdef';
    let str = '';
    for (let i = 0; i < binarray.length * 4; i++) {
      str +=
        hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf) +
        hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xf);
    }
    return str;
  }

  function str2binl(str: string): number[] {
    const bin: number[] = [];
    const mask = (1 << 8) - 1;
    for (let i = 0; i < str.length * 8; i += 8) {
      bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << i % 32;
    }
    return bin;
  }

  // 将 UTF-8 字符串转换为字节
  const utf8Str = unescape(encodeURIComponent(text));
  return binl2hex(binlMD5(str2binl(utf8Str), utf8Str.length * 8));
}

/**
 * 人卫知识库服务类
 */
class PMPHAIService {
  private tokenCache: TokenCache = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
  };

  private searchCache: Map<string, SearchCache> = new Map();

  /**
   * 生成签名
   */
  private generateSign(params: Record<string, string | number>): string {
    const { appSecret, appKey } = getPMPHAIConfig();

    // 按参数名首字母排序，用 & 连接
    const sortedKeys = Object.keys(params).sort();
    const param1 = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

    // 加密字符串 = 参数1 + 云应用密钥 + 云应用 app_key
    const signString = param1 + appSecret + appKey;
    return md5(signString);
  }

  /**
   * 获取 Access Token
   */
  private async getAccessToken(): Promise<string> {
    // 检查缓存是否有效
    if (this.tokenCache.accessToken && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.accessToken;
    }

    const { appKey, appSecret } = getPMPHAIConfig();
    if (!appKey || !appSecret) {
      throw new Error('知识库 APP_KEY 或 APP_SECRET 未配置');
    }

    // Use local proxy to avoid CORS
    const response = await fetch(`${DEFAULT_CONFIG.proxyBaseUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ appKey, appSecret }),
    });

    const result = await response.json();

    if (result?.data?.accessToken) {
      this.tokenCache.accessToken = result.data.accessToken;
      this.tokenCache.refreshToken = result.data.refreshToken;
      // 提前 5 分钟过期，避免边界问题
      this.tokenCache.expiresAt = Date.now() + (result.data.expiresIn - 300) * 1000;
      return this.tokenCache.accessToken;
    }

    throw new Error('获取知识库 Token 失败: ' + JSON.stringify(result));
  }

  /**
   * 刷新 Access Token
   */
  private async refreshAccessToken(): Promise<string> {
    if (!this.tokenCache.refreshToken) {
      return await this.getAccessToken();
    }

    const { appKey } = getPMPHAIConfig();
    const params: Record<string, string> = {
      app_key: appKey,
      grant_type: 'refresh_token',
      refresh_token: this.tokenCache.refreshToken,
    };

    const sign = this.generateSign(params);

    const data = new URLSearchParams({
      ...params,
      sign: sign,
    });

    try {
      const response = await fetch(DEFAULT_CONFIG.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: data,
      });

      const result = await response.json();

      if (result?.data?.accessToken) {
        this.tokenCache.accessToken = result.data.accessToken;
        this.tokenCache.refreshToken = result.data.refreshToken;
        this.tokenCache.expiresAt = Date.now() + (result.data.expiresIn - 300) * 1000;
        return this.tokenCache.accessToken;
      }
    } catch (error) {
      console.warn('刷新 Token 失败，尝试重新获取:', error);
    }

    // 刷新失败，尝试重新获取
    return await this.getAccessToken();
  }

  /**
   * 生成缓存 key
   */
  private getCacheKey(params: SearchParams): string {
    return JSON.stringify({
      query: params.query,
      type: params.type || SearchType.Knowledge,
      limit: params.limit || 5,
    });
  }

  /**
   * 搜索知识库
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    if (!isPMPHAIConfigured()) {
      console.warn('知识库未配置，跳过搜索');
      return [];
    }

    // 检查缓存
    const cacheKey = this.getCacheKey(params);
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results;
    }

    try {
      const token = await this.getAccessToken();
      const requestBody = {
        token,
        query: params.query,
        type: params.type ?? SearchType.Knowledge,
        limit: params.limit ?? 5,
        ...(params.score !== undefined && params.score > 0 ? { score: params.score } : {}),
        ...(params.enableAbstract !== undefined ? { enableAbstract: params.enableAbstract } : {}),
      };

      // Use local proxy to avoid CORS
      const response = await fetch(`${DEFAULT_CONFIG.proxyBaseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      const results = result?.data || [];

      // 更新缓存
      this.searchCache.set(cacheKey, {
        results,
        timestamp: Date.now(),
      });

      return results;
    } catch (error) {
      console.error('知识库搜索失败:', error);
      return [];
    }
  }

  /**
   * 获取文档完整内容
   */
  async getClip(id: string): Promise<ClipData | null> {
    if (!isPMPHAIConfigured()) {
      console.warn('知识库未配置，跳过获取文档');
      return null;
    }

    try {
      const token = await this.getAccessToken();

      // Use local proxy to avoid CORS
      const response = await fetch(`${DEFAULT_CONFIG.proxyBaseUrl}/clip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, id }),
      });

      const result = await response.json();
      return result?.data || null;
    } catch (error) {
      console.error('获取文档内容失败:', error);
      return null;
    }
  }

  /**
   * 批量搜索（并行执行多个搜索）
   */
  async batchSearch(
    queries: string[],
    options?: Partial<SearchParams>
  ): Promise<Map<string, SearchResult[]>> {
    if (!isPMPHAIConfigured()) {
      console.warn('知识库未配置，跳过批量搜索');
      return new Map();
    }

    // 去重并过滤空查询
    const uniqueQueries = [...new Set(queries.filter(q => q && q.trim()))];

    // 并行执行搜索
    const results = await Promise.all(
      uniqueQueries.map(async query => {
        const searchResults = await this.search({
          query,
          ...options,
        });
        return { query, results: searchResults };
      })
    );

    // 转换为 Map
    const resultMap = new Map<string, SearchResult[]>();
    for (const { query, results: searchResults } of results) {
      resultMap.set(query, searchResults);
    }

    return resultMap;
  }

  /**
   * 按类别批量搜索（用于推荐结果）
   */
  async searchByCategories(
    diagnoses: string[],
    medications: string[],
    examinations: string[]
  ): Promise<BatchSearchResults> {
    if (!isPMPHAIConfigured()) {
      return {
        diagnoses: new Map(),
        medications: new Map(),
        examinations: new Map(),
      };
    }

    // 并行搜索三个类别
    const [diagnosisResults, medicationResults, examinationResults] = await Promise.all([
      this.batchSearch(diagnoses, { limit: 3, enableAbstract: true }),
      this.batchSearch(medications, { limit: 3, enableAbstract: true }),
      this.batchSearch(examinations, { limit: 3, enableAbstract: true }),
    ]);

    return {
      diagnoses: diagnosisResults,
      medications: medicationResults,
      examinations: examinationResults,
    };
  }

  /**
   * 获取文档页面 URL（通过 page-url API 生成签名 URL）
   * 用于文档浏览模式
   */
  async getPageUrl(params: {
    pageName: string;
    id?: string;
    kgBaseId?: string;
    contentId?: string;
  }): Promise<string | null> {
    const { appKey, appSecret } = getPMPHAIConfig();
    if (!appKey || !appSecret) {
      console.warn('知识库未配置，跳过获取页面URL');
      return null;
    }

    try {
      const response = await fetch(`${DEFAULT_CONFIG.proxyBaseUrl}/page-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appKey,
          appSecret,
          pageName: params.pageName,
          id: params.id,
          kgBaseId: params.kgBaseId,
          contentId: params.contentId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result?.data?.url || null;
    } catch (error) {
      console.error('获取页面URL失败:', error);
      return null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.searchCache.clear();
  }

  /**
   * 清除 Token 缓存
   */
  clearTokenCache(): void {
    this.tokenCache = {
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    };
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccessToken();
      const results = await this.search({ query: '测试', limit: 1 });
      return {
        success: true,
        message: `连接成功，获取到 ${results.length} 条测试结果`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || '连接失败',
      };
    }
  }

  /**
   * 传统列表搜索（关键词搜索）
   */
  async listSearch(params: ListSearchParams): Promise<ListSearchResponse | null> {
    if (!isPMPHAIConfigured()) {
      console.warn('知识库未配置，跳过列表搜索');
      return null;
    }

    try {
      const token = await this.getAccessToken();

      const requestParams: Record<string, string | number> = {
        token,
        pageSize: params.pageSize || 10,
        page: params.page || 0,
      };

      if (params.key) requestParams.key = params.key;
      if (params.kgBaseId) requestParams.kgBaseId = params.kgBaseId;
      if (params.kgBaseName) requestParams.kgBaseName = params.kgBaseName;
      if (params.tagId) requestParams.tagId = params.tagId;
      if (params.tagName) requestParams.tagName = params.tagName;
      if (params.sortField !== undefined) requestParams.sortField = params.sortField;
      if (params.sortRule !== undefined) requestParams.sortRule = params.sortRule;

      // Use local proxy to avoid CORS
      const response = await fetch(`${DEFAULT_CONFIG.proxyBaseUrl}/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      });

      const result = await response.json();
      return result?.data || null;
    } catch (error) {
      console.error('列表搜索失败:', error);
      return null;
    }
  }

  /**
   * 获取知识库列表
   */
  async getKnowledgeBases(kgBaseId?: string): Promise<Record<string, KnowledgeBase[]> | null> {
    if (!isPMPHAIConfigured()) {
      console.warn('知识库未配置，跳过获取知识库列表');
      return null;
    }

    try {
      const token = await this.getAccessToken();
      const requestBody: Record<string, string> = {};
      if (kgBaseId) {
        requestBody.kgBaseId = kgBaseId;
      }

      const response = await fetch(`${DEFAULT_CONFIG.apiBaseUrlStandard}?token=${token}&method=kgbases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      return result?.data || null;
    } catch (error) {
      console.error('获取知识库列表失败:', error);
      return null;
    }
  }

  /**
   * 获取知识库分类
   */
  async getCategories(kgBaseId: string): Promise<KnowledgeCategory[] | null> {
    if (!isPMPHAIConfigured()) {
      console.warn('知识库未配置，跳过获取分类');
      return null;
    }

    try {
      const token = await this.getAccessToken();

      // Use local proxy to avoid CORS
      const response = await fetch(`${DEFAULT_CONFIG.proxyBaseUrl}/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          method: 'tag',
          kgBaseId: kgBaseId,
        }),
      });

      const result = await response.json();
      return result?.data || null;
    } catch (error) {
      console.error('获取分类失败:', error);
      return null;
    }
  }

  /**
   * 生成页面访问 URL（用于在新窗口打开详情）
   */
  generatePageUrl(params: {
    pageName: string;
    id?: string;
    kgBaseId?: string;
    contentId?: string;
    originUrl?: string;
  }): string {
    const { appKey } = getPMPHAIConfig();
    const timestamp = Date.now();

    // 构建 redirect_url
    let redirectUrl = 'https://inside.pmphai.com/gateway/cloud/pageapi/rest?';
    const redirectParams = new URLSearchParams();
    redirectParams.set('pageName', params.pageName);
    if (params.kgBaseId) redirectParams.set('kgBaseId', params.kgBaseId);
    if (params.id) redirectParams.set('id', params.id);
    if (params.contentId) redirectParams.set('contentId', params.contentId);
    redirectUrl += redirectParams.toString();

    const finalOriginUrl = params.originUrl || 'https://www.pmphai.com';

    // URL 编码
    const encodedRedirectUrl = encodeURIComponent(redirectUrl);
    const encodedOriginUrl = encodeURIComponent(finalOriginUrl);

    // 构建签名参数
    const signParams: Record<string, string | number> = {
      app_key: appKey,
      grant_type: 'page_token',
      origin_url: encodedOriginUrl,
      redirect_url: encodedRedirectUrl,
      timestamp: timestamp,
    };

    const sign = this.generateSign(signParams);

    // 构建最终 URL
    return `https://inside.pmphai.com/aip/oauth/authorize?app_key=${appKey}&grant_type=page_token&timestamp=${timestamp}&sign=${sign}&redirect_url=${encodedRedirectUrl}&origin_url=${encodedOriginUrl}`;
  }
}

// 导出单例实例
export const pmphaiService = new PMPHAIService();
