import { describe, expect, it } from 'vitest';
import tauriConfigSource from '../../../src-tauri/tauri.conf.json?raw';

describe('Tauri content security policy', () => {
  it('enables CSP and blocks executable embedded objects', () => {
    const config = JSON.parse(tauriConfigSource) as {
      app?: { security?: { csp?: Record<string, string> | null } };
    };
    const csp = config.app?.security?.csp;

    expect(csp).toBeTruthy();
    expect(csp?.['script-src']).toBe("'self'");
    expect(csp?.['object-src']).toBe("'none'");
    expect(csp?.['base-uri']).toBe("'none'");
  });
});
