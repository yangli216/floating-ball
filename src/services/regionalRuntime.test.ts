import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkForceUpdateRequired: vi.fn(),
  initializeRegionalClient: vi.fn(),
  shutdownRegionalClient: vi.fn(),
  regionalPost: vi.fn(),
  startAuditUploader: vi.fn(),
  stopAuditUploader: vi.fn(),
  startRecommendationPreferenceUploader: vi.fn(),
  stopRecommendationPreferenceUploader: vi.fn(),
  syncRemotePrompts: vi.fn(),
  syncRemoteTemplates: vi.fn(),
  syncRemoteData: vi.fn(),
  logOperation: vi.fn(),
}));

vi.mock('./regionalClient', () => ({
  initializeRegionalClient: mocks.initializeRegionalClient,
  shutdownRegionalClient: mocks.shutdownRegionalClient,
  regionalPost: mocks.regionalPost,
}));

vi.mock('./auditUploader', () => ({
  startAuditUploader: mocks.startAuditUploader,
  stopAuditUploader: mocks.stopAuditUploader,
}));

vi.mock('./recommendationPreferenceTracker', () => ({
  startRecommendationPreferenceUploader: mocks.startRecommendationPreferenceUploader,
  stopRecommendationPreferenceUploader: mocks.stopRecommendationPreferenceUploader,
}));

vi.mock('./promptOverride', () => ({ syncRemotePrompts: mocks.syncRemotePrompts }));
vi.mock('./templateService', () => ({ syncRemoteTemplates: mocks.syncRemoteTemplates }));
vi.mock('./medicalData', () => ({
  medicalDataService: { syncRemoteData: mocks.syncRemoteData },
}));
vi.mock('./feedback', () => ({
  feedbackService: { logOperation: mocks.logOperation },
}));
vi.mock('./updatePolicy', () => ({
  checkForceUpdateRequired: mocks.checkForceUpdateRequired,
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
}

const QUEUE_KEY = 'REGIONAL_FEATURE_USAGE_QUEUE';
const REJECTION_QUEUE_KEY = 'REGIONAL_FEATURE_USAGE_REJECTION_QUEUE';
const SAFE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';

function seedLegacyStorage(storage: MemoryStorage): void {
  storage.setItem(QUEUE_KEY, JSON.stringify([{
    eventId: 'PATIENT-EVENT-SENTINEL',
    featureCode: 'chat',
    idempotencyKey: 'chat:PATIENT-SENTINEL',
    traceId: 'TRACE-SENTINEL',
    consultationId: 'VISIT-SENTINEL',
    payload: { patientName: '患者甲' },
    timestamp: 1,
  }]));
  storage.setItem(REJECTION_QUEUE_KEY, JSON.stringify([{
    eventId: SAFE_EVENT_ID,
    featureCode: 'chat',
    index: 0,
    reason: '患者甲的原始拒绝原因',
    rejectedAt: 123,
    payload: { visitId: 'VISIT-SENTINEL' },
  }]));
}

function expectLegacyStorageSanitized(storage: MemoryStorage): void {
  const persisted = `${storage.getItem(QUEUE_KEY)}${storage.getItem(REJECTION_QUEUE_KEY)}`;
  for (const sentinel of [
    'PATIENT-EVENT-SENTINEL',
    'PATIENT-SENTINEL',
    'TRACE-SENTINEL',
    'VISIT-SENTINEL',
    '患者甲',
  ]) {
    expect(persisted).not.toContain(sentinel);
  }
}

describe('regionalRuntime feature-usage privacy bootstrap', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach(mock => mock.mockReset());
    storage = new MemoryStorage();
    seedLegacyStorage(storage);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => SAFE_EVENT_ID) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizes both queues before a force-update early return', async () => {
    mocks.checkForceUpdateRequired.mockImplementation(async () => {
      expectLegacyStorageSanitized(storage);
      return { currentVersion: '1.3.9', required: true };
    });

    const runtime = await import('./regionalRuntime');
    await expect(runtime.initializeRegionalRuntime()).resolves.toBeNull();

    expectLegacyStorageSanitized(storage);
    expect(mocks.initializeRegionalClient).not.toHaveBeenCalled();
  });

  it('sanitizes both queues before a missing-bootstrap early return', async () => {
    mocks.checkForceUpdateRequired.mockResolvedValue({ currentVersion: '1.3.9', required: false });
    mocks.initializeRegionalClient.mockImplementation(async () => {
      expectLegacyStorageSanitized(storage);
      return null;
    });

    const runtime = await import('./regionalRuntime');
    await expect(runtime.initializeRegionalRuntime()).resolves.toBeNull();

    expectLegacyStorageSanitized(storage);
    expect(mocks.startAuditUploader).not.toHaveBeenCalled();
  });
});
