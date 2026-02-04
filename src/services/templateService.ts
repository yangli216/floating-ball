/**
 * 模板服务 - 管理中医/西医模板切换
 */
import westernTemplates from '../assets/templates.json';
import tcmTemplates from '../assets/tcm-templates.json';

export type MedicalMode = 'western' | 'tcm';

const MEDICAL_MODE_KEY = 'MEDICAL_MODE';

/**
 * 获取当前医学模式
 */
export function getMedicalMode(): MedicalMode {
  const saved = localStorage.getItem(MEDICAL_MODE_KEY);
  return (saved === 'tcm' || saved === 'western') ? saved : 'western';
}

/**
 * 设置医学模式
 */
export function setMedicalMode(mode: MedicalMode): void {
  localStorage.setItem(MEDICAL_MODE_KEY, mode);
}

/**
 * 获取当前模式的症状模板数据（统一返回症状数组）
 */
export function getTemplates(): any[] {
  const mode = getMedicalMode();
  if (mode === 'tcm') {
    // 中医模板结构: { version, symptoms: [...] }
    return (tcmTemplates as any).symptoms || [];
  }
  // 西医模板直接是数组
  return westernTemplates as any[];
}

/**
 * 获取西医模板（症状数组）
 */
export function getWesternTemplates(): any[] {
  return westernTemplates as any[];
}

/**
 * 获取中医模板（症状数组）
 */
export function getTCMTemplates(): any[] {
  return (tcmTemplates as any).symptoms || [];
}

/**
 * 判断当前是否为中医模式
 */
export function isTCMMode(): boolean {
  return getMedicalMode() === 'tcm';
}

/**
 * 获取模式显示名称
 */
export function getModeLabel(mode: MedicalMode): string {
  return mode === 'tcm' ? '中医' : '西医';
}
