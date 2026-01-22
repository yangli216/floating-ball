/**
 * 主题切换服务
 *
 * 提供主题切换、持久化和响应式状态管理
 */

import { ref } from 'vue'
import { themes, defaultTheme, getThemeById, type Theme } from '../styles/themes'

const THEME_STORAGE_KEY = 'medical-assistant-theme'

// 响应式当前主题
const currentTheme = ref<Theme>(defaultTheme)

/**
 * 将主题颜色应用到 CSS 变量
 */
function applyThemeToDOM(theme: Theme): void {
  const root = document.documentElement
  const { colors } = theme

  // 主色调
  root.style.setProperty('--color-primary', colors.primary)
  root.style.setProperty('--color-primary-dark', colors.primaryDark)
  root.style.setProperty('--color-primary-light', colors.primaryLight)
  root.style.setProperty('--color-primary-50', colors.primary50)
  root.style.setProperty('--color-primary-100', colors.primary100)
  root.style.setProperty('--color-primary-200', colors.primary200)

  // 辅助色
  root.style.setProperty('--color-secondary', colors.secondary)
  root.style.setProperty('--color-secondary-dark', colors.secondaryDark)
  root.style.setProperty('--color-secondary-light', colors.secondaryLight)

  // CTA
  root.style.setProperty('--color-cta', colors.cta)
  root.style.setProperty('--color-cta-dark', colors.ctaDark)
  root.style.setProperty('--color-cta-light', colors.ctaLight)
  root.style.setProperty('--color-cta-hover', colors.ctaHover)
  root.style.setProperty('--color-cta-50', colors.cta50)
  root.style.setProperty('--color-cta-100', colors.cta100)
  root.style.setProperty('--color-cta-200', colors.cta200)

  // 背景色
  root.style.setProperty('--color-background', colors.background)
  root.style.setProperty('--color-background-white', colors.backgroundWhite)
  root.style.setProperty('--color-background-gray', colors.backgroundGray)
  root.style.setProperty('--color-background-hover', colors.backgroundHover)
  root.style.setProperty('--color-background-light', colors.backgroundLight)

  // 文本颜色
  root.style.setProperty('--color-text-primary', colors.textPrimary)
  root.style.setProperty('--color-text-strong', colors.textStrong)
  root.style.setProperty('--color-text-medium', colors.textMedium)
  root.style.setProperty('--color-text-weak', colors.textWeak)
  root.style.setProperty('--color-text-muted', colors.textMuted)
  root.style.setProperty('--color-text-disabled', colors.textDisabled)

  // 边框颜色
  root.style.setProperty('--color-border-light', colors.borderLight)
  root.style.setProperty('--color-border-medium', colors.borderMedium)
  root.style.setProperty('--color-border-strong', colors.borderStrong)

  // 表面颜色
  root.style.setProperty('--surface-glass', colors.surfaceGlass)
  root.style.setProperty('--surface-glass-strong', colors.surfaceGlassStrong)
  root.style.setProperty('--surface-overlay', colors.surfaceOverlay)

  // 状态颜色 - 错误/警告/成功
  root.style.setProperty('--color-error', colors.error)
  root.style.setProperty('--color-error-bg', colors.errorBg)
  root.style.setProperty('--color-error-border', colors.errorBorder)
  root.style.setProperty('--color-warning', colors.warning)
  root.style.setProperty('--color-warning-bg', colors.warningBg)
  root.style.setProperty('--color-warning-border', colors.warningBorder)
  root.style.setProperty('--color-warning-text', colors.warningText)
  root.style.setProperty('--color-success', colors.success)
  root.style.setProperty('--color-success-bg', colors.successBg)
  root.style.setProperty('--color-success-border', colors.successBorder)

  // 设置 data-theme 属性用于组件级样式覆盖
  root.setAttribute('data-theme', theme.id)

  // 对于深色模式，添加 dark 类
  if (theme.id === 'dark-mode') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

/**
 * 从 localStorage 加载保存的主题
 */
function loadSavedTheme(): Theme {
  try {
    const savedThemeId = localStorage.getItem(THEME_STORAGE_KEY)
    if (savedThemeId) {
      const theme = getThemeById(savedThemeId)
      if (theme) {
        return theme
      }
    }
  } catch (e) {
    console.warn('Failed to load saved theme:', e)
  }
  return defaultTheme
}

/**
 * 保存主题到 localStorage
 */
function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id)
  } catch (e) {
    console.warn('Failed to save theme:', e)
  }
}

/**
 * 主题服务 Composable
 */
export function useTheme() {
  /**
   * 切换到指定主题
   */
  function setTheme(themeOrId: Theme | string): void {
    const theme = typeof themeOrId === 'string'
      ? getThemeById(themeOrId)
      : themeOrId

    if (theme) {
      currentTheme.value = theme
      applyThemeToDOM(theme)
      saveTheme(theme)
    }
  }

  /**
   * 切换到下一个主题 (循环)
   */
  function toggleNextTheme(): void {
    const currentIndex = themes.findIndex(t => t.id === currentTheme.value.id)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  /**
   * 初始化主题
   */
  function initTheme(): void {
    const savedTheme = loadSavedTheme()
    currentTheme.value = savedTheme
    applyThemeToDOM(savedTheme)
  }

  /**
   * 检查是否为深色模式
   */
  function isDarkMode(): boolean {
    return currentTheme.value.id === 'dark-mode'
  }

  return {
    currentTheme,
    themes,
    setTheme,
    toggleNextTheme,
    initTheme,
    isDarkMode,
  }
}

/**
 * 独立函数：初始化主题 (在 Vue 组件外使用)
 */
export function initializeTheme(): void {
  const savedTheme = loadSavedTheme()
  currentTheme.value = savedTheme
  applyThemeToDOM(savedTheme)
}

export { themes, defaultTheme, type Theme }
