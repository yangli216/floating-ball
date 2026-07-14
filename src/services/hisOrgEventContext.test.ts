import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  regionalPost: vi.fn(),
}));

vi.mock('./regionalClient', () => ({
  regionalPost: mocks.regionalPost,
}));

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

describe('HIS organization event context', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.regionalPost.mockReset();
    mocks.regionalPost.mockResolvedValue({ accepted: 1, skipped: 0 });
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'EVENT-001') });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the enqueue-time HIS organization on feature events', async () => {
    const actorContext = await import('./feedbackContext');
    const tracker = await import('./featureUsageTracker');
    actorContext.setFeedbackActor({ hisOrgId: 'HIS-ORG-A', orgName: '甲医院' });

    tracker.trackFeatureUsage({ featureCode: 'chat' });
    actorContext.setFeedbackActor({ hisOrgId: 'HIS-ORG-B', orgName: '乙医院' });
    await tracker.flushFeatureUsageEvents();
    tracker.stopFeatureUsageUploader();

    expect(mocks.regionalPost).toHaveBeenCalledWith(
      '/v1/client/feature-events/batch',
      expect.objectContaining({
        events: [expect.objectContaining({
          hisOrgId: 'HIS-ORG-A',
          hisOrgName: '甲医院',
        })],
      }),
    );
  });

  it('keeps the enqueue-time HIS organization on audit events', async () => {
    const actorContext = await import('./feedbackContext');
    const uploader = await import('./auditUploader');
    actorContext.setFeedbackActor({ hisOrgId: 'HIS-ORG-A', orgName: '甲医院' });

    uploader.enqueueAuditEvent('operation', { action: 'open' });
    actorContext.setFeedbackActor({ hisOrgId: 'HIS-ORG-B', orgName: '乙医院' });
    await uploader.flushAuditEvents();
    uploader.stopAuditUploader();

    expect(mocks.regionalPost).toHaveBeenCalledWith(
      '/v1/client/audit/events/batch',
      expect.objectContaining({
        events: [expect.objectContaining({
          hisOrgId: 'HIS-ORG-A',
          hisOrgName: '甲医院',
        })],
      }),
    );
  });
});
