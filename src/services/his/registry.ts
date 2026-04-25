/**
 * HIS 适配器注册表
 *
 * 不同 HIS 厂商通过 `registerHisAdapterFactory(vendor, factory)` 注入；
 * 业务调用方通过 `getHisAdapter()` 拿到当前生效的适配器实例。
 *
 * 选择策略（从高到低）：
 * 1. 通过 `setActiveHisVendor(vendor)` 显式指定（区域化模式可在 bootstrap 阶段注入）
 * 2. 环境变量 `VITE_HIS_VENDOR`（构建期注入）
 * 3. localStorage `HIS_VENDOR`
 * 4. 默认 `'phis'`
 *
 * 与现有 `getHisService()` 的关系：
 * - `getHisService()` 仍然返回底层 `HisService` 实例（国卫 PHIS 形态），保持兼容；
 * - `getHisAdapter()` 是新的对外契约，业务方应优先使用；
 * - 默认 vendor=phis 时，`getHisAdapter()` 返回的就是包装当前 HisService 的 PhisHisAdapter。
 */

import { getHisService } from '../hisService';
import type { HisAdapter } from './HisAdapter';
import { PhisHisAdapter } from './PhisHisAdapter';
import { MockHisAdapter } from './MockHisAdapter';

/** 工厂函数：在被调用时构造 adapter；返回 null 表示当前会话未就绪（未拿到 token 等） */
export type HisAdapterFactory = () => HisAdapter | null;

const factories = new Map<string, HisAdapterFactory>();
let activeVendor: string | null = null;
let cachedAdapter: HisAdapter | null = null;
let cachedVendor: string | null = null;

/** 默认 PHIS 工厂：复用现有 HisService 单例 */
const defaultPhisFactory: HisAdapterFactory = () => {
  const service = getHisService();
  return service ? new PhisHisAdapter(service) : null;
};

factories.set('phis', defaultPhisFactory);

/** 内置 mock 厂商：本地 demo / 反向验证抽象使用，无需调用 register 手动注册 */
factories.set('mock', () => new MockHisAdapter());

export function registerHisAdapterFactory(vendor: string, factory: HisAdapterFactory): void {
  if (!vendor) throw new Error('[hisAdapterRegistry] vendor must be non-empty');
  factories.set(vendor, factory);
  // 注册同 vendor 时清掉旧缓存
  if (cachedVendor === vendor) {
    cachedAdapter = null;
    cachedVendor = null;
  }
}

export function setActiveHisVendor(vendor: string | null): void {
  activeVendor = vendor;
  cachedAdapter = null;
  cachedVendor = null;
}

function resolveActiveVendor(): string {
  if (activeVendor) return activeVendor;

  // Vite 构建期变量
  const envVendor = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_HIS_VENDOR;
  if (envVendor) return envVendor;

  // 运行时覆盖（区域化 bootstrap 可注入）
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('HIS_VENDOR');
      if (stored) return stored;
    }
  } catch {
    /* ignore */
  }

  return 'phis';
}

/**
 * 获取当前生效的 HIS 适配器；尚未注入 token / 工厂返回 null 时返回 null，
 * 调用方按"未就绪"分支处理（与原 `getHisService()` 行为一致）。
 */
export function getHisAdapter(): HisAdapter | null {
  const vendor = resolveActiveVendor();
  if (cachedAdapter && cachedVendor === vendor) {
    return cachedAdapter;
  }
  const factory = factories.get(vendor);
  if (!factory) {
    console.warn(`[hisAdapterRegistry] no factory registered for vendor "${vendor}", falling back to phis`);
    cachedAdapter = defaultPhisFactory();
    cachedVendor = 'phis';
    return cachedAdapter;
  }
  cachedAdapter = factory();
  cachedVendor = vendor;
  return cachedAdapter;
}

export function resetHisAdapter(): void {
  cachedAdapter = null;
  cachedVendor = null;
}

/** 测试/调试：列出所有已注册厂商 */
export function listRegisteredHisVendors(): string[] {
  return Array.from(factories.keys());
}
