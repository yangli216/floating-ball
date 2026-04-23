import {
  type BootstrapConfig,
  initializeRegionalClient,
  shutdownRegionalClient,
  isRegionalMode,
} from './regionalClient';
import { startAuditUploader, stopAuditUploader } from './auditUploader';
import { syncRemotePrompts } from './promptOverride';
import { syncRemoteTemplates } from './templateService';
import { medicalDataService } from './medicalData';
import { feedbackService } from './feedback';

async function syncRegionalRuntimeData(): Promise<void> {
  await Promise.allSettled([
    syncRemotePrompts(),
    syncRemoteTemplates(),
    medicalDataService.syncRemoteData(),
  ]);
}

export async function initializeRegionalRuntime(options?: {
  allowCachedFallback?: boolean;
}): Promise<BootstrapConfig | null> {
  if (!isRegionalMode()) return null;

  const config = await initializeRegionalClient({
    allowCachedFallback: options?.allowCachedFallback,
  });
  if (!config) {
    return null;
  }

  startAuditUploader();
  await syncRegionalRuntimeData();
  await feedbackService.logOperation({
    operationType: 'api_call',
    operationName: 'regional_runtime_initialized',
    details: {
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      promptVersion: config.promptVersion,
      templateVersion: config.templateVersion,
      dataPackageVersion: config.dataPackageVersion,
    },
    success: true,
  });
  return config;
}

export async function reinitializeRegionalRuntime(): Promise<BootstrapConfig | null> {
  shutdownRegionalRuntime();
  return initializeRegionalRuntime({ allowCachedFallback: false });
}

export function shutdownRegionalRuntime(): void {
  stopAuditUploader();
  shutdownRegionalClient();
}
