import CryptoJS from 'crypto-js'
import { isRegionalMode, getCachedBootstrap } from './regionalClient'

/**
 * 知识库检索服务
 * 基于inside云版通用页面接口
 * 区域化模式下凭证由后端管理，URL 生成通过后端代理
 */

export interface KnowledgeBaseConfig {
  appKey: string
  appSecret: string
  baseUrl: string
  managedByServer?: boolean
  enabled?: boolean
}

export interface PageParams {
  pageName: 'home' | 'search' | 'detail'
  kgBaseId?: string // 知识库id，pageName为search时必填
  id?: string // 知识id，pageName为detail时必填
  kgFields?: string // 显示字段，逗号分隔
  contentId?: string // 图书文章目录定位参数
  muluId?: string // 图书文章目录定位参数
  catalogueId?: string // 图书文章目录定位参数
}

/**
 * 生成签名
 * @param params 请求参数
 * @param appSecret 应用密钥
 */
function generateSign(params: Record<string, string>, appSecret: string): string {
  // 按照参数名ASCII码从小到大排序
  const sortedKeys = Object.keys(params).sort()

  // 拼接参数字符串
  const paramStr = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&')

  // 拼接appSecret
  const signStr = paramStr + appSecret

  // MD5加密并转为小写
  return CryptoJS.MD5(signStr).toString().toLowerCase()
}

/**
 * 构建知识库页面URL
 * @param config 配置信息
 * @param pageParams 页面参数
 * @param originUrl pageToken失效后的回显地址
 */
export function buildKnowledgeBaseUrl(
  config: KnowledgeBaseConfig,
  pageParams: PageParams,
  originUrl: string = window.location.href
): string {
  if (config.managedByServer) {
    throw new Error('区域化模式下请通过服务端生成知识库页面地址')
  }
  if (!config.appKey || !config.appSecret) {
    throw new Error('知识库凭据未配置')
  }

  const timestamp = Date.now().toString()

  // 构建redirect_url
  const redirectParams = new URLSearchParams()
  redirectParams.set('pageName', pageParams.pageName)

  if (pageParams.kgBaseId) {
    redirectParams.set('kgBaseId', pageParams.kgBaseId)
  }
  if (pageParams.id) {
    redirectParams.set('id', pageParams.id)
  }
  if (pageParams.kgFields) {
    redirectParams.set('kgFields', pageParams.kgFields)
  }
  if (pageParams.contentId) {
    redirectParams.set('contentId', pageParams.contentId)
  }
  if (pageParams.muluId) {
    redirectParams.set('muluId', pageParams.muluId)
  }
  if (pageParams.catalogueId) {
    redirectParams.set('catalogueId', pageParams.catalogueId)
  }

  const redirectUrl = `${config.baseUrl}/gateway/cloud/pageapi/rest?${redirectParams.toString()}`

  // 构建签名参数
  const signParams: Record<string, string> = {
    timestamp,
    app_key: config.appKey,
    grant_type: 'page_token',
    redirect_url: redirectUrl,
    origin_url: originUrl
  }

  // 生成签名
  const sign = generateSign(signParams, config.appSecret)

  // 构建最终URL
  const finalParams = new URLSearchParams()
  finalParams.set('timestamp', timestamp)
  finalParams.set('app_key', config.appKey)
  finalParams.set('grant_type', 'page_token')
  finalParams.set('sign', sign)
  finalParams.set('redirect_url', redirectUrl)
  finalParams.set('origin_url', originUrl)

  return `${config.baseUrl}/aip/oauth/authorize?${finalParams.toString()}`
}

/**
 * 获取知识库配置
 * 区域化模式下从 bootstrap 获取，本地模式从 localStorage 读取
 */
export function getKnowledgeBaseConfig(): KnowledgeBaseConfig | null {
  // 区域化模式：桌面端不再持有凭据，只保留服务端托管状态
  if (isRegionalMode()) {
    const bootstrap = getCachedBootstrap()
    const enabled = bootstrap?.pmphai?.enabled ?? bootstrap?.knowledgeBase?.enabled ?? false
    if (enabled) {
      return {
        appKey: '',
        appSecret: '',
        baseUrl: bootstrap?.knowledgeBase?.baseUrl || 'https://inside.pmphai.com',
        managedByServer: true,
        enabled: true
      }
    }
    return null
  }

  const appKey = localStorage.getItem('KB_APP_KEY')
  const appSecret = localStorage.getItem('KB_APP_SECRET')
  const baseUrl = localStorage.getItem('KB_BASE_URL') || 'https://inside.pmphai.com'

  if (!appKey || !appSecret) {
    return null
  }

  return {
    appKey,
    appSecret,
    baseUrl
  }
}

/**
 * 保存知识库配置
 */
export function saveKnowledgeBaseConfig(config: KnowledgeBaseConfig): void {
  if (isRegionalMode() || config.managedByServer) {
    return
  }
  localStorage.setItem('KB_APP_KEY', config.appKey)
  localStorage.setItem('KB_APP_SECRET', config.appSecret)
  localStorage.setItem('KB_BASE_URL', config.baseUrl)
}

export function isKnowledgeBaseConfigured(config: KnowledgeBaseConfig | null): boolean {
  if (!config) {
    return false
  }
  if (config.managedByServer) {
    return config.enabled !== false
  }
  return !!config.appKey && !!config.appSecret
}

/**
 * 获取知识库列表
 * 这个接口需要根据实际的知识库列表API来实现
 */
export interface KnowledgeBase {
  id: string
  name: string
  description?: string
}

// 模拟知识库列表，实际应该从API获取
export async function fetchKnowledgeBases(): Promise<KnowledgeBase[]> {
  // TODO: 实际实现需要调用获取知识库列表的API
  // 参考文档中的 3.3.4.1 获取知识库列表信息接口
  return []
}

/**
 * 搜索结果项
 */
export interface SearchResultItem {
  id: string
  title: string
  content: string
  source: string
  relevance?: number
  kgBaseId?: string
}

/**
 * 搜索知识库内容
 * @param config 配置信息
 * @param keyword 搜索关键词
 * @param kgBaseId 知识库ID（可选）
 */
export async function searchKnowledgeContent(
  // @ts-ignore
  config: KnowledgeBaseConfig,
  keyword: string,
  // @ts-ignore
  kgBaseId?: string
): Promise<SearchResultItem[]> {
  // TODO: 实际实现需要调用知识库搜索API
  // 这里先返回模拟数据

  // 模拟搜索延迟
  await new Promise(resolve => setTimeout(resolve, 500))

  // 模拟搜索结果
  const mockResults: SearchResultItem[] = [
    {
      id: '1',
      title: `${keyword} - 诊断标准`,
      content: `${keyword}的诊断主要依据临床症状、体格检查和辅助检查。主要表现为...`,
      source: '临床诊疗指南',
      relevance: 0.95
    },
    {
      id: '2',
      title: `${keyword} - 治疗方案`,
      content: `针对${keyword}的治疗，应采用综合治疗方案，包括一般治疗、药物治疗等...`,
      source: '治疗规范',
      relevance: 0.88
    },
    {
      id: '3',
      title: `${keyword} - 用药指导`,
      content: `${keyword}的常用药物包括...使用时应注意剂量和禁忌症...`,
      source: '药品说明书',
      relevance: 0.82
    }
  ]

  // 根据关键词过滤（实际应该由后端完成）
  return mockResults.filter(item =>
    item.title.includes(keyword) || item.content.includes(keyword)
  )
}
