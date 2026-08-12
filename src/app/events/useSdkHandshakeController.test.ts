import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getHisService: vi.fn(),
  resetHisAdapter: vi.fn(),
  resetHisService: vi.fn(),
  setCatalogContext: vi.fn(),
  setFeedbackActor: vi.fn(),
  resolveFeedbackActorFromUrt: vi.fn(() => ({})),
}));

vi.mock('@/services/his', () => ({
  getHisService: mocks.getHisService,
  resetHisAdapter: mocks.resetHisAdapter,
  resetHisService: mocks.resetHisService,
}));

vi.mock('@/services/medicalData', () => ({
  medicalDataService: {
    setCatalogContext: mocks.setCatalogContext,
  },
}));

vi.mock('@/services/feedbackContext', () => ({
  setFeedbackActor: mocks.setFeedbackActor,
  resolveFeedbackActorFromUrt: mocks.resolveFeedbackActorFromUrt,
}));

import { useSdkHandshakeController } from './useSdkHandshakeController';

describe('useSdkHandshakeController logging privacy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.resolveFeedbackActorFromUrt.mockReturnValue({});
  });

  it('preserves the SDK context path while removing URL secrets from the HIS base URL and logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.setCatalogContext.mockResolvedValue(undefined);

    const { handleSdkHandshake } = useSdkHandshakeController();
    await handleSdkHandshake({
      origin: 'https://USER-SENTINEL:PASSWORD-SENTINEL@his.example:8443/his-web/?query=QUERY-SENTINEL#FRAGMENT-SENTINEL',
      href: 'https://his.example/HREF-SENTINEL',
      extra: {
        emrAccessToken: 'TOKEN-SENTINEL',
        urt: {
          personCd: 'URT-SENTINEL',
          orgCode: 'ORG-SENTINEL',
          idTet: 'TENANT-SENTINEL',
          userRoleDepts: [{ deptId: 'DEPT-SENTINEL' }],
        },
      },
    });

    expect(mocks.getHisService).toHaveBeenCalledWith(
      'https://his.example:8443/his-web',
      expect.objectContaining({
        token: 'TOKEN-SENTINEL',
        orgCode: 'ORG-SENTINEL',
        tenantId: 'TENANT-SENTINEL',
        userRoleDeptIds: ['DEPT-SENTINEL'],
      }),
    );

    const serializedLogs = JSON.stringify([
      ...log.mock.calls,
      ...warn.mock.calls,
    ]);
    for (const secret of [
      'USER-SENTINEL',
      'PASSWORD-SENTINEL',
      'his-web',
      'QUERY-SENTINEL',
      'FRAGMENT-SENTINEL',
      'HREF-SENTINEL',
      'TOKEN-SENTINEL',
      'URT-SENTINEL',
      'ORG-SENTINEL',
      'TENANT-SENTINEL',
      'DEPT-SENTINEL',
    ]) {
      expect(serializedLogs).not.toContain(secret);
    }
    expect(serializedLogs).not.toContain('his.example');
    expect(serializedLogs).toContain('hasBaseUrl');
  });

  it('normalizes a root SDK origin without adding a trailing slash', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.setCatalogContext.mockResolvedValue(undefined);

    const { handleSdkHandshake } = useSdkHandshakeController();
    await handleSdkHandshake({
      origin: 'https://his.example///',
      href: '',
      extra: {
        emrAccessToken: 'token',
      },
    });

    expect(mocks.getHisService).toHaveBeenCalledWith(
      'https://his.example',
      expect.objectContaining({ token: 'token' }),
    );
  });
});
