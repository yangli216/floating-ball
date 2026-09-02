// @ts-expect-error Node built-ins are provided by Vitest but @types/node is not a direct project dependency.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node built-ins are provided by Vitest but @types/node is not a direct project dependency.
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const sdkSource = readFileSync(new URL('../../sdk/med-hermes-sdk.js', import.meta.url), 'utf8');

interface VoicePatient {
  idPi: string;
  idVis?: string;
  outpatientEmr?: Record<string, unknown>;
}

interface MedHermesInstance {
  startVoice(patient?: VoicePatient): Promise<Record<string, unknown>>;
  _http: {
    post: (path: string, payload: VoicePatient) => Promise<Record<string, unknown>>;
  };
  _callWithFallback(
    httpCall: () => Promise<Record<string, unknown>>,
    protocolPath?: string,
    params?: unknown,
  ): Promise<Record<string, unknown>>;
  _resumeEventChannelIfNeeded(): void;
}

type MedHermesConstructor = new () => MedHermesInstance;

function loadSdk(): MedHermesConstructor {
  const moduleState: { exports: unknown } = { exports: {} };
  const sandbox: Record<string, unknown> = {
    module: moduleState,
    exports: moduleState.exports,
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

function createTemplate(): Record<string, unknown> {
  return {
    templateId: 'TPL-001',
    templateName: '门诊模板',
    templateHtml: '  <section data-id="chief"></section>  ',
    templateDefinition: '  [{"ID":"chief"}]  ',
    targetFieldIds: ['chief'],
    requestId: 'REQ-001',
  };
}

function stubBridge(sdk: MedHermesInstance) {
  const post = vi.fn().mockResolvedValue({ status: 'success' });
  sdk._http.post = post;
  sdk._callWithFallback = httpCall => httpCall();
  sdk._resumeEventChannelIfNeeded = vi.fn();
  return post;
}

describe('MedHermes startVoice dynamic outpatient template', () => {
  it('posts the exact validated template pair without rewriting source strings', async () => {
    const MedHermes = loadSdk();
    const sdk = new MedHermes();
    const post = stubBridge(sdk);
    const template = createTemplate();

    await expect(sdk.startVoice({
      idPi: 'P001',
      idVis: 'VIS-001',
      outpatientEmr: template,
    })).resolves.toEqual({ status: 'success' });

    expect(post).toHaveBeenCalledWith('/consultation/start-voice', {
      idPi: 'P001',
      idVis: 'VIS-001',
      outpatientEmr: template,
    });
  });

  it('rejects missing idVis, unknown template fields and duplicate targets before Bridge', async () => {
    const MedHermes = loadSdk();
    const sdk = new MedHermes();
    const post = stubBridge(sdk);

    await expect(sdk.startVoice({
      idPi: 'P001',
      outpatientEmr: createTemplate(),
    })).rejects.toThrow('要求无首尾空白的 idVis');
    await expect(sdk.startVoice({
      idPi: 'P001',
      idVis: 'VIS-001',
      outpatientEmr: { ...createTemplate(), unsupported: true },
    })).rejects.toThrow('必须且只能包含六个文档化字段');
    await expect(sdk.startVoice({
      idPi: 'P001',
      idVis: 'VIS-001',
      outpatientEmr: { ...createTemplate(), targetFieldIds: ['chief', 'chief'] },
    })).rejects.toThrow('必须无空白且不重复');

    expect(post).not.toHaveBeenCalled();
  });
});
