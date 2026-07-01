import { describe, expect, it } from 'vitest';
import capability from '../../../src-tauri/capabilities/default.json';

describe('Tauri window capability', () => {
  it('authorizes every native window API used by the main geometry adapter', () => {
    const permissionIds = capability.permissions.map((permission) => (
      typeof permission === 'string' ? permission : permission.identifier
    ));

    expect(permissionIds).toEqual(expect.arrayContaining([
      'core:window:allow-set-resizable',
      'core:window:allow-set-size',
      'core:window:allow-set-min-size',
      'core:window:allow-set-position',
    ]));
    expect(capability.windows).toContain('main');
  });
});
