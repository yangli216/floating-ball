import { getCachedBootstrap } from './regionalClient';

export interface KnowledgeBaseConfig {
  managedByServer: true;
  enabled: boolean;
}

export interface PageParams {
  pageName: 'home' | 'search' | 'detail';
  kgBaseId?: string;
  id?: string;
  kgFields?: string;
  contentId?: string;
  muluId?: string;
  catalogueId?: string;
}

export function getKnowledgeBaseConfig(): KnowledgeBaseConfig | null {
  const bootstrap = getCachedBootstrap();
  const enabled = bootstrap?.pmphai?.enabled ?? bootstrap?.knowledgeBase?.enabled ?? false;
  if (!enabled) return null;
  return {
    managedByServer: true,
    enabled: true,
  };
}

export function isKnowledgeBaseConfigured(config: KnowledgeBaseConfig | null): boolean {
  return config?.enabled === true;
}
