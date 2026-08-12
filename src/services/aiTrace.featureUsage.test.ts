import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  trackBusinessOperation: vi.fn(),
  trackFeatureUsage: vi.fn(),
}));

vi.mock('./feedback', () => ({
  feedbackService: { getCurrentSessionId: () => 'SESSION-001' },
}));

vi.mock('./operationTracker', () => ({
  trackBusinessOperation: mocks.trackBusinessOperation,
}));

vi.mock('./featureUsageTracker', () => ({
  trackFeatureUsage: mocks.trackFeatureUsage,
}));

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('aiTrace feature usage boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.trackBusinessOperation.mockReset();
    mocks.trackFeatureUsage.mockReset();
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440020'),
    });
  });

  it('tracks one minimized feature event when the same trace is finished twice', async () => {
    const trace = await import('./aiTrace');
    const context = trace.beginAiTrace({
      channel: 'chat',
      scene: 'chat-stream',
      sourceModule: 'chat',
      operationAction: 'stream_reply',
      requestPayload: { patientName: 'PATIENT-SENTINEL' },
    });

    trace.finishAiTrace(context.traceId, {
      success: true,
      responsePayload: { content: 'CLINICAL-TEXT-SENTINEL' },
    });
    trace.finishAiTrace(context.traceId, {
      success: true,
      responsePayload: { content: 'CLINICAL-TEXT-SENTINEL' },
    });

    expect(mocks.trackFeatureUsage).toHaveBeenCalledTimes(1);
    const event = mocks.trackFeatureUsage.mock.calls[0][0];
    expect(event).toMatchObject({
      featureCode: 'chat',
      eventAction: 'stream_reply',
    });
    expect(event).not.toHaveProperty('traceId');
    expect(event).not.toHaveProperty('sessionId');
    expect(event).not.toHaveProperty('payload');
    expect(event).not.toHaveProperty('idempotencyKey');
    expect(JSON.stringify(event)).not.toContain('PATIENT-SENTINEL');
    expect(JSON.stringify(event)).not.toContain('CLINICAL-TEXT-SENTINEL');
  });
});
