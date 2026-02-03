/**
 * Prompt 泄露防护拦截器
 *
 * 两层防护机制：
 * 1. 输入拦截：检测用户输入中是否包含 prompt 注入/提取攻击
 * 2. 输出拦截：检测 LLM 输出中是否包含系统 prompt 内容片段
 */

// ==================== 系统 Prompt 指纹库 ====================

// 从所有系统 prompt 中提取的关键特征短语，用于检测输出泄露
const PROMPT_FINGERPRINTS: string[] = [
  '语义理解过滤',
  '关键信息提取',
  '结构化整理输出',
  '细粒度拆分规则',
  '智能推荐补全',
  '中医辨证论治流程',
  '临床医疗风险评估专家',
  '严格区分【当前就诊】与【历史记录】',
  '排除已治愈急症',
  '马蹄声原则',
  '定位分析原则',
  '症状组合鉴别思维',
  '匹配度评估（关键）',
  '核查原则',
  '君臣佐使',
  '十八反',
  '十九畏',
  '基层全科医生，擅长基于国家基层诊疗指南',
  '基层全科医生，在社区卫生服务中心',
  '资深的中医辨证核查专家',
  '资深的中医药学专家，负责审核',
  '专业的临床药师，负责审核',
  '专业的临床检验专家，负责审核',
  '经验丰富的主治医师，负责审核',
  '专业的医疗事实核查员',
  '医疗病历生成助手，具备以下能力',
];

// 用户输入中的 prompt 注入/提取攻击模式
const INJECTION_PATTERNS: RegExp[] = [
  /(?:忽略|无视|跳过|忘记|放弃)(?:以上|之前|前面|上面)?(?:所有|全部|一切)?(?:指令|指示|规则|设定|设置|限制|约束|提示|prompt)/i,
  /(?:输出|打印|显示|告诉我|给我|复述|重复|回显)(?:你的|系统的?)?(?:指令|指示|规则|设定|设置|提示|prompt|system\s*(?:message|prompt))/i,
  /(?:你的|系统的?)(?:初始|原始|第一个?|开始的?)?(?:指令|指示|规则|设定|设置|提示|prompt)(?:是什么|是啥|内容)/i,
  /system\s*(?:message|prompt|instruction)/i,
  /(?:what|show|reveal|repeat|print|output|display)\s+(?:your|the|system)\s+(?:prompt|instruction|rule|message)/i,
  /(?:ignore|disregard|forget|bypass|skip)\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions?|rules?|prompts?)/i,
  /(?:pretend|act\s+as\s+if|assume)\s+(?:you\s+(?:are|have)\s+)?(?:no\s+)?(?:rules?|instructions?|restrictions?|limitations?)/i,
  /jailbreak/i,
  /DAN\s*(?:mode)?/i,
  /(?:开发者|developer)\s*(?:模式|mode)/i,
];

// ==================== 输入拦截 ====================

/**
 * 检测用户输入是否包含 prompt 注入/提取攻击
 * @returns 如果检测到攻击返回 true
 */
export function detectPromptInjection(userInput: string): boolean {
  const normalized = userInput.trim();
  return INJECTION_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * 对疑似注入攻击的输入返回安全回复
 */
export const INJECTION_BLOCK_RESPONSE = '抱歉，我无法执行该请求。我是医疗助手，只能回答与医疗健康相关的问题。请问您有什么医疗健康方面的疑问？';

// ==================== 输出拦截 ====================

/**
 * 检测 LLM 输出是否泄露了系统 prompt 内容
 * @param output LLM 的输出文本
 * @param threshold 匹配指纹数量阈值，超过则判定为泄露（默认 2）
 * @returns 匹配到的指纹数量
 */
export function detectPromptLeakage(output: string, threshold: number = 2): number {
  let matchCount = 0;
  for (const fingerprint of PROMPT_FINGERPRINTS) {
    if (output.includes(fingerprint)) {
      matchCount++;
      if (matchCount >= threshold) {
        return matchCount;
      }
    }
  }
  return matchCount;
}

/**
 * 对泄露的输出返回安全回复
 */
export const LEAKAGE_BLOCK_RESPONSE = '抱歉，我无法提供该信息。请问您有什么医疗健康方面的问题需要咨询？';

// ==================== 流式输出拦截器 ====================

/**
 * 创建流式输出的 prompt 泄露检测缓冲器
 * 在流式输出中累积文本并实时检测泄露
 */
export function createStreamGuard(options?: { threshold?: number }) {
  const threshold = options?.threshold ?? 2;
  let buffer = '';
  let blocked = false;

  return {
    /**
     * 向缓冲区添加新的 chunk 并检测
     * @returns true 表示安全，false 表示检测到泄露
     */
    check(chunk: string): boolean {
      if (blocked) return false;
      buffer += chunk;
      // 每积累 100 字符检测一次，减少性能开销
      if (buffer.length % 100 < chunk.length || buffer.length < 100) {
        const leakCount = detectPromptLeakage(buffer, threshold);
        if (leakCount >= threshold) {
          blocked = true;
          return false;
        }
      }
      return true;
    },

    /** 是否已被拦截 */
    isBlocked(): boolean {
      return blocked;
    },

    /** 重置状态 */
    reset() {
      buffer = '';
      blocked = false;
    }
  };
}
