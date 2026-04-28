export type UpdateEnvironment = 'production' | 'testing';

export interface UpdateConfig {
  environment: UpdateEnvironment;
  productionUrl: string;
  testingUrl: string;
}

export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  environment: (import.meta.env.VITE_UPDATE_ENVIRONMENT as UpdateEnvironment) || 'production',
  productionUrl: import.meta.env.VITE_INTRANET_UPDATE_PRODUCTION_URL || '',
  testingUrl: import.meta.env.VITE_INTRANET_UPDATE_TESTING_URL || '',
};

const STORAGE_KEYS = {
  environment: 'UPDATE_ENVIRONMENT',
  productionUrl: 'INTRANET_UPDATE_PRODUCTION_URL',
  testingUrl: 'INTRANET_UPDATE_TESTING_URL',
} as const;

const REGIONAL_STORAGE_KEYS = {
  enabled: 'REGIONAL_ENABLED',
  baseUrl: 'REGIONAL_BASE_URL',
} as const;

const DEFAULT_REGIONAL_BASE_URL = (
  import.meta.env.VITE_REGIONAL_BASE_URL
  || 'http://127.0.0.1:8080'
).trim().replace(/\/+$/, '');

const DEFAULT_REGIONAL_ENABLED = !['false', '0', 'off'].includes(
  String(import.meta.env.VITE_REGIONAL_ENABLED ?? 'true').trim().toLowerCase()
);

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function readStorageValue(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw == null) {
    return null;
  }
  const text = raw.trim();
  return text ? text : null;
}

function isRegionalModeEnabledForUpdate(): boolean {
  const stored = localStorage.getItem(REGIONAL_STORAGE_KEYS.enabled);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return DEFAULT_REGIONAL_ENABLED;
}

function buildRegionalReleaseEndpoint(channel: UpdateEnvironment): string {
  const baseUrl = normalizeUrl(readStorageValue(REGIONAL_STORAGE_KEYS.baseUrl) || DEFAULT_REGIONAL_BASE_URL);
  if (!isRegionalModeEnabledForUpdate() || !baseUrl) {
    return '';
  }
  return `${baseUrl}/v1/client/releases/${channel}/latest.json`;
}

export function getUpdateConfig(): UpdateConfig {
  const storedEnvironment = localStorage.getItem(STORAGE_KEYS.environment);
  const environment: UpdateEnvironment = storedEnvironment === 'testing' ? 'testing' : DEFAULT_UPDATE_CONFIG.environment;
  const regionalProductionUrl = buildRegionalReleaseEndpoint('production');
  const regionalTestingUrl = buildRegionalReleaseEndpoint('testing');

  return {
    environment,
    productionUrl: normalizeUrl(localStorage.getItem(STORAGE_KEYS.productionUrl) || DEFAULT_UPDATE_CONFIG.productionUrl || regionalProductionUrl),
    testingUrl: normalizeUrl(localStorage.getItem(STORAGE_KEYS.testingUrl) || DEFAULT_UPDATE_CONFIG.testingUrl || regionalTestingUrl),
  };
}

export function resetUpdateConfigToRegionalDefaults(): UpdateConfig {
  const config: UpdateConfig = {
    environment: getUpdateConfig().environment,
    productionUrl: buildRegionalReleaseEndpoint('production'),
    testingUrl: buildRegionalReleaseEndpoint('testing'),
  };
  saveUpdateConfig(config);
  return config;
}

export function saveUpdateConfig(config: UpdateConfig): void {
  localStorage.setItem(STORAGE_KEYS.environment, config.environment);
  localStorage.setItem(STORAGE_KEYS.productionUrl, normalizeUrl(config.productionUrl));
  localStorage.setItem(STORAGE_KEYS.testingUrl, normalizeUrl(config.testingUrl));
}

export function getActiveUpdateEndpoint(config: UpdateConfig = getUpdateConfig()): string {
  return config.environment === 'testing' ? config.testingUrl : config.productionUrl;
}

export function getActiveUpdateChannel(config: UpdateConfig = getUpdateConfig()): UpdateEnvironment {
  return config.environment;
}

export function getActiveUpdatePolicyEndpoint(config: UpdateConfig = getUpdateConfig()): string {
  const endpoint = getActiveUpdateEndpoint(config);
  if (!endpoint) {
    return '';
  }
  if (/\/latest\.json(?:\?.*)?$/.test(endpoint)) {
    return endpoint.replace(/\/latest\.json(\?.*)?$/, '/policy.json$1');
  }
  return `${endpoint.replace(/\/+$/, '')}/policy.json`;
}

export function getUpdateEnvironmentLabel(environment: UpdateEnvironment): string {
  return environment === 'testing' ? '测试内网' : '正式内网';
}
