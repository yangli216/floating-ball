/**
 * 阿里云 DashScope Paraformer 实时语音转写服务
 * 通过 Rust 后端代理 WebSocket 连接（绕过浏览器不能设置 WebSocket HTTP Headers 的限制）
 *
 * 官方文档: https://help.aliyun.com/zh/model-studio/websocket-for-paraformer-real-time-service
 */

export interface AliyunSpeechConfig {
    apiKey: string;
    model?: string;
    sampleRate?: number;
    format?: string;
}

// 重试配置
export interface SpeechRetryConfig {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}

export const DEFAULT_SPEECH_RETRY_CONFIG: SpeechRetryConfig = {
    maxRetries: 2,  // 语音识别重试次数少一些，避免用户等待过久
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2
};

export function getAliyunSpeechConfig(): AliyunSpeechConfig {
    // 区域化模式下不需要本地 key，由后端代理
    const apiKey = localStorage.getItem('DASHSCOPE_API_KEY') || import.meta.env.VITE_DASHSCOPE_API_KEY || '';
    return {
        apiKey,
        model: 'fun-asr-flash-8k-realtime',
        sampleRate: 16000,
        format: 'pcm'
    };
}

/**
 * 快速测试模式示例文本
 * 启用测试模式时，直接返回此文本而不调用实际语音识别
 */
const TEST_MODE_SAMPLE_TEXT = `坐吧，先露手腕量个体温。啥时候开始发烧的？多少度？
昨天下午开始，在家量38.5℃，吃了对乙酰氨基酚，退了又烧。
除了发烧，还有别的不舒服吗？比如嗓子疼、咳嗽、浑身酸？
嗓子疼得厉害，干咳没痰，浑身软、关节酸，不流涕不拉肚子。
之前受凉了吗？接触过发烧的人吗？
前天淋雨受凉了，没接触过发烧的人，家里人都好。
张嘴"啊"——扁桃体肿、咽部红。除了退烧药，还吃别的药没？
没吃别的，我对青霉素过敏。
过敏史记下了。测下血氧、听下肺——血氧98%，肺部没问题，不是肺炎。
是流感吗？用拍胸片吗？
更像普通上感，不是流感。不用拍胸片，先查血常规+CRP，看是细菌还是病毒感染。
好，查完怎么用药？
病毒感染就对症休息、按时吃退烧药；细菌感染就开阿奇霉素，你不过敏。
明白。需要隔离吗？能上班吗？
不用强制隔离，建议居家休息3-5天，不烧了再上班。多喝水、清淡饮食、别熬夜。
好，谢谢医生。
拿着就诊卡去缴费抽血，结果出来找我。体温超39℃或胸闷气短，随时复诊。
知道了，谢谢！
慢走。`;

/**
 * 检查是否启用快速测试模式
 * 可通过环境变量 VITE_SPEECH_TEST_MODE=true 或 localStorage 设置
 */
export function isTestModeEnabled(): boolean {
    return localStorage.getItem('SPEECH_TEST_MODE') === 'true'
        || import.meta.env.VITE_SPEECH_TEST_MODE === 'true';
}

/**
 * 设置测试模式
 */
export function setTestMode(enabled: boolean): void {
    if (enabled) {
        localStorage.setItem('SPEECH_TEST_MODE', 'true');
    } else {
        localStorage.removeItem('SPEECH_TEST_MODE');
    }
    console.log('[AliyunSpeech] Test mode:', enabled ? 'ENABLED' : 'DISABLED');
}

/**
 * 带重试机制的实时语音识别（内部函数）
 */
async function transcribeWithAliyunInternal(
    audioBlob: Blob,
    retryConfig: SpeechRetryConfig = DEFAULT_SPEECH_RETRY_CONFIG
): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    const config = getAliyunSpeechConfig();

    if (!config.apiKey) {
        throw new Error('DashScope API Key 未配置。请在设置中添加阿里云 API Key。');
    }

    console.log('[AliyunSpeech] Transcribing via Rust backend:', audioBlob.size, 'bytes');

    // 转换 Blob 为 Uint8Array
    const arrayBuffer = await audioBlob.arrayBuffer();
    const fullData = new Uint8Array(arrayBuffer);

    // 跳过 WAV 头（44字节）如果是 WAV 格式
    const isWav = audioBlob.type === 'audio/wav' || audioBlob.type === 'audio/wave';
    const dataOffset = isWav ? 44 : 0;
    const audioData = Array.from(fullData.slice(dataOffset));

    console.log('[AliyunSpeech] Audio data (PCM):', audioData.length, 'bytes');

    // 重试逻辑
    let lastError: any;
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
            const startTime = Date.now();
            const text = await invoke<string>('transcribe_realtime_aliyun', {
                apiKey: config.apiKey,
                audioData: audioData
            });

            console.log(`[AliyunSpeech] Transcription complete in ${Date.now() - startTime}ms`);
            console.log('[AliyunSpeech] Result:', text);
            return text;
        } catch (error: any) {
            lastError = error;
            console.error(`[AliyunSpeech] Attempt ${attempt + 1} failed:`, error);

            // 如果是最后一次尝试，直接抛出
            if (attempt === retryConfig.maxRetries) {
                break;
            }

            // 计算延迟时间（指数退避）
            const delay = Math.min(
                retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
                retryConfig.maxDelay
            );

            console.warn(`[AliyunSpeech] 将在 ${delay}ms 后进行第 ${attempt + 2} 次重试`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw new Error(lastError?.message || lastError || '语音识别失败');
}

/**
 * 通过 Rust 后端进行实时语音识别（带 Whisper 降级）
 * 后端会建立带认证 header 的 WebSocket 连接
 */
export async function transcribeWithAliyun(
    audioBlob: Blob,
    enableWhisperFallback: boolean = true
): Promise<string> {
    // 检查测试模式
    if (isTestModeEnabled()) {
        console.log('[AliyunSpeech] TEST MODE: Returning sample text instead of real transcription');
        // 模拟延迟，让用户看到加载效果
        await new Promise(r => setTimeout(r, 500));
        return TEST_MODE_SAMPLE_TEXT;
    }

    // 区域化模式：通过后端语音代理
    const { isRegionalMode } = await import('./regionalClient');
    if (isRegionalMode()) {
        try {
            const { regionalPost } = await import('./regionalClient');
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            const resp = await regionalPost<{ text: string }>('/v1/ai/speech/realtime', {
                audio: base64,
                format: 'pcm',
            });
            return resp.text;
        } catch (error: any) {
            console.error('[AliyunSpeech] Regional proxy failed:', error);
            if (enableWhisperFallback) {
                console.warn('[AliyunSpeech] 降级到本地 Whisper...');
                const { transcribeAudio } = await import('./llm');
                return await transcribeAudio(audioBlob);
            }
            throw error;
        }
    }

    try {
        // 尝试使用 Aliyun 识别（带重试）
        return await transcribeWithAliyunInternal(audioBlob);
    } catch (error: any) {
        console.error('[AliyunSpeech] Aliyun 识别最终失败:', error);

        // 如果启用了 Whisper 降级且音频大小合理（< 25MB）
        if (enableWhisperFallback && audioBlob.size < 25 * 1024 * 1024) {
            console.warn('[AliyunSpeech] 降级到 Whisper API...');
            try {
                const { transcribeAudio } = await import('./llm');
                const text = await transcribeAudio(audioBlob);
                console.log('[AliyunSpeech] Whisper 降级成功:', text);
                return text;
            } catch (whisperError: any) {
                console.error('[AliyunSpeech] Whisper 降级也失败:', whisperError);
                throw new Error(`语音识别失败: ${error.message}; Whisper 降级失败: ${whisperError.message}`);
            }
        }

        throw error;
    }
}

/**
 * 检查本地 Whisper 模型是否存在
 */
export async function checkLocalWhisperModel(): Promise<{ exists: boolean; path: string; size_mb: number }> {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('check_whisper_model');
}

/**
 * 通过本地 Whisper 模型进行语音识别
 * 接收 PCM 音频 Blob，调用 Rust 后端 whisper 命令
 */
export async function transcribeWithLocalWhisper(audioBlob: Blob): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');

    console.log('[Whisper] Transcribing locally:', audioBlob.size, 'bytes');

    const arrayBuffer = await audioBlob.arrayBuffer();
    const fullData = new Uint8Array(arrayBuffer);

    // 如果是 WAV 格式，跳过 44 字节头
    const isWav = audioBlob.type === 'audio/wav' || audioBlob.type === 'audio/wave';
    const dataOffset = isWav ? 44 : 0;
    const audioData = Array.from(fullData.slice(dataOffset));

    console.log('[Whisper] PCM data:', audioData.length, 'bytes');

    const startTime = Date.now();
    const text = await invoke<string>('transcribe_local_whisper', {
        audioData: audioData,
    });

    console.log(`[Whisper] Transcription complete in ${Date.now() - startTime}ms`);
    console.log('[Whisper] Result:', text);
    return text;
}

/**
 * 实时语音识别服务类
 * 支持两种模式：
 * 1. 流式模式：通过 Rust 后端 WebSocket 实时流式识别（优先）
 * 2. 批量模式：录音结束后批量转写（降级方案）
 */
export class RealtimeSpeechService {
    private audioChunks: Int16Array[] = [];
    private onTextCallback?: (text: string, isFinal: boolean) => void;
    private isStarted: boolean = false;
    private isStreaming: boolean = false;
    private unlistenFn?: () => void;
    private finalizedText: string = '';
    private currentSentence: string = '';

    constructor() {
    }

    /**
     * 开始录音会话
     * 优先尝试流式模式，失败则降级为批量模式
     */
    async start(onText?: (text: string, isFinal: boolean) => void): Promise<void> {
        this.onTextCallback = onText;
        this.audioChunks = [];
        this.isStarted = true;
        this.isStreaming = false;
        this.finalizedText = '';
        this.currentSentence = '';

        // 测试模式不走流式
        if (isTestModeEnabled()) {
            console.log('[Speech] Test mode, using batch mode');
            return;
        }

        // 区域化模式不走流式
        const { isRegionalMode } = await import('./regionalClient');
        if (isRegionalMode()) {
            console.log('[Speech] Regional mode, using batch mode');
            return;
        }

        // 尝试启动流式识别
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');
            const config = getAliyunSpeechConfig();

            if (!config.apiKey) {
                console.log('[Speech] No API key, using batch mode');
                return;
            }

            // 监听实时文本事件
            this.unlistenFn = await listen<{ text: string; is_sentence_end: boolean }>(
                'speech-realtime-text',
                (event) => {
                    const { text, is_sentence_end } = event.payload;
                    if (is_sentence_end) {
                        this.finalizedText += text;
                        this.currentSentence = '';
                    } else {
                        this.currentSentence = text;
                    }
                    const displayText = this.finalizedText + this.currentSentence;
                    this.onTextCallback?.(displayText, is_sentence_end);
                }
            );

            await invoke('start_realtime_speech', { apiKey: config.apiKey });
            this.isStreaming = true;
            console.log('[Speech] Streaming session started');
        } catch (error: any) {
            console.warn('[Speech] Failed to start streaming, falling back to batch mode:', error);
            this.cleanupListener();
            this.isStreaming = false;
        }
    }

    /**
     * 接收音频数据块
     * 流式模式：直接发送到 Rust 后端
     * 批量模式：存储到缓冲区
     */
    sendAudio(pcmData: Int16Array): void {
        if (!this.isStarted) return;

        if (this.isStreaming) {
            // 流式模式：发送到 Rust 后端
            const bytes = Array.from(new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength));
            import('@tauri-apps/api/core').then(({ invoke }) => {
                invoke('send_speech_chunk', { audioData: bytes }).catch((e: any) => {
                    console.warn('[Speech] Send chunk failed:', e);
                });
            });
        } else {
            // 批量模式：收集音频
            this.audioChunks.push(new Int16Array(pcmData));
        }
    }

    /**
     * 结束录音并获取转写结果
     */
    async finish(enableWhisperFallback: boolean = true): Promise<string> {
        if (!this.isStarted) {
            return '';
        }

        this.isStarted = false;

        if (this.isStreaming) {
            // 流式模式：调用 stop 并等待最终结果
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const finalText = await invoke<string>('stop_realtime_speech');
                console.log('[Speech] Streaming final text:', finalText);
                this.onTextCallback?.(finalText, true);
                return finalText;
            } catch (error: any) {
                console.error('[Speech] Stop streaming failed:', error);
                // 返回已收集的文本
                const collected = this.finalizedText + this.currentSentence;
                if (collected) return collected;
                throw error;
            } finally {
                this.cleanupListener();
                this.isStreaming = false;
            }
        }

        // 批量模式：合并音频并转写
        const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const mergedData = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of this.audioChunks) {
            mergedData.set(chunk, offset);
            offset += chunk.length;
        }

        console.log('[Speech] Batch mode, total audio:', mergedData.length * 2, 'bytes');

        const audioBlob = new Blob([mergedData.buffer], { type: 'audio/pcm' });

        try {
            const modelStatus = await checkLocalWhisperModel();
            if (modelStatus.exists) {
                console.log('[Speech] Local whisper model found, using local transcription');
                const text = await transcribeWithLocalWhisper(audioBlob);
                this.onTextCallback?.(text, true);
                return text;
            }

            console.log('[Speech] No local model, using API transcription');
            const text = await transcribeWithAliyun(audioBlob, enableWhisperFallback);
            this.onTextCallback?.(text, true);
            return text;
        } catch (error: any) {
            console.error('[Speech] Transcription failed:', error);
            throw error;
        } finally {
            this.audioChunks = [];
        }
    }

    /**
     * 关闭会话
     */
    close(): void {
        this.isStarted = false;
        this.audioChunks = [];
        this.cleanupListener();
        if (this.isStreaming) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
                invoke('stop_realtime_speech').catch(() => {});
            });
            this.isStreaming = false;
        }
    }

    /**
     * 检查会话是否已开始
     */
    isConnected(): boolean {
        return this.isStarted;
    }

    private cleanupListener(): void {
        if (this.unlistenFn) {
            this.unlistenFn();
            this.unlistenFn = undefined;
        }
    }
}
