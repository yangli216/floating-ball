import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  regionalPost: vi.fn(),
}));

vi.mock('./regionalClient', () => ({
  regionalPost: mocks.regionalPost,
}));

class MemoryStorage {
  private readonly values = new Map<string, string>();
  private readonly failingKeys = new Set<string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failingKeys.has(key)) {
      throw new Error(`write failed for ${key}`);
    }
    this.values.set(key, value);
  }

  failWritesFor(key: string): void {
    this.failingKeys.add(key);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const QUEUE_KEY = 'REGIONAL_FEATURE_USAGE_QUEUE';
const REJECTION_QUEUE_KEY = 'REGIONAL_FEATURE_USAGE_REJECTION_QUEUE';

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

describe('featureUsageTracker batch settlement and payload privacy', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.resetModules();
    mocks.regionalPost.mockReset();
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('settles accepted and skipped events and quarantines rejected events with a diagnostic reason', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce(uuid(1))
      .mockReturnValueOnce(uuid(2))
      .mockReturnValueOnce(uuid(3));
    vi.stubGlobal('crypto', { randomUUID });
    mocks.regionalPost.mockResolvedValue({
      accepted: 1,
      skipped: 1,
      rejected: 1,
      rejections: [{
        index: 2,
        eventId: uuid(3),
        featureCode: 'knowledge_usage',
        reason: 'featureCode 不支持',
      }],
    });

    const tracker = await import('./featureUsageTracker');
    tracker.trackFeatureUsage({ featureCode: 'chat' });
    tracker.trackFeatureUsage({ featureCode: 'chat' });
    tracker.trackFeatureUsage({ featureCode: 'knowledge_usage' });

    await expect(tracker.flushFeatureUsageEvents()).resolves.toBe(2);
    tracker.stopFeatureUsageUploader();

    expect(tracker.getFeatureUsageQueueSize()).toBe(0);
    expect(tracker.getFeatureUsageRejectionDiagnostics()).toEqual([
      expect.objectContaining({
        eventId: uuid(3),
        featureCode: 'knowledge_usage',
        reason: 'featureCode 不支持',
      }),
    ]);
    expect(tracker.getFeatureUsageRejectionDiagnostics()[0]).not.toHaveProperty('payload');
    expect(tracker.getFeatureUsageRejectionDiagnostics()[0]).not.toHaveProperty('doctorName');
    expect(tracker.getFeatureUsageRejectionDiagnostics()[0]).not.toHaveProperty('consultationId');
    expect(tracker.getFeatureUsageRejectionDiagnostics()[0]).not.toHaveProperty('idempotencyKey');
  });

  it('keeps the entire batch when the settlement response is malformed', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce(uuid(4))
      .mockReturnValueOnce(uuid(5));
    vi.stubGlobal('crypto', { randomUUID });
    mocks.regionalPost.mockResolvedValue({
      accepted: 1,
      skipped: 0,
      rejected: 1,
      rejections: [{
        index: 1,
        eventId: 'WRONG-EVENT-ID',
        featureCode: 'knowledge_usage',
        reason: 'bad event',
      }],
    });

    const tracker = await import('./featureUsageTracker');
    tracker.trackFeatureUsage({ featureCode: 'chat' });
    tracker.trackFeatureUsage({ featureCode: 'knowledge_usage' });

    await expect(tracker.flushFeatureUsageEvents()).resolves.toBe(0);
    tracker.stopFeatureUsageUploader();

    expect(tracker.getFeatureUsageQueueSize()).toBe(2);
    expect(tracker.getFeatureUsageRejectionDiagnostics()).toEqual([]);
  });

  it('keeps rejected events in the live queue when diagnostic quarantine persistence fails', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => uuid(6)) });
    mocks.regionalPost.mockResolvedValue({
      accepted: 0,
      skipped: 0,
      rejected: 1,
      rejections: [{
        index: 0,
        eventId: uuid(6),
        featureCode: 'chat',
        reason: 'invalid event',
      }],
    });

    const tracker = await import('./featureUsageTracker');
    tracker.trackFeatureUsage({ featureCode: 'chat' });
    storage.failWritesFor(REJECTION_QUEUE_KEY);

    await expect(tracker.flushFeatureUsageEvents()).resolves.toBe(0);
    tracker.stopFeatureUsageUploader();

    expect(tracker.getFeatureUsageQueueSize()).toBe(1);
    expect(tracker.getFeatureUsageRejectionDiagnostics()).toEqual([]);
  });

  it('projects legacy rejection diagnostics to the bounded minimal safe schema', async () => {
    storage.setItem(REJECTION_QUEUE_KEY, JSON.stringify([{
      eventId: uuid(7),
      featureCode: 'chat',
      index: 0,
      reason: 'PATIENT-SENTINEL-IN-UNTRUSTED-REASON',
      rejectedAt: 123,
      idempotencyKey: 'chat:secret-query',
      doctorName: '张医生',
      payload: { patientName: '患者甲' },
    }, {
      eventId: 'PATIENT-EVENT-SENTINEL',
      featureCode: 'chat',
      index: 1,
      reason: 'featureCode 不支持',
      rejectedAt: 124,
    }]));

    const tracker = await import('./featureUsageTracker');
    const diagnostics = tracker.getFeatureUsageRejectionDiagnostics();

    expect(diagnostics).toEqual([{
      eventId: uuid(7),
      featureCode: 'chat',
      index: 0,
      reason: '事件被服务端拒绝',
      rejectedAt: 123,
    }]);
    expect(storage.getItem(REJECTION_QUEUE_KEY)).not.toContain('secret-query');
    expect(storage.getItem(REJECTION_QUEUE_KEY)).not.toContain('张医生');
    expect(storage.getItem(REJECTION_QUEUE_KEY)).not.toContain('患者甲');
    expect(storage.getItem(REJECTION_QUEUE_KEY)).not.toContain('PATIENT-SENTINEL');
    expect(storage.getItem(REJECTION_QUEUE_KEY)).not.toContain('PATIENT-EVENT-SENTINEL');
  });

  it('eagerly sanitizes both persisted queues without starting the uploader', async () => {
    storage.setItem(QUEUE_KEY, JSON.stringify([{
      eventId: 'PATIENT-EVENT-SENTINEL',
      featureCode: 'chat',
      idempotencyKey: 'chat:PATIENT-SENTINEL',
      traceId: 'TRACE-SENTINEL',
      sessionId: 'SESSION-SENTINEL',
      consultationId: 'VISIT-SENTINEL',
      payload: { patientName: '患者甲' },
      timestamp: 1,
    }]));
    storage.setItem(REJECTION_QUEUE_KEY, JSON.stringify([{
      eventId: uuid(70),
      featureCode: 'chat',
      index: 0,
      reason: '患者甲的原始拒绝原因',
      rejectedAt: 123,
      idempotencyKey: 'chat:PATIENT-SENTINEL',
      payload: { visitId: 'VISIT-SENTINEL' },
    }]));
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => uuid(71)) });

    const tracker = await import('./featureUsageTracker');
    tracker.sanitizeFeatureUsageStorage();

    const persisted = `${storage.getItem(QUEUE_KEY)}${storage.getItem(REJECTION_QUEUE_KEY)}`;
    expect(persisted).not.toContain('PATIENT-SENTINEL');
    expect(persisted).not.toContain('TRACE-SENTINEL');
    expect(persisted).not.toContain('SESSION-SENTINEL');
    expect(persisted).not.toContain('VISIT-SENTINEL');
    expect(persisted).not.toContain('患者甲');
    expect(JSON.parse(storage.getItem(REJECTION_QUEUE_KEY) || '[]')).toEqual([{
      eventId: uuid(70),
      featureCode: 'chat',
      index: 0,
      reason: '事件被服务端拒绝',
      rejectedAt: 123,
    }]);
  });

  it('removes patient and consultation identifiers from legacy, persisted, and uploaded payloads', async () => {
    storage.setItem(QUEUE_KEY, JSON.stringify([{
      eventId: 'PATIENT-EVENT-SENTINEL',
      featureCode: 'knowledge_usage',
      eventAction: 'knowledge_search',
      idempotencyKey: 'knowledge:knowledge_search:1:1:张三的糖尿病用药',
      consultationId: 'VISIT-LEGACY',
      patientId: 'PATIENT-TOP-LEVEL',
      patientName: '患者顶层',
      query: '张三的顶层原始查询',
      token: 'TOKEN-TOP-LEVEL',
      payload: {
        query: '张三的糖尿病用药',
        resultCount: 2,
        queryCount: '患者字符串不能伪装成计数',
        type: '患者字符串不能伪装成类型',
        patientId: 'PATIENT-LEGACY',
        patientName: '患者甲',
        visitId: 'VISIT-LEGACY',
        nested: {
          idPi: 'PATIENT-NESTED',
          patient_id: 'PATIENT-SNAKE-CASE',
          'visit-id': 'VISIT-KEBAB-CASE',
          safeCount: 2,
        },
      },
      timestamp: 1,
    }]));
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440005')
        .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440006')
        .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440007'),
    });
    mocks.regionalPost.mockResolvedValue({
      accepted: 3,
      skipped: 0,
      rejected: 0,
      rejections: [],
    });

    const tracker = await import('./featureUsageTracker');
    tracker.trackFeatureUsage({
      featureCode: 'knowledge_usage',
      traceId: 'TRACE-001',
      sessionId: 'SESSION-001',
      eventAction: '患者自由文本',
      sourceModule: 'source module with spaces',
      scene: 'query:张三',
      payload: {
        patientId: 'PATIENT-NEW',
        patientName: '患者乙',
        visitId: 'VISIT-NEW',
        consultationId: 'VISIT-IN-PAYLOAD',
        emr_access_token: 'TOKEN-SECRET',
        authorization: 'Bearer SECRET',
        cookie: 'SESSION=SECRET',
        queryCount: 3,
        type: 1,
      },
    });
    tracker.trackFeatureUsage({
      featureCode: 'chat',
      payload: {
        query: 'QUERY-FREE-TEXT-SENTINEL',
        prompt: 'PROMPT-FREE-TEXT-SENTINEL',
        message: 'MESSAGE-FREE-TEXT-SENTINEL',
        content: 'CONTENT-FREE-TEXT-SENTINEL',
        durationMs: 12,
      },
    });

    const persistedQueue = JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
    expect(JSON.stringify(persistedQueue)).not.toContain('PATIENT-');
    expect(JSON.stringify(persistedQueue)).not.toContain('患者');
    expect(JSON.stringify(persistedQueue)).not.toContain('张三');
    expect(JSON.stringify(persistedQueue)).not.toContain('VISIT-');
    expect(JSON.stringify(persistedQueue)).not.toContain('TOKEN-SECRET');
    expect(JSON.stringify(persistedQueue)).not.toContain('Bearer SECRET');
    expect(JSON.stringify(persistedQueue)).not.toContain('SESSION=SECRET');
    expect(JSON.stringify(persistedQueue)).not.toContain('FREE-TEXT-SENTINEL');
    expect(persistedQueue[0]).not.toHaveProperty('payload');
    expect(persistedQueue[0].eventId).toBe('550e8400-e29b-41d4-a716-446655440005');
    expect(persistedQueue[0].idempotencyKey).toBe(
      'knowledge_usage:event:550e8400-e29b-41d4-a716-446655440005',
    );
    expect(persistedQueue[1]).not.toHaveProperty('traceId');
    expect(persistedQueue[1]).not.toHaveProperty('sessionId');
    expect(persistedQueue[1]).not.toHaveProperty('eventAction');
    expect(persistedQueue[1]).not.toHaveProperty('sourceModule');
    expect(persistedQueue[1]).not.toHaveProperty('scene');
    expect(persistedQueue[1]).not.toHaveProperty('payload');
    expect(persistedQueue[2]).not.toHaveProperty('payload');
    expect(persistedQueue[1].idempotencyKey).toBe(
      'knowledge_usage:event:550e8400-e29b-41d4-a716-446655440006',
    );
    expect(persistedQueue[2].idempotencyKey).toBe(
      'chat:event:550e8400-e29b-41d4-a716-446655440007',
    );

    await tracker.flushFeatureUsageEvents();
    tracker.stopFeatureUsageUploader();

    const request = mocks.regionalPost.mock.calls[0][1];
    expect(JSON.stringify(request.events)).not.toContain('PATIENT-');
    expect(JSON.stringify(request.events)).not.toContain('患者');
    expect(JSON.stringify(request.events)).not.toContain('张三');
    expect(JSON.stringify(request.events)).not.toContain('VISIT-');
    expect(JSON.stringify(request.events)).not.toContain('SECRET');
    expect(JSON.stringify(request.events)).not.toContain('FREE-TEXT-SENTINEL');
    expect(request.events[0]).not.toHaveProperty('consultationId');
    expect(request.events[1]).not.toHaveProperty('traceId');
    expect(request.events[1]).not.toHaveProperty('sessionId');
    expect(request.events[1]).not.toHaveProperty('consultationId');
    expect(request.events[0]).not.toHaveProperty('payload');
    expect(request.events[1]).not.toHaveProperty('payload');
    expect(request.events[2]).not.toHaveProperty('payload');
  });

  it('removes the first batch by position without dropping a later duplicate event id', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => uuid(8)) });
    mocks.regionalPost.mockResolvedValue({
      accepted: 50,
      skipped: 0,
      rejected: 0,
      rejections: [],
    });

    const tracker = await import('./featureUsageTracker');
    for (let index = 0; index < 51; index += 1) {
      tracker.trackFeatureUsage({ featureCode: 'chat' });
    }

    await expect(tracker.flushFeatureUsageEvents()).resolves.toBe(50);
    tracker.stopFeatureUsageUploader();

    expect(tracker.getFeatureUsageQueueSize()).toBe(1);
  });

  it('keeps the in-flight prefix stable when a full queue receives another event', async () => {
    let sequence = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => uuid(++sequence)),
    });
    const capacityWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let resolveUpload!: (response: unknown) => void;
    mocks.regionalPost.mockReturnValue(new Promise(resolve => {
      resolveUpload = resolve;
    }));

    const tracker = await import('./featureUsageTracker');
    for (let index = 0; index < 1000; index += 1) {
      tracker.trackFeatureUsage({ featureCode: 'chat' });
    }

    const flush = tracker.flushFeatureUsageEvents();
    tracker.trackFeatureUsage({ featureCode: 'chat' });

    const pendingQueue = JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
    expect(pendingQueue).toHaveLength(1000);
    expect(pendingQueue[0].eventId).toBe(uuid(1));
    expect(pendingQueue[49].eventId).toBe(uuid(50));
    expect(pendingQueue.at(-1).eventId).toBe(uuid(1001));

    resolveUpload({ accepted: 50, skipped: 0, rejected: 0, rejections: [] });
    await expect(flush).resolves.toBe(50);
    tracker.stopFeatureUsageUploader();

    expect(tracker.getFeatureUsageQueueSize()).toBe(950);
    expect(capacityWarning).toHaveBeenCalled();
  });

  it('removes an unsanitized disk snapshot when the scrubbed queue cannot be persisted', async () => {
    storage.setItem(QUEUE_KEY, JSON.stringify([{
      eventId: 'LEGACY-SENSITIVE',
      featureCode: 'chat',
      idempotencyKey: 'chat:LEGACY-SENSITIVE',
      consultationId: 'VISIT-SENTINEL',
      payload: { patientName: 'PATIENT-SENTINEL' },
      timestamp: 1,
    }]));
    storage.failWritesFor(QUEUE_KEY);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => uuid(9)) });
    mocks.regionalPost.mockResolvedValue({
      accepted: 1,
      skipped: 0,
      rejected: 0,
      rejections: [],
    });

    const tracker = await import('./featureUsageTracker');
    expect(tracker.getFeatureUsageQueueSize()).toBe(1);
    expect(storage.getItem(QUEUE_KEY)).toBeNull();

    await tracker.flushFeatureUsageEvents();
    tracker.stopFeatureUsageUploader();

    const request = mocks.regionalPost.mock.calls[0][1];
    expect(request.events[0].eventId).toBe(uuid(9));
    expect(request.events[0].idempotencyKey).toBe(`chat:event:${uuid(9)}`);
    expect(JSON.stringify(request)).not.toContain('LEGACY-SENSITIVE');
    expect(JSON.stringify(request)).not.toContain('VISIT-SENTINEL');
    expect(JSON.stringify(request)).not.toContain('PATIENT-SENTINEL');
  });
});
