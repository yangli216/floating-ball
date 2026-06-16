/**
 * 窗口尺寸常量定义
 *
 * 定义应用中所有视图的标准窗口尺寸（逻辑像素）。
 * 这些值用于窗口展开/收起动画和尺寸调整。
 *
 * @module constants/windowSizes
 */

/**
 * 窗口尺寸配置类型
 */
export interface WindowSize {
  /** 窗口宽度（逻辑像素） */
  width: number;
  /** 窗口高度（逻辑像素） */
  height: number;
}

export type VoiceInteractionWindowStage = 'recording' | 'processing' | 'stopped' | 'expanded';

export interface WindowSizeOptions {
  expanded?: boolean;
  riskCount?: number;
  voiceStage?: VoiceInteractionWindowStage;
}

/**
 * 视图类型定义
 * 对应 App.vue 中的 currentView 状态
 */
export type ViewType =
  | 'chat'
  | 'settings'
  | 'consultation'
  | 'risk-alert'
  | 'voice-interaction'
  | 'voice-consultation'
  | 'treatment-plan'
  | 'inpatient-emr'
  | 'differential-diagnosis'
  | 'reception-capsule'
  | 'analytics'
  | 'his-log'
  | 'medical-cache'
  | 'knowledge-base';

/**
 * 窗口尺寸配置集合
 *
 * 包含所有视图模式和工作模式的标准尺寸定义。
 * 物理像素 = 逻辑像素 × scaleFactor（由系统 DPI 决定）
 */
export const WINDOW_SIZES = {
  /** 悬浮球模式：160×160px 透明窗口 */
  BALL: { width: 160, height: 160 } as WindowSize,

  /** 标准工作面板：378×449px（聊天、设置等） */
  WORK: { width: 378, height: 449 } as WindowSize,

  /** 聊天窗口：420×620px，窄高比例避免欢迎区和输入区互相挤压 */
  CHAT: { width: 420, height: 620 } as WindowSize,

  /** 诊断路径：972×608px 独立 Sankey 说明窗口 */
  DIAGNOSIS_PATH: { width: 972, height: 608 } as WindowSize,

  /** 问诊页面：1120×760px 双栏工作台，给结果编辑和底部操作保留初始空间 */
  CONSULTATION: { width: 1120, height: 760 } as WindowSize,

  /** 语音胶囊录音态：360×80px 千千静听歌词风格紧凑条 */
  CAPSULE: { width: 360, height: 80 } as WindowSize,

  /** 语音胶囊处理中：360×96px */
  CAPSULE_PROCESSING: { width: 360, height: 96 } as WindowSize,

  /** 语音胶囊停录预览：360×140px */
  CAPSULE_STOPPED: { width: 360, height: 140 } as WindowSize,

  /** 语音胶囊展开编辑：360×248px */
  CAPSULE_EXPANDED: { width: 360, height: 248 } as WindowSize,

  /** 风险评估卡片：340×92px，仅展示头部（头像+姓名+状态徽章） */
  RISK_CARD: { width: 280, height: 92 } as WindowSize,

  /** 风险评估卡片展开：340×360px */
  RISK_CARD_EXPANDED: { width: 280, height: 360 } as WindowSize,

  /** 语音问诊页面：1080×720px */
  VOICE_CONSULTATION: { width: 1080, height: 720 } as WindowSize,

  /** 独立诊疗方案推荐：1080×720px */
  TREATMENT_PLAN: { width: 1080, height: 720 } as WindowSize,

  /** 住院病历辅助生成：1120×760px */
  INPATIENT_EMR: { width: 1120, height: 760 } as WindowSize,

  /** 独立鉴别诊断小窗：仅承载鉴别排查确认弹窗 */
  DIFFERENTIAL_DIAGNOSIS: { width: 360, height: 640 } as WindowSize,

  /** HIS 联调日志：980×640px */
  HIS_LOG: { width: 980, height: 640 } as WindowSize,

  /** 基础数据缓存管理：980×640px */
  MEDICAL_CACHE: { width: 980, height: 640 } as WindowSize,
} as const;

/**
 * 根据视图类型获取对应的窗口尺寸
 *
 * @param view - 视图类型
 * @returns 窗口尺寸配置 { width, height }
 *
 * @example
 * ```typescript
 * const size = getWindowSizeForView('consultation');
 * // => { width: 1120, height: 760 }
 * ```
 */
export function getReceptionCapsuleSize(options?: Pick<WindowSizeOptions, 'expanded' | 'riskCount'>): WindowSize {
  const expanded = options?.expanded ?? false;
  if (!expanded) {
    return WINDOW_SIZES.RISK_CARD;
  }

  const riskCount = Math.max(options?.riskCount ?? 0, 1);
  const visibleRiskRows = Math.min(riskCount, 6);
  const estimatedHeight = 108 + visibleRiskRows * 52;

  return {
    width: WINDOW_SIZES.RISK_CARD.width,
    height: Math.min(
      Math.max(estimatedHeight, WINDOW_SIZES.RISK_CARD_EXPANDED.height),
      520,
    ),
  };
}

export function getVoiceInteractionWindowSize(stage: VoiceInteractionWindowStage = 'recording'): WindowSize {
  switch (stage) {
    case 'processing':
      return WINDOW_SIZES.CAPSULE_PROCESSING;
    case 'stopped':
      return WINDOW_SIZES.CAPSULE_STOPPED;
    case 'expanded':
      return WINDOW_SIZES.CAPSULE_EXPANDED;
    case 'recording':
    default:
      return WINDOW_SIZES.CAPSULE;
  }
}

export function getWindowSizeForView(view: ViewType, options?: WindowSizeOptions): WindowSize {
  switch (view) {
    case 'consultation':
      return WINDOW_SIZES.CONSULTATION;

    case 'voice-interaction':
      return getVoiceInteractionWindowSize(options?.voiceStage);

    case 'reception-capsule':
      return getReceptionCapsuleSize(options);

    case 'voice-consultation':
      return WINDOW_SIZES.VOICE_CONSULTATION;

    case 'treatment-plan':
      return WINDOW_SIZES.TREATMENT_PLAN;

    case 'inpatient-emr':
      return WINDOW_SIZES.INPATIENT_EMR;

    case 'differential-diagnosis':
      return WINDOW_SIZES.DIFFERENTIAL_DIAGNOSIS;

    case 'his-log':
      return WINDOW_SIZES.HIS_LOG;

    case 'medical-cache':
      return WINDOW_SIZES.MEDICAL_CACHE;

    case 'chat':
      return WINDOW_SIZES.CHAT;
      
    case 'settings':
    case 'analytics':
    case 'risk-alert':
    case 'knowledge-base':
    default:
      return WINDOW_SIZES.WORK;
  }
}

export function supportsPersistentWindowSize(view: ViewType): boolean {
  return view === 'chat'
    || view === 'settings'
    || view === 'consultation'
    || view === 'voice-consultation'
    || view === 'treatment-plan'
    || view === 'inpatient-emr'
    || view === 'differential-diagnosis'
    || view === 'analytics'
    || view === 'his-log'
    || view === 'medical-cache'
    || view === 'knowledge-base';
}

/**
 * 判断视图是否为胶囊形态
 *
 * @param view - 视图类型
 * @returns 是否为胶囊形态
 */
export function isCapsuleView(view: ViewType): boolean {
  return view === 'voice-interaction' || view === 'reception-capsule';
}

/**
 * 判断视图是否为大面板（需要更多屏幕空间）
 *
 * @param view - 视图类型
 * @returns 是否为大面板
 */
export function isLargePanelView(view: ViewType): boolean {
  return view === 'consultation'
    || view === 'his-log'
    || view === 'medical-cache'
    || view === 'voice-consultation'
    || view === 'treatment-plan'
    || view === 'inpatient-emr';
}
