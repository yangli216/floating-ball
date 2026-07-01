import { beforeEach, describe, expect, it } from 'vitest';
import {
  ensureRegionalConnectionDefaults,
  getRegionalConnectionConfig,
  saveRegionalConnectionConfig,
} from './config';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('regional-only connection config', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  });

  it('ignores and removes the legacy disabled mode and local credentials', () => {
    localStorage.setItem('REGIONAL_ENABLED', 'false');
    localStorage.setItem('OPENAI_API_KEY', 'legacy-secret');
    localStorage.setItem('DASHSCOPE_API_KEY', 'legacy-speech-secret');
    localStorage.setItem('PMPHAI_APP_SECRET', 'legacy-knowledge-secret');
    localStorage.setItem('PMPHAI_SEARCH_MODE', 'list');

    ensureRegionalConnectionDefaults();

    expect(localStorage.getItem('REGIONAL_ENABLED')).toBeNull();
    expect(localStorage.getItem('OPENAI_API_KEY')).toBeNull();
    expect(localStorage.getItem('DASHSCOPE_API_KEY')).toBeNull();
    expect(localStorage.getItem('PMPHAI_APP_SECRET')).toBeNull();
    expect(localStorage.getItem('PMPHAI_SEARCH_MODE')).toBe('list');
    expect(getRegionalConnectionConfig()).not.toHaveProperty('enabled');
  });

  it('persists only server address and organization connection settings', () => {
    saveRegionalConnectionConfig({ baseUrl: 'http://server.example///', orgCode: 'ORG-9' });
    const config = getRegionalConnectionConfig();
    expect(config.baseUrl).toBe('http://server.example');
    expect(config.orgCode).toBe('ORG-9');
  });
});
