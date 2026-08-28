import { describe, expect, it } from 'vitest';
import {
  getUpdateEnvironmentLabel,
  normalizeUpdateEnvironment,
  resolveUpdateChannel,
} from './updateConfig';

describe('updateConfig channel isolation', () => {
  it('maps regular builds to the regular release channels', () => {
    expect(resolveUpdateChannel('production', 'standard')).toBe('production');
    expect(resolveUpdateChannel('testing', 'standard')).toBe('testing');
  });

  it('maps Win7 builds to dedicated release channels', () => {
    expect(resolveUpdateChannel('production', 'win7')).toBe('win7-production');
    expect(resolveUpdateChannel('testing', 'win7')).toBe('win7-testing');
  });

  it('does not accept an unknown environment as testing', () => {
    expect(normalizeUpdateEnvironment('testing')).toBe('testing');
    expect(normalizeUpdateEnvironment('win7-testing')).toBe('production');
    expect(normalizeUpdateEnvironment('unknown')).toBe('production');
  });

  it('labels explicit Win7 channels without relying on the active build flavor', () => {
    expect(getUpdateEnvironmentLabel('win7-production')).toBe('Win7 正式内网');
    expect(getUpdateEnvironmentLabel('win7-testing')).toBe('Win7 测试内网');
  });
});
