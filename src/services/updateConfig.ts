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

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function readStoredRegionalEndpoint(): { enabled: boolean; baseUrl: string } {
  const enabledText = localStorage.getItem('REGIONAL_ENABLED');
  const defaultEnabled = !['false', '0', 'off'].includes(
    String(import.meta.env.VITE_REGIONAL_ENABLED ?? 'true').trim().toLowerCase()
  );
  const enabled = enabledText === 'true' || (enabledText !== 'false' && defaultEnabled);
  const baseUrl = normalizeUrl(
    localStorage.getItem('REGIONAL_BASE_URL')
      || import.meta.env.VITE_REGIONAL_BASE_URL
      || 'http://127.0.0.1:8080'
  );
  return { enabled, baseUrl };
}

function buildRegionalReleaseEndpoint(channel: UpdateEnvironment): string {
  const regionalConfig = readStoredRegionalEndpoint();
  if (!regionalConfig.enabled || !regionalConfig.baseUrl) {
    return '';
  }
  return `${regionalConfig.baseUrl}/v1/client/releases/${channel}/latest.json`;
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
