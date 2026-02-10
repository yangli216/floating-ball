import CryptoJS from 'crypto-js'

/**
 * 知识库检索服务
 * 基于inside云版通用页面接口
 */

export interface KnowledgeBaseConfig {
  appKey: string
  appSecret: string
  baseUrl: string
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
 * 从localStorage读取
 */
export function getKnowledgeBaseConfig(): KnowledgeBaseConfig | null {
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
  localStorage.setItem('KB_APP_KEY', config.appKey)
  localStorage.setItem('KB_APP_SECRET', config.appSecret)
  localStorage.setItem('KB_BASE_URL', config.baseUrl)
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
