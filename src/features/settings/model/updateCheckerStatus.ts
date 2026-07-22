export type UpdateCheckerStatusKind = 'loading' | 'error' | 'forced-unavailable' | 'latest' | 'available';

export interface ResolveUpdateCheckerStatusInput {
  checking: boolean;
  error: string;
  updateAvailable: boolean;
  forced: boolean;
  policyRequired: boolean;
  currentVersion?: string | null;
  minSupportedVersion?: string | null;
}

export interface UpdateCheckerStatus {
  kind: UpdateCheckerStatusKind;
  message: string;
}

function forcedUnavailableMessage(input: ResolveUpdateCheckerStatusInput): string {
  const currentVersion = String(input.currentVersion || '').trim();
  const minSupportedVersion = String(input.minSupportedVersion || '').trim();
  const versionContext = currentVersion && minSupportedVersion
    ? `当前版本 ${currentVersion} 仍低于最低要求 ${minSupportedVersion}。`
    : '';
  return `${versionContext}未获取到可用安装包，请检查更新源或联系管理员。`;
}

export function resolveUpdateCheckerStatus(input: ResolveUpdateCheckerStatusInput): UpdateCheckerStatus {
  if (input.checking) {
    return { kind: 'loading', message: '正在检查更新...' };
  }
  if (input.error) {
    return { kind: 'error', message: input.error };
  }
  if (input.updateAvailable) {
    return { kind: 'available', message: '' };
  }
  if (input.forced && input.policyRequired) {
    return { kind: 'forced-unavailable', message: forcedUnavailableMessage(input) };
  }
  return { kind: 'latest', message: '当前已是最新版本' };
}
