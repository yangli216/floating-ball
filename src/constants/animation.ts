/**
 * 动画与过渡常量定义
 *
 * 定义应用中所有动画、过渡效果的时长、缓动函数和相关配置。
 * 统一管理动画参数确保视觉体验的一致性。
 *
 * @module constants/animation
 */

/**
 * 动画时长常量（单位：毫秒）
 */
export const ANIMATION = {
  /** 主过渡动画时长（展开/收起）：300ms */
  TRANSITION_MS: 300,

  /** 窗口移动防抖延迟：500ms */
  MOVE_DEBOUNCE_MS: 500,

  /** 窗口尺寸调整防抖延迟：200ms */
  RESIZE_DEBOUNCE_MS: 200,

  /** 窗口尺寸等待超时：1000ms */
  WINDOW_SIZE_WAIT_TIMEOUT: 1000,

  /** 位置二次校验延迟（针对 macOS 边缘情况）：50ms */
  POSITION_VERIFY_DELAY: 50,

  /** 尺寸轮询间隔（requestAnimationFrame 近似值）：16ms */
  SIZE_POLL_INTERVAL: 16,
} as const;

/**
 * 变形动画原点默认值
 *
 * 定义小球中心位置作为展开/收起动画的原点。
 * 格式：CSS transform-origin 值
 */
export const MORPH_ORIGIN_DEFAULT = '80px 80px';

/**
 * 窗口尺寸容差（用于等待尺寸调整完成的判断）
 *
 * 由于浮点数精度和系统 DPI 缩放，实际尺寸可能与目标尺寸有微小差异。
 * 误差在此范围内视为已达到目标尺寸。
 */
export const WINDOW_SIZE_TOLERANCE = 10; // 像素

/**
 * CSS 缓动函数预设
 *
 * 统一的缓动曲线定义，确保动画风格一致。
 */
export const EASING = {
  /** 平滑过渡：cubic-bezier(0.4, 0, 0.2, 1) - Material Design 标准 */
  SMOOTH: 'cubic-bezier(0.4, 0, 0.2, 1)',

  /** 弹性效果：cubic-bezier(0.34, 1.56, 0.64, 1) - 悬浮球交互 */
  BOUNCE: 'cubic-bezier(0.34, 1.56, 0.64, 1)',

  /** 标准缓入缓出：ease */
  EASE: 'ease',

  /** 缓出：ease-out */
  EASE_OUT: 'ease-out',
} as const;

/**
 * 等待指定时长（Promise 封装）
 *
 * @param ms - 等待时长（毫秒）
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await wait(300);
 * console.log('300ms 后执行');
 * ```
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建防抖函数
 *
 * @param fn - 要防抖的函数
 * @param delay - 防抖延迟（毫秒）
 * @returns 防抖后的函数
 *
 * @example
 * ```typescript
 * const debouncedSave = debounce(() => saveData(), ANIMATION.MOVE_DEBOUNCE_MS);
 * window.addEventListener('resize', debouncedSave);
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
