import { getVersion } from '@tauri-apps/api/app';
import {
  getActiveUpdateChannel,
  getActiveUpdatePolicyEndpoint,
  getUpdateEnvironmentLabel,
  type UpdateEnvironment,
} from './updateConfig';

export interface UpdatePolicy {
  channel: UpdateEnvironment | string;
  latestVersion?: string | null;
  forceUpdate?: boolean | null;
  minSupportedVersion?: string | null;
  latestJsonUrl?: string | null;
  notes?: string | null;
  pubDate?: string | null;
  updatedAt?: number | null;
}

export interface ForceUpdateState {
  required: boolean;
  message?: string;
  channel: UpdateEnvironment;
  channelLabel: string;
  currentVersion: string;
  minSupportedVersion?: string | null;
  latestVersion?: string | null;
  policy?: UpdatePolicy | null;
}

type ForceUpdateListener = (state: ForceUpdateState) => void;

const listeners = new Set<ForceUpdateListener>();

let currentState: ForceUpdateState = {
  required: false,
  channel: getActiveUpdateChannel(),
  channelLabel: getUpdateEnvironmentLabel(getActiveUpdateChannel()),
  currentVersion: 'unknown',
};

let versionPromise: Promise<string> | null = null;

export function subscribeForceUpdateRequired(listener: ForceUpdateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrentForceUpdateState(): ForceUpdateState {
  return currentState;
}

export async function getCurrentClientVersion(): Promise<string> {
  if (!versionPromise) {
    versionPromise = getVersion().catch(() => 'unknown');
  }
  return versionPromise;
}

export function notifyForceUpdateRequired(partial: Partial<ForceUpdateState> = {}): ForceUpdateState {
  const channel = partial.channel || getActiveUpdateChannel();
  const minSupportedVersion = partial.minSupportedVersion || currentState.minSupportedVersion || partial.latestVersion;
  const message = partial.message
    || (minSupportedVersion
      ? `当前客户端版本过低，请升级到 ${minSupportedVersion} 或更高版本后继续使用`
      : '当前客户端版本过低，请升级后继续使用');

  currentState = {
    ...currentState,
    ...partial,
    required: true,
    channel,
    channelLabel: getUpdateEnvironmentLabel(channel),
    minSupportedVersion,
    message,
  };
  listeners.forEach(listener => listener(currentState));
  return currentState;
}

export async function fetchUpdatePolicy(): Promise<UpdatePolicy | null> {
  const endpoint = getActiveUpdatePolicyEndpoint();
  if (!endpoint) {
    return null;
  }
  const response = await fetch(endpoint, {
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`更新策略获取失败（${response.status}）`);
  }
  return await response.json() as UpdatePolicy;
}

export async function checkForceUpdateRequired(): Promise<ForceUpdateState> {
  const channel = getActiveUpdateChannel();
  const currentVersion = await getCurrentClientVersion();

  try {
    const policy = await fetchUpdatePolicy();
    const minSupportedVersion = policy?.minSupportedVersion || policy?.latestVersion || null;
    // 防御：当本地版本读取失败（getVersion 抛错被降级为 'unknown'/空串）时，
    // 跳过强升判定，避免 compareVersions 返回 -1 把所有用户卡死在升级页。
    const hasUsableCurrentVersion = !!normalizeVersion(currentVersion);
    const required = Boolean(
      hasUsableCurrentVersion
        && policy?.forceUpdate
        && minSupportedVersion
        && compareVersions(currentVersion, minSupportedVersion) < 0
    );
    if (!hasUsableCurrentVersion && policy?.forceUpdate) {
      console.warn('[updatePolicy] 当前客户端版本读取失败，跳过强升判定以避免误锁定');
    }
    currentState = {
      required,
      channel,
      channelLabel: getUpdateEnvironmentLabel(channel),
      currentVersion,
      minSupportedVersion,
      latestVersion: policy?.latestVersion || null,
      policy,
      message: required
        ? `当前客户端版本 ${currentVersion} 低于最低可用版本 ${minSupportedVersion}，请先完成更新。`
        : '',
    };
  } catch (error) {
    currentState = {
      ...currentState,
      required: currentState.required,
      channel,
      channelLabel: getUpdateEnvironmentLabel(channel),
      currentVersion,
      message: error instanceof Error ? error.message : '更新策略获取失败',
    };
  }

  listeners.forEach(listener => listener(currentState));
  return currentState;
}

export function isUpdateRequiredCode(code?: string | null): boolean {
  return String(code || '').toUpperCase() === 'UPDATE-REQUIRED';
}

function normalizeVersion(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text || text === 'unknown') {
    return '';
  }
  return text.replace(/^v/i, '');
}

function compareVersions(currentVersion?: string | null, requiredVersion?: string | null): number {
  const current = normalizeVersion(currentVersion);
  const required = normalizeVersion(requiredVersion);
  if (!current && !required) return 0;
  if (!current) return -1;
  if (!required) return 1;

  const currentParts = current.split(/[._-]/);
  const requiredParts = required.split(/[._-]/);
  const length = Math.max(currentParts.length, requiredParts.length);

  for (let i = 0; i < length; i += 1) {
    const left = currentParts[i] || '0';
    const right = requiredParts[i] || '0';
    const result = compareVersionPart(left, right);
    if (result !== 0) {
      return result;
    }
  }
  return 0;
}

function compareVersionPart(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? 1 : -1;
  }
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}
