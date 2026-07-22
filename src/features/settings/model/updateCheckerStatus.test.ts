import { describe, expect, it } from 'vitest';
import { resolveUpdateCheckerStatus } from './updateCheckerStatus';

describe('resolveUpdateCheckerStatus', () => {
  it('never reports latest while a force-update policy still blocks the client', () => {
    const status = resolveUpdateCheckerStatus({
      checking: false,
      error: '',
      updateAvailable: false,
      forced: true,
      policyRequired: true,
      currentVersion: '1.2.97',
      minSupportedVersion: '1.3.20',
    });

    expect(status.kind).toBe('forced-unavailable');
    expect(status.message).toContain('未获取到可用安装包');
    expect(status.message).not.toContain('最新版本');
  });

  it('reports latest only outside an active force-update gate', () => {
    expect(resolveUpdateCheckerStatus({
      checking: false,
      error: '',
      updateAvailable: false,
      forced: false,
      policyRequired: false,
    })).toEqual({ kind: 'latest', message: '当前已是最新版本' });
  });

  it('keeps a downloadable update actionable inside the gate', () => {
    expect(resolveUpdateCheckerStatus({
      checking: false,
      error: '',
      updateAvailable: true,
      forced: true,
      policyRequired: true,
    }).kind).toBe('available');
  });
});
