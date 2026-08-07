// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildRegionalSpeechUploadPayload: vi.fn(async () => ({
    audio: 'encoded-audio',
    mimeType: 'audio/pcm',
    format: 'pcm',
    fileName: 'voice-test.pcm',
    scene: 'voice-consultation',
  })),
  createRegionalWebSocketUrl: vi.fn(async () => 'wss://pcie.example/v1/ai/speech/realtime/ws'),
  regionalPost: vi.fn(async () => ({ text: '完整批量文本' })),
}));

vi.mock('./regionalClient', () => ({
  buildRegionalSpeechUploadPayload: mocks.buildRegionalSpeechUploadPayload,
  createRegionalWebSocketUrl: mocks.createRegionalWebSocketUrl,
  regionalPost: mocks.regionalPost,
}));

vi.mock('./speechConfig', () => ({
  getSpeechConfig: () => ({
    provider: 'aliyun-dashscope',
    model: 'qwen-audio-3.0-asr-flash-streaming',
    sampleRate: 16000,
    format: 'pcm',
  }),
  supportsRealtimeSpeech: () => true,
}));

vi.mock('./llm', () => ({
  transcribeAudio: vi.fn(),
}));

vi.mock('./aiTrace', () => ({
  beginAiTrace: () => ({ traceId: 'trace-1', sessionId: 'session-1' }),
  failAiTrace: vi.fn(),
  finishAiTrace: vi.fn(),
}));

import { RealtimeSpeechService } from './aliyunSpeech';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  binaryType: BinaryType = 'blob';
  readyState = FakeWebSocket.CONNECTING;
  sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new DOMException('WebSocket is not open');
    }
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    const handler = this.onclose;
    handler?.(new CloseEvent('close', { code, reason, wasClean: code === 1000 }));
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  receive(payload: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  remoteClose(code = 1011): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, wasClean: false }));
  }
}

async function startStreamingService(onText = vi.fn()) {
  const service = new RealtimeSpeechService();
  const starting = service.start(onText);
  await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  FakeWebSocket.instances[0].open();
  await starting;
  return { onText, service };
}

describe('RealtimeSpeechService recovery', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    localStorage.removeItem('SPEECH_TEST_MODE');
    mocks.buildRegionalSpeechUploadPayload.mockClear();
    mocks.createRegionalWebSocketUrl.mockClear();
    mocks.regionalPost.mockClear();
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconnects after an unexpected close and flushes PCM captured during recovery', async () => {
    const { service } = await startStreamingService();
    const firstSocket = FakeWebSocket.instances[0];

    service.sendAudio(new Int16Array([1, 2]));
    expect(firstSocket.sent).toHaveLength(1);

    firstSocket.remoteClose();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));

    service.sendAudio(new Int16Array([3, 4]));
    const secondSocket = FakeWebSocket.instances[1];
    expect(secondSocket.sent).toHaveLength(0);

    secondSocket.open();
    expect(secondSocket.sent).toHaveLength(1);
    expect(secondSocket.sent[0]).toBeInstanceOf(ArrayBuffer);

    service.close();
  });

  it('uses the complete buffered recording when a streaming interruption occurred', async () => {
    const onText = vi.fn();
    const { service } = await startStreamingService(onText);
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.receive({ type: 'text', text: '前半段', isSentenceEnd: true });
    service.sendAudio(new Int16Array([1, 2]));

    firstSocket.remoteClose();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const secondSocket = FakeWebSocket.instances[1];
    service.sendAudio(new Int16Array([3, 4]));
    secondSocket.open();
    secondSocket.receive({ type: 'text', text: '后半段', isSentenceEnd: true });

    const finishing = service.finish();
    expect(secondSocket.sent).toContain(JSON.stringify({ type: 'finish' }));
    secondSocket.receive({ type: 'final', text: '后半段' });

    await expect(finishing).resolves.toBe('完整批量文本');
    expect(mocks.regionalPost).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenLastCalledWith('完整批量文本', true);
  });
});
