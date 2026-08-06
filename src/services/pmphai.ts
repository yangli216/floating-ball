/** 人卫 Inside 知识库客户端。凭据与上游协议只存在于 pcie-server。 */
import { getCachedBootstrap, regionalGet, regionalPost } from './regionalClient';
import { trackFeatureUsage } from './featureUsageTracker';

export enum SearchType {
  Knowledge = 1,
  Books = 2,
  Images = 3,
}

export interface SearchParams {
  query: string;
  type?: SearchType;
  limit?: number;
  score?: number;
  enableAbstract?: boolean;
  trackUsage?: boolean;
}

export interface SourceInfo {
  knowledgeLibName: string;
  knowledgeLibId?: string;
  publishYear?: string;
}

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

export interface ClipData {
  sourceInfo?: SourceInfo;
  xml: string;
}

export interface ListSearchParams {
  key?: string;
  kgBaseId?: string;
  kgBaseName?: string;
  tagId?: string;
  tagName?: string;
  pageSize?: number;
  page?: number;
  sortField?: string;
  sortRule?: string;
}

export interface ListSearchItem {
  id: string;
  name: string;
  kgBaseId?: string;
  kgBaseName?: string;
  kgBaseDisplayName?: string;
  updateTime?: string;
  tagNames?: string[];
}

export interface ListSearchResponse {
  rows: ListSearchItem[];
  totalRows: number;
  totalPage: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeBase {
  id: string;
  kgBaseName: string;
  displayName?: string;
  kgBaseDesc?: string;
  kgNum?: number;
  maxReleaseDate?: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  child?: KnowledgeCategory[];
}

export interface BatchSearchResults {
  diagnoses: Map<string, SearchResult[]>;
  medications: Map<string, SearchResult[]>;
  examinations: Map<string, SearchResult[]>;
}

interface SearchCache {
  results: SearchResult[];
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000;
let knowledgeUsageSequence = 0;

function nextKnowledgeUsageKey(action: string, target?: string): string {
  knowledgeUsageSequence += 1;
  return `knowledge:${action}:${Date.now()}:${knowledgeUsageSequence}:${target || 'na'}`;
}

function trackKnowledgeUsage(eventAction: string, payload?: Record<string, unknown>): void {
  trackFeatureUsage({
    featureCode: 'knowledge_usage',
    eventAction,
    idempotencyKey: nextKnowledgeUsageKey(eventAction, typeof payload?.query === 'string' ? payload.query : undefined),
    sourceModule: 'pmphai',
    scene: 'knowledge-base',
    payload,
  });
}

export function getPMPHAIConfig() {
  return { appKey: '', appSecret: '', enabled: getCachedBootstrap()?.pmphai?.enabled ?? false };
}

export function isPMPHAIConfigured(): boolean {
  return getCachedBootstrap()?.pmphai?.enabled ?? false;
}

async function knowledgePost<T>(path: string, body: unknown): Promise<T> {
  return regionalPost<T>(`/v1/knowledge/pmphai${path}`, body);
}

async function knowledgeGet<T>(path: string): Promise<T> {
  return regionalGet<T>(`/v1/knowledge/pmphai${path}`);
}

class PMPHAIService {
  private searchCache: Map<string, SearchCache> = new Map();

  private getCacheKey(params: SearchParams): string {
    return JSON.stringify({ query: params.query, type: params.type || SearchType.Knowledge, limit: params.limit || 5 });
  }

  async search(params: SearchParams): Promise<SearchResult[]> {
    if (!isPMPHAIConfigured()) return [];
    const cacheKey = this.getCacheKey(params);
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.results;
    try {
      const results = await knowledgePost<SearchResult[]>('/search', {
        query: params.query,
        type: params.type ?? SearchType.Knowledge,
        limit: params.limit ?? 5,
        ...(params.score !== undefined && params.score > 0 ? { score: params.score } : {}),
        ...(params.enableAbstract !== undefined ? { enableAbstract: params.enableAbstract } : {}),
      });
      this.searchCache.set(cacheKey, { results, timestamp: Date.now() });
      if (params.trackUsage) {
        trackKnowledgeUsage('knowledge_search', { query: params.query, type: params.type ?? SearchType.Knowledge, resultCount: results.length });
      }
      return results;
    } catch (error) {
      console.error('知识库搜索失败:', error);
      return [];
    }
  }

  async getClip(id: string): Promise<ClipData | null> {
    if (!isPMPHAIConfigured()) return null;
    try {
      const clip = await knowledgePost<ClipData>('/clip', { id });
      if (clip) trackKnowledgeUsage('knowledge_clip', { id });
      return clip;
    } catch (error) {
      console.error('获取文档内容失败:', error);
      return null;
    }
  }

  async batchSearch(queries: string[], options?: Partial<SearchParams>): Promise<Map<string, SearchResult[]>> {
    return this.batchSearchInternal(queries, options, Boolean(options?.trackUsage));
  }

  private async batchSearchInternal(
    queries: string[],
    options: Partial<SearchParams> | undefined,
    shouldTrack: boolean,
  ): Promise<Map<string, SearchResult[]>> {
    if (!isPMPHAIConfigured()) return new Map();
    const uniqueQueries = [...new Set(queries.filter(query => query && query.trim()))];
    const searchOptions = { ...options, trackUsage: false };
    const entries = await Promise.all(uniqueQueries.map(async query => ({
      query,
      results: await this.search({ query, ...searchOptions }),
    })));
    const resultMap = new Map(entries.map(entry => [entry.query, entry.results]));
    if (shouldTrack && uniqueQueries.length > 0) {
      trackKnowledgeUsage('knowledge_batch_search', {
        queryCount: uniqueQueries.length,
        resultCount: Array.from(resultMap.values()).flat().length,
      });
    }
    return resultMap;
  }

  async searchByCategories(
    diagnoses: string[],
    medications: string[],
    examinations: string[],
    options?: { trackUsage?: boolean },
  ): Promise<BatchSearchResults> {
    if (!isPMPHAIConfigured()) {
      return { diagnoses: new Map(), medications: new Map(), examinations: new Map() };
    }
    const [diagnosisResults, medicationResults, examinationResults] = await Promise.all([
      this.batchSearchInternal(diagnoses, { limit: 3, enableAbstract: true }, false),
      this.batchSearchInternal(medications, { limit: 3, enableAbstract: true }, false),
      this.batchSearchInternal(examinations, { limit: 3, enableAbstract: true }, false),
    ]);
    if (options?.trackUsage && diagnoses.length + medications.length + examinations.length > 0) {
      trackKnowledgeUsage('knowledge_category_search', {
        diagnosisQueryCount: diagnoses.filter(Boolean).length,
        medicationQueryCount: medications.filter(Boolean).length,
        examinationQueryCount: examinations.filter(Boolean).length,
        resultCount: [...diagnosisResults.values(), ...medicationResults.values(), ...examinationResults.values()].flat().length,
      });
    }
    return { diagnoses: diagnosisResults, medications: medicationResults, examinations: examinationResults };
  }

  async getPageUrl(params: {
    pageName: string;
    id?: string;
    kgBaseId?: string;
    kgFields?: string;
    contentId?: string;
    muluId?: string;
    catalogueId?: string;
    originUrl?: string;
  }): Promise<string | null> {
    if (!isPMPHAIConfigured()) return null;
    try {
      const result = await knowledgePost<{ url: string }>('/page-url', params);
      const url = result?.url || null;
      if (url) trackKnowledgeUsage('knowledge_page_url', { pageName: params.pageName, id: params.id, kgBaseId: params.kgBaseId });
      return url;
    } catch (error) {
      console.error('获取页面URL失败:', error);
      return null;
    }
  }

  clearCache(): void {
    this.searchCache.clear();
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const results = await knowledgePost<SearchResult[]>('/search', { query: '测试', limit: 1 });
      return { success: true, message: `连接成功，获取到 ${results.length} 条测试结果` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '连接失败' };
    }
  }

  async listSearch(params: ListSearchParams): Promise<ListSearchResponse | null> {
    if (!isPMPHAIConfigured()) return null;
    try {
      const response = await knowledgePost<ListSearchResponse>('/list', {
        ...params,
        pageSize: params.pageSize || 10,
        page: params.page || 0,
      });
      if (response) trackKnowledgeUsage('knowledge_list_search', { query: params.key, kgBaseId: params.kgBaseId, resultCount: response.rows?.length || 0 });
      return response;
    } catch (error) {
      console.error('列表搜索失败:', error);
      return null;
    }
  }

  async getKnowledgeBases(kgBaseId?: string): Promise<Record<string, KnowledgeBase[]> | null> {
    if (!isPMPHAIConfigured()) return null;
    try {
      const query = kgBaseId ? `?kgBaseId=${encodeURIComponent(kgBaseId)}` : '';
      return await knowledgeGet<Record<string, KnowledgeBase[]>>(`/kgbases${query}`);
    } catch (error) {
      console.error('获取知识库列表失败:', error);
      return null;
    }
  }

  async getCategories(kgBaseId: string): Promise<KnowledgeCategory[] | null> {
    if (!isPMPHAIConfigured()) return null;
    try {
      return await knowledgeGet<KnowledgeCategory[]>(`/categories?kgBaseId=${encodeURIComponent(kgBaseId)}`);
    } catch (error) {
      console.error('获取分类失败:', error);
      return null;
    }
  }
}

export const pmphaiService = new PMPHAIService();
