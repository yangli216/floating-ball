/**
 * 问诊配置常量定义
 *
 * 定义问诊页面相关的配置参数
 *
 * @module constants/consultationConfig
 */

/**
 * 问诊配置
 */
export const CONSULTATION_CONFIG = {
  /**
   * 最大可选症状数量
   *
   * 限制用户一次问诊可以选择的最大症状数量。
   * 建议值：3-5个症状，既能提供足够信息又不会过于复杂。
   */
  MAX_SYMPTOMS: 5,

  /**
   * 最小可选症状数量
   *
   * 用户至少需要选择的症状数量才能提交问诊。
   */
  MIN_SYMPTOMS: 1,
} as const;

/**
 * 获取最大症状选择数量
 *
 * @returns 最大可选症状数量
 */
export function getMaxSymptoms(): number {
  return CONSULTATION_CONFIG.MAX_SYMPTOMS;
}

/**
 * 获取最小症状选择数量
 *
 * @returns 最小可选症状数量
 */
export function getMinSymptoms(): number {
  return CONSULTATION_CONFIG.MIN_SYMPTOMS;
}

/**
 * 检查症状选择是否已达上限
 *
 * @param currentCount - 当前已选择的症状数量
 * @returns 是否已达上限
 */
export function isSymptomSelectionFull(currentCount: number): boolean {
  return currentCount >= CONSULTATION_CONFIG.MAX_SYMPTOMS;
}

/**
 * 检查症状选择是否满足最小要求
 *
 * @param currentCount - 当前已选择的症状数量
 * @returns 是否满足最小要求
 */
export function isSymptomSelectionValid(currentCount: number): boolean {
  return currentCount >= CONSULTATION_CONFIG.MIN_SYMPTOMS;
}
