/**
 * 医疗助手主题配置
 *
 * 基于 UI/UX Pro Max 医疗产品设计系统
 * 符合 WCAG 2.1 AA 标准
 */

export interface Theme {
  id: string
  name: string
  nameEn: string
  description: string
  icon: string
  colors: {
    // 主色调
    primary: string
    primaryDark: string
    primaryLight: string
    primary50: string
    primary100: string
    primary200: string

    // 辅助色
    secondary: string
    secondaryDark: string
    secondaryLight: string

    // CTA 按钮
    cta: string
    ctaDark: string
    ctaLight: string
    ctaHover: string
    cta50: string
    cta100: string
    cta200: string

    // 背景色
    background: string
    backgroundWhite: string
    backgroundGray: string
    backgroundHover: string
    backgroundLight: string

    // 文本颜色
    textPrimary: string
    textStrong: string
    textMedium: string
    textWeak: string
    textMuted: string
    textDisabled: string

    // 边框颜色
    borderLight: string
    borderMedium: string
    borderStrong: string

    // 表面颜色 (玻璃态)
    surfaceGlass: string
    surfaceGlassStrong: string
    surfaceOverlay: string

    // 状态颜色 - 错误/警告/成功
    error: string
    errorBg: string
    errorBorder: string
    warning: string
    warningBg: string
    warningBorder: string
    warningText: string
    success: string
    successBg: string
    successBorder: string
  }
}

/**
 * 信任蓝主题 (默认)
 * 冷静专业的蓝绿色调，传达信任和专业感
 */
export const trustBlue: Theme = {
  id: 'trust-blue',
  name: '信任蓝',
  nameEn: 'Trust Blue',
  description: '冷静专业，传达信任感',
  icon: '💎',
  colors: {
    primary: '#0891B2',
    primaryDark: '#0E7490',
    primaryLight: '#06B6D4',
    primary50: 'rgba(8, 145, 178, 0.05)',
    primary100: 'rgba(8, 145, 178, 0.1)',
    primary200: 'rgba(8, 145, 178, 0.2)',

    secondary: '#22D3EE',
    secondaryDark: '#06B6D4',
    secondaryLight: '#67E8F9',

    cta: '#0E7490',
    ctaDark: '#164E63',
    ctaLight: '#0891B2',
    ctaHover: '#164E63',
    cta50: 'rgba(14, 116, 144, 0.05)',
    cta100: 'rgba(14, 116, 144, 0.1)',
    cta200: 'rgba(14, 116, 144, 0.2)',

    background: '#ECFEFF',
    backgroundWhite: '#FFFFFF',
    backgroundGray: '#F8FAFC',
    backgroundHover: '#F1F5F9',
    backgroundLight: '#F8FAFC',

    textPrimary: '#164E63',
    textStrong: '#0F172A',
    textMedium: '#334155',
    textWeak: '#475569',
    textMuted: '#64748B',
    textDisabled: '#94A3B8',

    borderLight: '#E2E8F0',
    borderMedium: '#CBD5E1',
    borderStrong: '#94A3B8',

    surfaceGlass: 'rgba(255, 255, 255, 0.85)',
    surfaceGlassStrong: 'rgba(255, 255, 255, 0.95)',
    surfaceOverlay: 'rgba(0, 0, 0, 0.5)',

    // 状态颜色
    error: '#DC2626',
    errorBg: '#FEE2E2',
    errorBorder: '#FCA5A5',
    warning: '#F59E0B',
    warningBg: '#FEF3C7',
    warningBorder: '#FCD34D',
    warningText: '#92400E',
    success: '#10B981',
    successBg: '#D1FAE5',
    successBorder: '#6EE7B7',
  }
}

/**
 * 专业蓝主题
 * 经典医疗蓝，适合正式诊疗场景
 */
export const medicalBlue: Theme = {
  id: 'medical-blue',
  name: '专业蓝',
  nameEn: 'Medical Blue',
  description: '经典医疗蓝，专业可靠',
  icon: '🏥',
  colors: {
    primary: '#3B82F6',
    primaryDark: '#2563EB',
    primaryLight: '#60A5FA',
    primary50: 'rgba(59, 130, 246, 0.05)',
    primary100: 'rgba(59, 130, 246, 0.1)',
    primary200: 'rgba(59, 130, 246, 0.2)',

    secondary: '#60A5FA',
    secondaryDark: '#3B82F6',
    secondaryLight: '#93C5FD',

    cta: '#2563EB',
    ctaDark: '#1D4ED8',
    ctaLight: '#3B82F6',
    ctaHover: '#1D4ED8',
    cta50: 'rgba(37, 99, 235, 0.05)',
    cta100: 'rgba(37, 99, 235, 0.1)',
    cta200: 'rgba(37, 99, 235, 0.2)',

    background: '#F8FAFC',
    backgroundWhite: '#FFFFFF',
    backgroundGray: '#F1F5F9',
    backgroundHover: '#E2E8F0',
    backgroundLight: '#F8FAFC',

    textPrimary: '#1E293B',
    textStrong: '#0F172A',
    textMedium: '#334155',
    textWeak: '#475569',
    textMuted: '#64748B',
    textDisabled: '#94A3B8',

    borderLight: '#E2E8F0',
    borderMedium: '#CBD5E1',
    borderStrong: '#94A3B8',

    surfaceGlass: 'rgba(255, 255, 255, 0.88)',
    surfaceGlassStrong: 'rgba(255, 255, 255, 0.95)',
    surfaceOverlay: 'rgba(15, 23, 42, 0.5)',

    // 状态颜色
    error: '#DC2626',
    errorBg: '#FEE2E2',
    errorBorder: '#FCA5A5',
    warning: '#F59E0B',
    warningBg: '#FEF3C7',
    warningBorder: '#FCD34D',
    warningText: '#92400E',
    success: '#10B981',
    successBg: '#D1FAE5',
    successBorder: '#6EE7B7',
  }
}

/**
 * 生命绿主题
 * 清新自然的绿色，适合康复和健康管理
 */
export const lifeGreen: Theme = {
  id: 'life-green',
  name: '生命绿',
  nameEn: 'Life Green',
  description: '清新自然，充满活力',
  icon: '🌿',
  colors: {
    primary: '#10B981',
    primaryDark: '#059669',
    primaryLight: '#34D399',
    primary50: 'rgba(16, 185, 129, 0.05)',
    primary100: 'rgba(16, 185, 129, 0.1)',
    primary200: 'rgba(16, 185, 129, 0.2)',

    secondary: '#34D399',
    secondaryDark: '#10B981',
    secondaryLight: '#6EE7B7',

    cta: '#059669',
    ctaDark: '#047857',
    ctaLight: '#10B981',
    ctaHover: '#047857',
    cta50: 'rgba(5, 150, 105, 0.05)',
    cta100: 'rgba(5, 150, 105, 0.1)',
    cta200: 'rgba(5, 150, 105, 0.2)',

    background: '#F0FDF4',
    backgroundWhite: '#FFFFFF',
    backgroundGray: '#F8FAFC',
    backgroundHover: '#ECFDF5',
    backgroundLight: '#F0FDF4',

    textPrimary: '#14532D',
    textStrong: '#052E16',
    textMedium: '#166534',
    textWeak: '#15803D',
    textMuted: '#22C55E',
    textDisabled: '#86EFAC',

    borderLight: '#D1FAE5',
    borderMedium: '#A7F3D0',
    borderStrong: '#6EE7B7',

    surfaceGlass: 'rgba(255, 255, 255, 0.88)',
    surfaceGlassStrong: 'rgba(255, 255, 255, 0.95)',
    surfaceOverlay: 'rgba(5, 46, 22, 0.5)',

    // 状态颜色
    error: '#DC2626',
    errorBg: '#FEE2E2',
    errorBorder: '#FCA5A5',
    warning: '#F59E0B',
    warningBg: '#FEF3C7',
    warningBorder: '#FCD34D',
    warningText: '#92400E',
    success: '#10B981',
    successBg: '#D1FAE5',
    successBorder: '#6EE7B7',
  }
}

/**
 * 温暖橙主题
 * 温暖关怀风格，适合儿科和老年医学
 */
export const warmOrange: Theme = {
  id: 'warm-orange',
  name: '温暖橙',
  nameEn: 'Warm Orange',
  description: '温暖关怀，亲切友好',
  icon: '🌅',
  colors: {
    primary: '#F97316',
    primaryDark: '#EA580C',
    primaryLight: '#FB923C',
    primary50: 'rgba(249, 115, 22, 0.05)',
    primary100: 'rgba(249, 115, 22, 0.1)',
    primary200: 'rgba(249, 115, 22, 0.2)',

    secondary: '#FBBF24',
    secondaryDark: '#F59E0B',
    secondaryLight: '#FCD34D',

    cta: '#EA580C',
    ctaDark: '#C2410C',
    ctaLight: '#F97316',
    ctaHover: '#C2410C',
    cta50: 'rgba(234, 88, 12, 0.05)',
    cta100: 'rgba(234, 88, 12, 0.1)',
    cta200: 'rgba(234, 88, 12, 0.2)',

    background: '#FFFBEB',
    backgroundWhite: '#FFFFFF',
    backgroundGray: '#FEF3C7',
    backgroundHover: '#FDE68A',
    backgroundLight: '#FFFBEB',

    textPrimary: '#78350F',
    textStrong: '#451A03',
    textMedium: '#92400E',
    textWeak: '#B45309',
    textMuted: '#D97706',
    textDisabled: '#FCD34D',

    borderLight: '#FEF3C7',
    borderMedium: '#FDE68A',
    borderStrong: '#FCD34D',

    surfaceGlass: 'rgba(255, 255, 255, 0.90)',
    surfaceGlassStrong: 'rgba(255, 255, 255, 0.95)',
    surfaceOverlay: 'rgba(69, 26, 3, 0.5)',

    // 状态颜色
    error: '#DC2626',
    errorBg: '#FEE2E2',
    errorBorder: '#FCA5A5',
    warning: '#F59E0B',
    warningBg: '#FEF3C7',
    warningBorder: '#FCD34D',
    warningText: '#92400E',
    success: '#10B981',
    successBg: '#D1FAE5',
    successBorder: '#6EE7B7',
  }
}

/**
 * 深色模式主题
 * 护眼深色，适合夜间使用
 */
export const darkMode: Theme = {
  id: 'dark-mode',
  name: '深色护眼',
  nameEn: 'Dark Mode',
  description: '护眼深色，夜间使用',
  icon: '🌙',
  colors: {
    primary: '#38BDF8',
    primaryDark: '#0EA5E9',
    primaryLight: '#7DD3FC',
    primary50: 'rgba(56, 189, 248, 0.08)',
    primary100: 'rgba(56, 189, 248, 0.15)',
    primary200: 'rgba(56, 189, 248, 0.25)',

    secondary: '#22D3EE',
    secondaryDark: '#06B6D4',
    secondaryLight: '#67E8F9',

    cta: '#10B981',
    ctaDark: '#059669',
    ctaLight: '#34D399',
    ctaHover: '#059669',
    cta50: 'rgba(16, 185, 129, 0.08)',
    cta100: 'rgba(16, 185, 129, 0.15)',
    cta200: 'rgba(16, 185, 129, 0.25)',

    background: '#0F172A',
    backgroundWhite: '#1E293B',
    backgroundGray: '#334155',
    backgroundHover: '#475569',
    backgroundLight: '#1E293B',

    textPrimary: '#F1F5F9',
    textStrong: '#FFFFFF',
    textMedium: '#E2E8F0',
    textWeak: '#CBD5E1',
    textMuted: '#94A3B8',
    textDisabled: '#64748B',

    borderLight: '#334155',
    borderMedium: '#475569',
    borderStrong: '#64748B',

    surfaceGlass: 'rgba(30, 41, 59, 0.90)',
    surfaceGlassStrong: 'rgba(30, 41, 59, 0.95)',
    surfaceOverlay: 'rgba(0, 0, 0, 0.7)',

    // 状态颜色 - 深色模式下使用更亮的颜色
    error: '#F87171',
    errorBg: 'rgba(248, 113, 113, 0.2)',
    errorBorder: '#EF4444',
    warning: '#FBBF24',
    warningBg: 'rgba(251, 191, 36, 0.2)',
    warningBorder: '#F59E0B',
    warningText: '#FCD34D',
    success: '#34D399',
    successBg: 'rgba(52, 211, 153, 0.2)',
    successBorder: '#10B981',
  }
}

/**
 * 所有可用主题
 */
export const themes: Theme[] = [
  trustBlue,
  medicalBlue,
  lifeGreen,
  warmOrange,
  darkMode,
]

/**
 * 根据 ID 获取主题
 */
export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.id === id)
}

/**
 * 默认主题
 */
export const defaultTheme = trustBlue
