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

export function getAliyunSpeechConfig(): AliyunSpeechConfig {
    const apiKey = localStorage.getItem('DASHSCOPE_API_KEY') || import.meta.env.VITE_DASHSCOPE_API_KEY || '';
    return {
        apiKey,
        model: 'paraformer-realtime-v2',
        sampleRate: 16000,
        format: 'pcm'
    };
}

/**
 * 通过 Rust 后端进行实时语音识别
 * 后端会建立带认证 header 的 WebSocket 连接
 */
export async function transcribeWithAliyun(audioBlob: Blob): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    const config = getAliyunSpeechConfig();

    if (!config.apiKey) {
        throw new Error('DashScope API Key 未配置。请在设置中添加阿里云 API Key。');
    }

    console.log('[AliyunSpeech] Transcribing via Rust backend:', audioBlob.size, 'bytes');
    const startTime = Date.now();

    // 转换 Blob 为 Uint8Array
    const arrayBuffer = await audioBlob.arrayBuffer();
    const fullData = new Uint8Array(arrayBuffer);

    // 跳过 WAV 头（44字节）如果是 WAV 格式
    const isWav = audioBlob.type === 'audio/wav' || audioBlob.type === 'audio/wave';
    const dataOffset = isWav ? 44 : 0;
    const audioData = Array.from(fullData.slice(dataOffset));

    console.log('[AliyunSpeech] Audio data (PCM):', audioData.length, 'bytes');

    try {
        const text = await invoke<string>('transcribe_realtime_aliyun', {
            apiKey: config.apiKey,
            audioData: audioData
        });

        console.log(`[AliyunSpeech] Transcription complete in ${Date.now() - startTime}ms`);
        console.log('[AliyunSpeech] Result:', text);
        return text;
    } catch (error: any) {
        console.error('[AliyunSpeech] Error:', error);
        throw new Error(error?.message || error || '语音识别失败');
    }
}

/**
 * 实时语音识别服务类（简化版）
 * 由于后端代理模式，这里不再需要前端管理 WebSocket 连接
 * 直接在录音结束后调用 transcribeWithAliyun 即可
 */
export class RealtimeSpeechService {
    private config: AliyunSpeechConfig;
    private audioChunks: Int16Array[] = [];
    private onTextCallback?: (text: string, isFinal: boolean) => void;
    private isStarted: boolean = false;

    constructor(config?: Partial<AliyunSpeechConfig>) {
        this.config = { ...getAliyunSpeechConfig(), ...config };
    }

    /**
     * 开始录音会话（初始化状态）
     */
    async start(onText?: (text: string, isFinal: boolean) => void): Promise<void> {
        if (!this.config.apiKey) {
            throw new Error('DashScope API Key 未配置。请在设置中添加阿里云 API Key。');
        }

        this.onTextCallback = onText;
        this.audioChunks = [];
        this.isStarted = true;
        console.log('[AliyunSpeech] Session started (collecting audio)');
    }

    /**
     * 接收音频数据块（存储到缓冲区）
     */
    sendAudio(pcmData: Int16Array): void {
        if (!this.isStarted) return;
        this.audioChunks.push(new Int16Array(pcmData));
    }

    /**
     * 结束录音并获取转写结果
     */
    async finish(): Promise<string> {
        if (!this.isStarted) {
            return '';
        }

        this.isStarted = false;

        // 合并所有音频块
        const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const mergedData = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of this.audioChunks) {
            mergedData.set(chunk, offset);
            offset += chunk.length;
        }

        console.log('[AliyunSpeech] Total audio collected:', mergedData.length * 2, 'bytes');

        // 转换为 Blob 用于调用后端
        const audioBlob = new Blob([mergedData.buffer], { type: 'audio/pcm' });

        try {
            const text = await transcribeWithAliyun(audioBlob);
            this.onTextCallback?.(text, true);
            return text;
        } catch (error: any) {
            console.error('[AliyunSpeech] Finish error:', error);
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
    }

    /**
     * 检查会话是否已开始
     */
    isConnected(): boolean {
        return this.isStarted;
    }
}
