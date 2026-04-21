type LegacyGetUserMedia = (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: DOMException) => void
) => void;

type LegacyNavigator = Navigator & {
    getUserMedia?: LegacyGetUserMedia;
    webkitGetUserMedia?: LegacyGetUserMedia;
    mozGetUserMedia?: LegacyGetUserMedia;
    msGetUserMedia?: LegacyGetUserMedia;
};

const AUDIO_INPUT_DEVICE_STORAGE_KEY = 'AUDIO_INPUT_DEVICE_ID';

export type MicrophonePermissionState = PermissionState | 'unsupported';

export interface AudioInputDeviceOption {
    deviceId: string;
    label: string;
}

function getStoredAudioInputDeviceId(): string | null {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    const deviceId = localStorage.getItem(AUDIO_INPUT_DEVICE_STORAGE_KEY)?.trim();
    return deviceId ? deviceId : null;
}

function clearStoredAudioInputDeviceId(): void {
    if (typeof localStorage === 'undefined') {
        return;
    }

    localStorage.removeItem(AUDIO_INPUT_DEVICE_STORAGE_KEY);
}

export function getPreferredAudioInputDeviceId(): string | null {
    return getStoredAudioInputDeviceId();
}

export function setPreferredAudioInputDeviceId(deviceId: string | null): void {
    if (typeof localStorage === 'undefined') {
        return;
    }

    const normalizedDeviceId = deviceId?.trim();
    if (normalizedDeviceId) {
        localStorage.setItem(AUDIO_INPUT_DEVICE_STORAGE_KEY, normalizedDeviceId);
        return;
    }

    clearStoredAudioInputDeviceId();
}

export async function listAudioInputDevices(options: { requestPermission?: boolean } = {}): Promise<AudioInputDeviceOption[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        return [];
    }

    let permissionProbeStream: MediaStream | null = null;
    if (options.requestPermission) {
        permissionProbeStream = await requestMicrophoneStream({ audio: true });
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        let fallbackIndex = 1;

        return devices
            .filter((device) => device.kind === 'audioinput')
            .map((device) => ({
                deviceId: device.deviceId,
                label: device.label?.trim() || `输入设备 ${fallbackIndex++}`,
            }));
    } finally {
        permissionProbeStream?.getTracks().forEach((track) => track.stop());
    }
}

export async function getMicrophonePermissionState(): Promise<MicrophonePermissionState> {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
        return 'unsupported';
    }

    try {
        const permissionStatus = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
        });

        return permissionStatus.state;
    } catch (error) {
        console.warn('[AudioRecorder] Failed to query microphone permission state:', error);
        return 'unsupported';
    }
}

function hasResolvableAudioInputDevices(devices: AudioInputDeviceOption[]): boolean {
    return devices.some((device) => Boolean(device.deviceId));
}

function isUnavailableAudioInputError(error: unknown): boolean {
    if (error instanceof DOMException) {
        return error.name === 'OverconstrainedError'
            || error.name === 'NotFoundError'
            || error.name === 'DevicesNotFoundError';
    }

    const message = error instanceof Error ? error.message : String(error);
    return message.includes('OverconstrainedError') || message.includes('NotFoundError');
}

async function resolveAudioInputConstraint(): Promise<MediaTrackConstraints | boolean> {
    const preferredDeviceId = getStoredAudioInputDeviceId();
    if (!preferredDeviceId) {
        return true;
    }

    const availableDevices = await listAudioInputDevices();
    if (!hasResolvableAudioInputDevices(availableDevices)) {
        return { deviceId: { exact: preferredDeviceId } };
    }

    if (availableDevices.some((device) => device.deviceId === preferredDeviceId)) {
        return { deviceId: { exact: preferredDeviceId } };
    }

    clearStoredAudioInputDeviceId();
    return true;
}

/**
 * 请求麦克风流（兼容旧版 WebView）
 */
export async function requestMicrophoneStream(
    constraints: MediaStreamConstraints = { audio: true }
): Promise<MediaStream> {
    if (typeof navigator === 'undefined') {
        throw new Error('当前环境不支持麦克风录音');
    }

    if (navigator.mediaDevices?.getUserMedia) {
        return navigator.mediaDevices.getUserMedia(constraints);
    }

    const legacyNavigator = navigator as LegacyNavigator;
    const legacyGetUserMedia =
        legacyNavigator.getUserMedia
        || legacyNavigator.webkitGetUserMedia
        || legacyNavigator.mozGetUserMedia
        || legacyNavigator.msGetUserMedia;

    if (legacyGetUserMedia) {
        return new Promise((resolve, reject) => {
            legacyGetUserMedia.call(legacyNavigator, constraints, resolve, reject);
        });
    }

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
        throw new Error('当前页面不是安全上下文，无法访问麦克风');
    }

    const isMac =
        typeof navigator !== 'undefined'
        && /Macintosh|Mac OS X/i.test(navigator.userAgent);
    if (isMac) {
        throw new Error('macOS 未启用麦克风能力，请重建应用并在系统设置允许麦克风权限');
    }

    throw new Error('当前运行环境不支持麦克风接口，请升级 WebView 内核');
}

/**
 * 统一麦克风错误提示文案
 */
export function getMicrophoneErrorMessage(error: unknown): string {
    if (error instanceof DOMException) {
        switch (error.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                return '麦克风权限被拒绝，请在系统设置中允许访问';
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return '未检测到可用麦克风设备';
            case 'NotReadableError':
            case 'TrackStartError':
                return '麦克风被其他应用占用，请关闭后重试';
            case 'SecurityError':
                return '当前页面安全策略限制了麦克风访问';
            case 'AbortError':
                return '麦克风初始化被中断，请重试';
            case 'OverconstrainedError':
                return '当前设备不满足录音参数要求';
            default:
                break;
        }
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('macOS 未启用麦克风能力')) {
        return message;
    }
    if (message.includes('mediaDevices') && message.includes('undefined')) {
        return '当前运行环境不支持麦克风接口，请升级 WebView 内核';
    }

    return message || '无法访问麦克风，请检查权限和设备状态';
}

export class AudioRecorder {
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private scriptProcessor: ScriptProcessorNode | null = null;
    private audioBuffers: Float32Array[] = [];
    private isRecordingInternal: boolean = false;
    private recordingLength: number = 0;
    private sampleRate: number = 16000;

    // 实时音频回调
    private onAudioChunkCallback?: (pcmData: Int16Array) => void;

    constructor() { }

    /**
     * 设置实时音频块回调
     * @param callback 接收 PCM 16bit 数据的回调函数
     */
    setOnAudioChunk(callback: ((pcmData: Int16Array) => void) | undefined): void {
        this.onAudioChunkCallback = callback;
    }

    async start(): Promise<void> {
        if (this.isRecordingInternal) return;
        console.time('[AudioRecorder] total start');

        try {
            console.time('[AudioRecorder] getUserMedia');
            const audioConstraint = await resolveAudioInputConstraint();
            try {
                this.stream = await requestMicrophoneStream({ audio: audioConstraint });
            } catch (err) {
                if (audioConstraint !== true && isUnavailableAudioInputError(err)) {
                    clearStoredAudioInputDeviceId();
                    this.stream = await requestMicrophoneStream({ audio: true });
                } else {
                    throw err;
                }
            }
            console.timeEnd('[AudioRecorder] getUserMedia');

            // Setup Audio Context
            console.time('[AudioRecorder] AudioContext setup');
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            // Setup ScriptProcessor for RAW PCM
            // Buffer size 4096, 1 input, 1 output
            this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
            this.audioBuffers = [];
            this.recordingLength = 0;
            this.sampleRate = this.audioContext.sampleRate; // Should be 16000 if supported
            console.log('[AudioRecorder] Actual sample rate:', this.sampleRate);

            this.scriptProcessor.onaudioprocess = (e) => {
                if (!this.isRecordingInternal) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const floatData = new Float32Array(inputData);
                this.audioBuffers.push(floatData);
                this.recordingLength += inputData.length;

                // 实时回调：转换为 16bit PCM 并发送
                if (this.onAudioChunkCallback) {
                    const pcm16 = this.floatTo16BitPCMArray(floatData);
                    this.onAudioChunkCallback(pcm16);
                }
            };

            // Connect graph
            this.source.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination); // Needed for processing to happen
            console.timeEnd('[AudioRecorder] AudioContext setup');

            this.isRecordingInternal = true;
            console.timeEnd('[AudioRecorder] total start');
        } catch (err) {
            console.error("[AudioRecorder] Error accessing microphone:", err);
            console.timeEnd('[AudioRecorder] total start');
            throw new Error(getMicrophoneErrorMessage(err));
        }
    }

    pause(): void {
        this.isRecordingInternal = false;
        if (this.audioContext) this.audioContext.suspend();
    }

    resume(): void {
        this.isRecordingInternal = true;
        if (this.audioContext) this.audioContext.resume();
    }

    async stop(): Promise<Blob> {
        return new Promise((resolve) => {
            if (!this.isRecordingInternal && !this.stream) {
                resolve(new Blob([], { type: 'audio/wav' }));
                return;
            }

            this.isRecordingInternal = false;

            // Stop Web Audio
            if (this.source) this.source.disconnect();
            if (this.scriptProcessor) this.scriptProcessor.disconnect();
            if (this.analyser) this.analyser.disconnect();

            // Generate WAV
            const wavBlob = this.exportWAV(this.audioBuffers, this.recordingLength);

            // Cleanup
            this.cleanup();
            resolve(wavBlob);
        });
    }

    getAnalyser(): AnalyserNode | null {
        return this.analyser;
    }

    getByteFrequencyData(): Uint8Array | null {
        if (!this.analyser) return null;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }

    isRecording(): boolean {
        return this.isRecordingInternal;
    }

    private cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.analyser = null;
        this.source = null;
        this.scriptProcessor = null;
        this.audioBuffers = [];
    }

    private exportWAV(buffers: Float32Array[], length: number): Blob {
        const buffer = this.mergeBuffers(buffers, length);
        const view = this.encodeWAV(buffer);
        return new Blob([view], { type: 'audio/wav' });
    }

    private mergeBuffers(buffers: Float32Array[], length: number) {
        const result = new Float32Array(length);
        let offset = 0;
        for (const buffer of buffers) {
            result.set(buffer, offset);
            offset += buffer.length;
        }
        return result;
    }

    private encodeWAV(samples: Float32Array) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        /* RIFF identifier */
        this.writeString(view, 0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + samples.length * 2, true);
        /* RIFF type */
        this.writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        this.writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, 1, true);
        /* channel count */
        view.setUint16(22, 1, true); /* MONO */
        /* sample rate */
        view.setUint32(24, this.sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, this.sampleRate * 2, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, 2, true);
        /* bits per sample */
        view.setUint16(34, 16, true);
        /* data chunk identifier */
        this.writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, samples.length * 2, true);

        this.floatTo16BitPCM(view, 44, samples);

        return view;
    }

    private floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    /**
     * 将 Float32Array 转换为 Int16Array（PCM 16bit）
     */
    private floatTo16BitPCMArray(input: Float32Array): Int16Array {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }

    private writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}

export const audioRecorder = new AudioRecorder();
