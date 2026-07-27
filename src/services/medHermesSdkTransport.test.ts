// @ts-expect-error Node built-ins are provided by Vitest but @types/node is not a direct project dependency.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node built-ins are provided by Vitest but @types/node is not a direct project dependency.
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdkSource = readFileSync(new URL('../../sdk/med-hermes-sdk.js', import.meta.url), 'utf8');

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.();
  }
}

type FetchMock = ReturnType<typeof vi.fn>;
type MedHermesInstance = {
  init(): Promise<unknown>;
  openChronicDisease(patient: Record<string, unknown>): Promise<unknown>;
  destroy(): void;
  on(event: string, handler: (...args: unknown[]) => void): MedHermesInstance;
};
type MedHermesConstructor = new (options?: Record<string, unknown>) => MedHermesInstance;

function successfulResponse() {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ status: 'success', version: 'test' })),
  });
}

function loadSdk(fetchMock: FetchMock): MedHermesConstructor {
  const moduleState: { exports: unknown } = { exports: {} };
  const sandbox: Record<string, unknown> = {
    module: moduleState,
    exports: moduleState.exports,
    fetch: fetchMock,
    WebSocket: FakeWebSocket,
    AbortController,
    setTimeout,
    clearTimeout,
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
  sandbox.globalThis = sandbox;
  runInNewContext(sdkSource, sandbox);
  return moduleState.exports as MedHermesConstructor;
}

describe('MedHermes WebSocket-only event transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('contains no HTTP polling result path or polling API', () => {
    expect(sdkSource).not.toContain('/consultation/events/poll');
    expect(sdkSource).not.toContain('prototype.pollEvent');
    expect(sdkSource).not.toContain('prototype.startPolling');
    expect(sdkSource).not.toContain('prototype.stopPolling');
  });

  it('uses an isolated chronic-disease endpoint and rejects risk payloads', async () => {
    const fetchMock = vi.fn(successfulResponse);
    const MedHermes = loadSdk(fetchMock);
    const sdk = new MedHermes();

    await sdk.openChronicDisease({
      idPi: 'patient-1',
      idVis: 'visit-1',
      rqflStatus: '3,6',
      contractStatus: '已签约',
    });

    const fetchCalls = fetchMock.mock.calls as unknown as unknown[][];
    const chronicCall = fetchCalls
      .find((call) => String(call[0]).endsWith('/api/chronic-disease/open'));
    expect(chronicCall).toBeDefined();
    const requestOptions = chronicCall?.[1] as { body?: string };
    expect(JSON.parse(requestOptions.body || '{}')).toEqual(expect.objectContaining({
      idPi: 'patient-1',
      rqflStatus: '3,6',
    }));
    expect(requestOptions.body).not.toContain('"risks"');
    expect(fetchCalls.some((call) => String(call[0]).includes('/api/patient/risks'))).toBe(false);

    await expect(sdk.openChronicDisease({
      idPi: 'patient-1',
      risks: [],
    })).rejects.toMatchObject({
      code: 'CHRONIC_DISEASE_RISKS_NOT_ALLOWED',
    });
    sdk.destroy();
  });

  it('opens WebSocket after the initial handshake without a duplicate handshake', async () => {
    const fetchMock = vi.fn(successfulResponse);
    const MedHermes = loadSdk(fetchMock);
    const sdk = new MedHermes();

    await sdk.init();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe('ws://127.0.0.1:8081/api/consultation/events/ws');
    sdk.destroy();
  });

  it('retries failed reconnect handshakes with capped exponential backoff', async () => {
    const fetchMock = vi.fn(successfulResponse);
    const MedHermes = loadSdk(fetchMock);
    const sdk = new MedHermes({ wsReconnectMs: 1000, wsReconnectMaxMs: 30000 });
    const disconnected = vi.fn();
    sdk.on('disconnected', disconnected);

    await sdk.init();
    FakeWebSocket.instances[0].onopen?.();
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    FakeWebSocket.instances[0].onclose?.();

    expect(disconnected).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000 + 8000 + 16000 + 30000);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(29999);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(8);
    const fetchCalls = fetchMock.mock.calls as unknown as unknown[][];
    expect(fetchCalls.every((call) => !String(call[0]).includes('/events/poll'))).toBe(true);
    expect(disconnected).toHaveBeenCalledTimes(1);
    sdk.destroy();
  });

  it('cancels a scheduled reconnect when destroyed', async () => {
    const fetchMock = vi.fn(successfulResponse);
    const MedHermes = loadSdk(fetchMock);
    const sdk = new MedHermes({ wsReconnectMs: 1000 });

    await sdk.init();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onclose?.();
    sdk.destroy();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resets the retry delay and emits connected after WebSocket recovery', async () => {
    const fetchMock = vi.fn(successfulResponse);
    const MedHermes = loadSdk(fetchMock);
    const sdk = new MedHermes({ wsReconnectMs: 1000, wsReconnectMaxMs: 30000 });
    const connected = vi.fn();
    sdk.on('connected', connected);

    await sdk.init();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onclose?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].onopen?.();
    expect(connected).toHaveBeenCalledTimes(2);

    FakeWebSocket.instances[1].onclose?.();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    sdk.destroy();
  });

  it('reconnects with the last consumed event id for replay', async () => {
    const fetchMock = vi.fn(successfulResponse);
    const MedHermes = loadSdk(fetchMock);
    const sdk = new MedHermes({ wsReconnectMs: 1000 });

    await sdk.init();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        state: 'ready',
        event: {
          id: 'event-42',
          type: 'draft',
          consultationId: 'visit-1',
          timestamp: 42,
          payload: { resultType: 'draft' },
        },
      }),
    });
    FakeWebSocket.instances[0].onclose?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeWebSocket.instances[1].url).toBe(
      'ws://127.0.0.1:8081/api/consultation/events/ws?after=event-42',
    );
    sdk.destroy();
  });
});
