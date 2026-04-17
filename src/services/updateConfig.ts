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

export function getUpdateConfig(): UpdateConfig {
  const storedEnvironment = localStorage.getItem(STORAGE_KEYS.environment);
  const environment: UpdateEnvironment = storedEnvironment === 'testing' ? 'testing' : DEFAULT_UPDATE_CONFIG.environment;

  return {
    environment,
    productionUrl: normalizeUrl(localStorage.getItem(STORAGE_KEYS.productionUrl) || DEFAULT_UPDATE_CONFIG.productionUrl),
    testingUrl: normalizeUrl(localStorage.getItem(STORAGE_KEYS.testingUrl) || DEFAULT_UPDATE_CONFIG.testingUrl),
  };
}

export function saveUpdateConfig(config: UpdateConfig): void {
  localStorage.setItem(STORAGE_KEYS.environment, config.environment);
  localStorage.setItem(STORAGE_KEYS.productionUrl, normalizeUrl(config.productionUrl));
  localStorage.setItem(STORAGE_KEYS.testingUrl, normalizeUrl(config.testingUrl));
}

export function getActiveUpdateEndpoint(config: UpdateConfig = getUpdateConfig()): string {
  return config.environment === 'testing' ? config.testingUrl : config.productionUrl;
}

export function getUpdateEnvironmentLabel(environment: UpdateEnvironment): string {
  return environment === 'testing' ? '测试内网' : '正式内网';
}