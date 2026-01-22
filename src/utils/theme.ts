/**
 * 主题切换工具函数
 *
 * 支持的主题：
 * - default: 默认医疗蓝主题
 * - dark: 深色主题
 * - 更多自定义主题可在 global-overrides.css 中定义
 *
 * 使用方法：
 * 1. 在 main.ts 中调用 initTheme() 初始化
 * 2. 使用 setTheme('dark') 切换主题
 * 3. 使用 getTheme() 获取当前主题
 */

export type ThemeName = "default" | "dark" | string;

const THEME_STORAGE_KEY = "app-theme";
const TRANSITION_DURATION = 300; // ms

/**
 * 设置主题
 * @param theme 主题名称
 */
export function setTheme(theme: ThemeName): void {
  const html = document.documentElement;

  // 启用过渡动画
  html.setAttribute("data-theme-transition", "true");

  // 设置主题属性
  if (theme === "default") {
    html.removeAttribute("data-theme");
    html.classList.remove("dark");
  } else if (theme === "dark") {
    html.setAttribute("data-theme", "dark");
    html.classList.add("dark");
  } else {
    html.setAttribute("data-theme", theme);
    html.classList.remove("dark");
  }

  // 过渡结束后移除过渡属性
  setTimeout(() => {
    html.setAttribute("data-theme-transition", "done");
    setTimeout(() => {
      html.removeAttribute("data-theme-transition");
    }, 50);
  }, TRANSITION_DURATION);

  // 保存到本地存储
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn("Failed to save theme to localStorage:", e);
  }
}

/**
 * 获取当前主题
 * @returns 当前主题名称
 */
export function getTheme(): ThemeName {
  try {
    return (localStorage.getItem(THEME_STORAGE_KEY) as ThemeName) || "default";
  } catch (e) {
    return "default";
  }
}

/**
 * 初始化主题（应在应用启动时调用）
 * 会从 localStorage 读取保存的主题并应用
 */
export function initTheme(): void {
  const savedTheme = getTheme();
  if (savedTheme !== "default") {
    // 直接设置，不启用过渡（避免页面加载时闪烁）
    const html = document.documentElement;
    html.setAttribute("data-theme", savedTheme);
    if (savedTheme === "dark") {
      html.classList.add("dark");
    }
  }
}

/**
 * 切换深色/浅色模式
 * @returns 切换后的主题名称
 */
export function toggleDarkMode(): ThemeName {
  const currentTheme = getTheme();
  const newTheme = currentTheme === "dark" ? "default" : "dark";
  setTheme(newTheme);
  return newTheme;
}

/**
 * 检测系统主题偏好
 * @returns 系统是否偏好深色模式
 */
export function prefersDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * 监听系统主题变化
 * @param callback 主题变化时的回调函数
 * @returns 取消监听的函数
 */
export function watchSystemTheme(
  callback: (prefersDark: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => callback(e.matches);

  // 兼容旧版浏览器
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  } else {
    // @ts-ignore - 旧版 API
    mediaQuery.addListener(handler);
    // @ts-ignore
    return () => mediaQuery.removeListener(handler);
  }
}

/**
 * 根据系统偏好自动设置主题
 * @param followSystem 是否跟随系统主题
 */
export function setAutoTheme(followSystem: boolean = true): void {
  if (followSystem) {
    const prefersDark = prefersDarkMode();
    setTheme(prefersDark ? "dark" : "default");
  }
}

/**
 * 获取可用的主题列表
 * @returns 主题列表
 */
export function getAvailableThemes(): Array<{
  name: ThemeName;
  label: string;
  description: string;
}> {
  return [
    {
      name: "default",
      label: "默认主题",
      description: "医疗信任蓝 - 专业、可靠",
    },
    {
      name: "dark",
      label: "深色主题",
      description: "护眼深色模式 - 低光环境适用",
    },
    // 未来可扩展更多主题
    // { name: 'ocean', label: '海洋主题', description: '清新海蓝色' },
    // { name: 'forest', label: '森林主题', description: '自然绿色调' },
  ];
}
