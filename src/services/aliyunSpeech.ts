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
 * 通过 Rust 后端进行实时语音识别
 * 后端会建立带认证 header 的 WebSocket 连接
 */
export async function transcribeWithAliyun(audioBlob: Blob): Promise<string> {
    // 检查测试模式
    if (isTestModeEnabled()) {
        console.log('[AliyunSpeech] TEST MODE: Returning sample text instead of real transcription');
        // 模拟延迟，让用户看到加载效果
        await new Promise(r => setTimeout(r, 500));
        return TEST_MODE_SAMPLE_TEXT;
    }

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
