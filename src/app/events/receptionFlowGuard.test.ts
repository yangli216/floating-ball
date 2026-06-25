import { describe, expect, it } from 'vitest';
import { createReceptionFlowGuard } from './receptionFlowGuard';

describe('createReceptionFlowGuard', () => {
  it('invalidates all older tokens when a new flow begins', () => {
    const guard = createReceptionFlowGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    expect(guard.current()).toBe(second);
  });
});
