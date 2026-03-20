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

/**
 * 视图类型定义
 * 对应 App.vue 中的 currentView 状态
 */
export type ViewType =
  | 'chat'
  | 'settings'
  | 'consultation-session'
  | 'consultation'
  | 'risk-alert'
  | 'voice-interaction'
  | 'voice-result'
  | 'reception-capsule'
  | 'analytics'
  | 'symptom-manage'
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

  /** 标准工作面板：420×560px（聊天、设置等） */
  WORK: { width: 420, height: 560 } as WindowSize,

  /** HIS 接诊会话：400×760px 桌面助手悬浮小窗 */
  SESSION: { width: 400, height: 760 } as WindowSize,

  /** 诊断路径：960×680px 独立 Sankey 说明窗口 */
  DIAGNOSIS_PATH: { width: 1080, height: 760 } as WindowSize,

  /** 问诊页面：1200×900px 大面板 */
  CONSULTATION: { width: 1200, height: 900 } as WindowSize,

  /** 语音/风险胶囊：360×80px 胶囊形态 */
  CAPSULE: { width: 360, height: 80 } as WindowSize,

  /** 风险详情展开：360×400px */
  CAPSULE_EXPANDED: { width: 360, height: 400 } as WindowSize,

  /** 语音结果编辑：1200×900px */
  RESULT: { width: 1200, height: 900 } as WindowSize,

  /** 症状库管理：1200×900px */
  SYMPTOM_MANAGE: { width: 1200, height: 900 } as WindowSize,
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
 * // => { width: 1200, height: 900 }
 * ```
 */
export function getWindowSizeForView(view: ViewType): WindowSize {
  switch (view) {
    case 'consultation-session':
      return WINDOW_SIZES.SESSION;

    case 'consultation':
      return WINDOW_SIZES.CONSULTATION;

    case 'voice-interaction':
    case 'reception-capsule':
      return WINDOW_SIZES.CAPSULE;

    case 'voice-result':
      return WINDOW_SIZES.RESULT;

    case 'symptom-manage':
      return WINDOW_SIZES.SYMPTOM_MANAGE;

    case 'chat':
    case 'settings':
    case 'analytics':
    case 'risk-alert':
    case 'knowledge-base':
    default:
      return WINDOW_SIZES.WORK;
  }
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
  return view === 'consultation' || view === 'voice-result' || view === 'symptom-manage';
}
