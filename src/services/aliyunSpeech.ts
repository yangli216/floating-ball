/**
 * 阿里云 DashScope Paraformer 实时语音转写服务
 * 通过 Rust 后端代理 WebSocket 连接（绕过浏览器不能设置 WebSocket HTTP Headers 的限制）
 *
 * 官方文档: https://help.aliyun.com/zh/model-studio/websocket-for-paraformer-real-time-service
 */

import { transcribeAudio } from './llm';
import { getSpeechConfig } from './speechConfig';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    isRegionalMode,
    regionalPost,
    buildRegionalSpeechUploadPayload,
    createRegionalWebSocketUrl,
} from './regionalClient';
import { beginAiTrace, failAiTrace, finishAiTrace } from './aiTrace';

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
    const speechConfig = getSpeechConfig();
    return {
        apiKey: speechConfig.apiKey,
        model: speechConfig.model,
        sampleRate: speechConfig.sampleRate,
        format: speechConfig.format,
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
                model: config.model,
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
 * 通过 Rust 后端进行实时语音识别
 * 后端会建立带认证 header 的 WebSocket 连接
 */
export async function transcribeWithAliyun(
    audioBlob: Blob,
): Promise<string> {
    // 检查测试模式
    if (isTestModeEnabled()) {
        console.log('[AliyunSpeech] TEST MODE: Returning sample text instead of real transcription');
        // 模拟延迟，让用户看到加载效果
        await new Promise(r => setTimeout(r, 500));
        return TEST_MODE_SAMPLE_TEXT;
    }

    // 区域化模式：通过后端语音代理
    if (isRegionalMode()) {
        const speechConfig = getSpeechConfig();
        const scene = 'voice-consultation';
        const fileName = `${scene}-${Date.now()}.pcm`;
        const trace = beginAiTrace({
            channel: 'speech_realtime',
            scene,
            sourceModule: 'aliyunSpeech',
            model: speechConfig.model,
            requestSummary: `场景 ${scene}，文件 ${fileName}，格式 ${audioBlob.type || 'audio/pcm'}`,
        });
        try {
            const payload = await buildRegionalSpeechUploadPayload(audioBlob, {
                mimeType: audioBlob.type || 'audio/pcm',
                format: 'pcm',
                scene,
                fileName,
            });
            const resp = await regionalPost<{ text: string }>(
                '/v1/ai/speech/realtime',
                {
                    ...payload,
                    traceId: trace.traceId,
                    sourceModule: 'aliyunSpeech',
                    sessionId: trace.sessionId,
                }
            );
            finishAiTrace(trace.traceId, {
                success: true,
                responseSummary: resp.text ? resp.text.slice(0, 160) : '转写结果为空',
            });
            return resp.text;
        } catch (error) {
            failAiTrace(trace.traceId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    return await transcribeWithAliyunInternal(audioBlob);
}

export async function transcribeSpeech(audioBlob: Blob): Promise<string> {
    const speechConfig = getSpeechConfig();

    if (speechConfig.provider === 'openai-compatible') {
        return transcribeAudio(audioBlob, undefined, undefined, undefined, {
            apiKey: speechConfig.apiKey || undefined,
            audioBaseUrl: speechConfig.baseUrl,
            audioModel: speechConfig.model,
        });
    }

    return transcribeWithAliyun(audioBlob);
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
    private regionalSocket: WebSocket | null = null;
    private regionalFinalPromise: Promise<string> | null = null;
    private regionalFinalResolve?: (text: string) => void;
    private regionalFinalReject?: (error: Error) => void;
    private regionalFinalSettled: boolean = false;
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

        if (isRegionalMode()) {
            if (getSpeechConfig().provider !== 'aliyun-dashscope') {
                console.log('[Speech] Regional non-Aliyun provider configured, using batch mode');
                return;
            }
            try {
                await this.startRegionalStreaming();
                console.log('[Speech] Regional streaming session started');
            } catch (error) {
                console.warn('[Speech] Failed to start regional streaming, falling back to batch mode:', error);
                this.cleanupRegionalSocket();
                this.isStreaming = false;
            }
            return;
        }

        // 尝试启动流式识别
        try {
            const config = getAliyunSpeechConfig();

            if (getSpeechConfig().provider !== 'aliyun-dashscope') {
                console.log('[Speech] Non-Aliyun provider configured, using batch mode');
                return;
            }

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

            await invoke('start_realtime_speech', { apiKey: config.apiKey, model: config.model });
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
            if (this.regionalSocket) {
                // 保留区域化流式录音副本，WebSocket 中途失败时可在停止后批量兜底。
                this.audioChunks.push(new Int16Array(pcmData));
                const bytes = new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
                if (this.regionalSocket.readyState === WebSocket.OPEN) {
                    this.regionalSocket.send(bytes);
                }
                return;
            }
            // 流式模式：发送到 Rust 后端
            const bytes = Array.from(new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength));
            invoke('send_speech_chunk', { audioData: bytes }).catch((e: any) => {
                console.warn('[Speech] Send chunk failed:', e);
            });
        } else {
            // 批量模式：收集音频
            this.audioChunks.push(new Int16Array(pcmData));
        }
    }

    /**
     * 结束录音并获取转写结果
     */
    async finish(): Promise<string> {
        if (!this.isStarted) {
            return '';
        }

        this.isStarted = false;

        if (this.isStreaming) {
            if (this.regionalSocket) {
                return await this.finishRegionalStreaming();
            }
            // 流式模式：调用 stop 并等待最终结果
            try {
                const finalText = await invoke<string>('stop_realtime_speech');
                console.log('[Speech] Streaming final text:', finalText);
                // 防御：Rust 返回的 full_text 仅累积 sentence-end 文本，
                // 在用户按下结束的瞬间最后一个分句可能尚未 end，会导致返回值短于本地累积。
                // 因此与本地累积（finalizedText + currentSentence）合并，取最长者，确保不丢失任何已识别文本。
                const accumulated = `${this.finalizedText}${this.currentSentence}`;
                const remoteFinal = finalText || '';
                const result =
                    remoteFinal.length >= accumulated.length ? remoteFinal : accumulated;
                this.onTextCallback?.(result, true);
                return result;
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
        const audioBlob = this.buildBufferedAudioBlob();
        console.log('[Speech] Batch mode, total audio:', audioBlob.size, 'bytes');

        try {
            const text = await transcribeSpeech(audioBlob);
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
        if (this.isStreaming) {
            if (this.regionalSocket) {
                this.cleanupRegionalSocket();
            } else {
                this.cleanupListener();
                invoke('stop_realtime_speech').catch(() => {});
            }
            this.isStreaming = false;
            return;
        }
        this.cleanupListener();
        this.cleanupRegionalSocket();
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

    private async startRegionalStreaming(): Promise<void> {
        const socketUrl = await createRegionalWebSocketUrl('/v1/ai/speech/realtime/ws');
        const socket = new WebSocket(socketUrl);
        socket.binaryType = 'arraybuffer';
        this.regionalSocket = socket;
        this.regionalFinalSettled = false;
        this.regionalFinalPromise = new Promise<string>((resolve, reject) => {
            this.regionalFinalResolve = resolve;
            this.regionalFinalReject = reject;
        });

        socket.onmessage = (event) => {
            this.handleRegionalSocketMessage(event.data);
        };

        socket.onclose = () => {
            const accumulated = `${this.finalizedText}${this.currentSentence}`;
            if (!this.regionalFinalSettled && accumulated) {
                this.resolveRegionalFinal(accumulated);
            }
        };

        socket.onerror = () => {
            if (!this.regionalFinalSettled) {
                this.rejectRegionalFinal(new Error('区域化实时语音 WebSocket 连接异常'));
            }
        };

        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => {
                reject(new Error('区域化实时语音 WebSocket 连接超时'));
            }, 8000);
            socket.onopen = () => {
                window.clearTimeout(timer);
                this.isStreaming = true;
                resolve();
            };
            const originalOnError = socket.onerror;
            socket.onerror = (event) => {
                window.clearTimeout(timer);
                originalOnError?.call(socket, event);
                reject(new Error('区域化实时语音 WebSocket 连接失败'));
            };
        });
    }

    private handleRegionalSocketMessage(rawData: unknown): void {
        if (typeof rawData !== 'string') {
            return;
        }
        try {
            const payload = JSON.parse(rawData) as {
                type?: string;
                text?: string;
                isSentenceEnd?: boolean;
                message?: string;
            };

            if (payload.type === 'text') {
                const text = payload.text || '';
                if (payload.isSentenceEnd) {
                    this.finalizedText += text;
                    this.currentSentence = '';
                } else {
                    this.currentSentence = text;
                }
                this.onTextCallback?.(`${this.finalizedText}${this.currentSentence}`, Boolean(payload.isSentenceEnd));
                return;
            }

            if (payload.type === 'final') {
                const accumulated = `${this.finalizedText}${this.currentSentence}`;
                const remoteFinal = payload.text || '';
                this.resolveRegionalFinal(remoteFinal.length >= accumulated.length ? remoteFinal : accumulated);
                return;
            }

            if (payload.type === 'error') {
                this.rejectRegionalFinal(new Error(payload.message || '区域化实时语音识别失败'));
            }
        } catch (error) {
            this.rejectRegionalFinal(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private async finishRegionalStreaming(): Promise<string> {
        try {
            if (this.regionalSocket?.readyState === WebSocket.OPEN) {
                this.regionalSocket.send(JSON.stringify({ type: 'finish' }));
            }

            const accumulated = `${this.finalizedText}${this.currentSentence}`;
            const finalText = await Promise.race([
                this.regionalFinalPromise || Promise.resolve(accumulated),
                new Promise<string>((resolve) => window.setTimeout(() => resolve(accumulated), 30000)),
            ]);
            const result = finalText || accumulated;
            this.onTextCallback?.(result, true);
            return result;
        } catch (error: any) {
            const collected = this.finalizedText + this.currentSentence;
            if (collected) return collected;
            if (this.audioChunks.length > 0) {
                console.warn('[Speech] Regional streaming failed, falling back to batch transcription:', error);
                const fallbackText = await transcribeSpeech(this.buildBufferedAudioBlob());
                this.onTextCallback?.(fallbackText, true);
                return fallbackText;
            }
            throw error;
        } finally {
            this.audioChunks = [];
            this.cleanupRegionalSocket();
            this.isStreaming = false;
        }
    }

    private buildBufferedAudioBlob(): Blob {
        const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const mergedData = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of this.audioChunks) {
            mergedData.set(chunk, offset);
            offset += chunk.length;
        }
        return new Blob([mergedData.buffer], { type: 'audio/pcm' });
    }

    private resolveRegionalFinal(text: string): void {
        if (this.regionalFinalSettled) {
            return;
        }
        this.regionalFinalSettled = true;
        this.regionalFinalResolve?.(text);
    }

    private rejectRegionalFinal(error: Error): void {
        if (this.regionalFinalSettled) {
            return;
        }
        this.regionalFinalSettled = true;
        this.regionalFinalReject?.(error);
    }

    private cleanupRegionalSocket(): void {
        if (this.regionalSocket) {
            this.regionalSocket.onopen = null;
            this.regionalSocket.onmessage = null;
            this.regionalSocket.onerror = null;
            this.regionalSocket.onclose = null;
            if (this.regionalSocket.readyState === WebSocket.OPEN || this.regionalSocket.readyState === WebSocket.CONNECTING) {
                this.regionalSocket.close();
            }
        }
        this.regionalSocket = null;
        this.regionalFinalPromise = null;
        this.regionalFinalResolve = undefined;
        this.regionalFinalReject = undefined;
        this.regionalFinalSettled = false;
    }
}
