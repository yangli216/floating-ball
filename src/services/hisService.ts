import { fetch } from '@tauri-apps/plugin-http';

/**
 * HIS 服务响应基础结构
 */
export interface HisResponse<T = any> {
  success: boolean;
  message?: string;
  body: T;
  code?: string | number;
}

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
    // 确保 baseUrl 以 / 结尾
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.token = token;
  }

  /**
   * 发起 HIS POST 请求
   * @param url 相对路径 (例如: 'api/patient/getDetail')
   * @param data 请求体数据
   */
  async post<T = any>(url: string, data: any = {}): Promise<HisResponse<T>> {
    const fullUrl = this.baseUrl + url;

    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 关键需求：将 tk 设置到 Cookie 中
          // Tauri 的 HTTP 插件允许手动设置这些通常受限的 Header
          'Cookie': `tk=${this.token}`,
          // 同时设置常见的授权 Header 以增强兼容性
          'Authorization': `Bearer ${this.token}`,
          'X-Access-Token': this.token
        },
        body: JSON.stringify(data),
        // 设置超时
        connectTimeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`HIS HTTP Error: ${response.status}`);
      }

      const result = await response.json();
      return result as HisResponse<T>;
    } catch (error) {
      console.error(`[HisService] Request failed: ${fullUrl}`, error);
      throw error;
    }
  }

  /**
   * 更新 Token
   */
  updateToken(newToken: string) {
    this.token = newToken;
  }
}

// 导出单例管理
let instance: HisService | null = null;

/**
 * 获取 HIS 服务实例
 * @param baseUrl 可选，首次初始化时必传
 * @param token 可选，首次初始化时必传
 */
export const getHisService = (baseUrl?: string, token?: string) => {
  if (baseUrl && token) {
    instance = new HisService(baseUrl, token);
  }
  return instance;
};
