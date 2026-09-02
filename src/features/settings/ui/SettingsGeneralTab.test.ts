// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultTheme } from '@/styles/themes';
import { getDefaultKeyboardShortcuts } from '../model/keyboardShortcuts';
import SettingsGeneralTab from './SettingsGeneralTab.vue';

let app: App<Element> | null = null;
let root: HTMLDivElement | null = null;

function findButton(name: string): HTMLButtonElement {
  const button = Array.from(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    .find(candidate => candidate.textContent?.includes(name));
  if (!button) throw new Error(`未找到按钮：${name}`);
  return button;
}

function mountSettingsGeneralTab(listeners: {
  onOpenMedicalCache?: () => void;
  onOpenHisLog?: () => void;
} = {}): void {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp(SettingsGeneralTab, {
    currentTheme: defaultTheme,
    themes: [defaultTheme],
    alwaysOnTop: false,
    regionalBaseUrl: 'http://127.0.0.1:8080',
    regionalOrgCode: 'ORG001',
    regionalDeviceCode: 'device-test',
    regionalDefaults: {
      baseUrl: 'http://127.0.0.1:8080',
      orgCode: 'ORG001',
    },
    regionalConnectResult: null,
    testingRegionalConnection: false,
    defaultAudioInputValue: '',
    audioInputOptions: [],
    audioInputDevices: [],
    selectedAudioInputDeviceId: '',
    audioDeviceLoading: false,
    audioDeviceError: '',
    voiceRecordingDir: '',
    voicePickingDir: false,
    keyboardShortcuts: getDefaultKeyboardShortcuts(),
    ...listeners,
  });
  app.mount(root);
}

afterEach(() => {
  app?.unmount();
  root?.remove();
  app = null;
  root = null;
});

describe('SettingsGeneralTab navigation entries', () => {
  it('renders cache and HIS log entries without a local outpatient template entry', () => {
    mountSettingsGeneralTab();

    const cacheButton = findButton('缓存管理');
    const hisLogButton = findButton('HIS 联调日志');

    expect(root?.textContent).not.toContain('门诊模板实验台');
    expect(root?.textContent).not.toContain('上传或粘贴门诊模板');
    expect(cacheButton.tagName).toBe('BUTTON');
    expect(cacheButton.type).toBe('button');
    expect(cacheButton.textContent).toContain('查看诊断、诊疗项目和药品目录等本地基础数据缓存');
    expect(hisLogButton.tagName).toBe('BUTTON');
    expect(hisLogButton.type).toBe('button');
    expect(hisLogButton.textContent).toContain('查看 Bridge 入站与 PHIS 出站调用流水');
  });

  it('emits only the corresponding navigation event when each entry is clicked', async () => {
    const onOpenMedicalCache = vi.fn();
    const onOpenHisLog = vi.fn();
    mountSettingsGeneralTab({ onOpenMedicalCache, onOpenHisLog });

    findButton('缓存管理').click();
    await nextTick();
    expect(onOpenMedicalCache).toHaveBeenCalledTimes(1);
    expect(onOpenHisLog).not.toHaveBeenCalled();

    findButton('HIS 联调日志').click();
    await nextTick();
    expect(onOpenMedicalCache).toHaveBeenCalledTimes(1);
    expect(onOpenHisLog).toHaveBeenCalledTimes(1);
  });
});
