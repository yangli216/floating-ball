export class AudioRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = []; // Keep for fallback or other uses
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private scriptProcessor: ScriptProcessorNode | null = null;
    private audioBuffers: Float32Array[] = [];
    private isRecordingInternal: boolean = false;
    private recordingLength: number = 0;
    private sampleRate: number = 16000; // Force 16kHz for Whisper

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
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.timeEnd('[AudioRecorder] getUserMedia');

            // Setup Audio Context
            console.time('[AudioRecorder] AudioContext setup');
            // Use 16kHz context if possible, or resample later. simpler to just let context run and capture.
            // But Whisper.cpp expects 16kHz. 
            // We set context to 16000 if browser allows, otherwise we might need to downsample.
            // For now, let's try to constrain getUserMedia, or just assume we capture what we get.
            // Actually, setting latencyHint/sampleRate in AudioContext constructor is better.
            // Note: Setting sampleRate to 16000 may cause delay as browser resamples
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

            // Keep MediaRecorder for Visualizer fallback or if we ever want the WebM
            console.time('[AudioRecorder] MediaRecorder setup');
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };
            this.mediaRecorder.start();
            console.timeEnd('[AudioRecorder] MediaRecorder setup');

            this.isRecordingInternal = true;
            console.timeEnd('[AudioRecorder] total start');
        } catch (err) {
            console.error("[AudioRecorder] Error accessing microphone:", err);
            console.timeEnd('[AudioRecorder] total start');
            throw err;
        }
    }

    pause(): void {
        this.isRecordingInternal = false;
        if (this.audioContext) this.audioContext.suspend();
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.pause();
    }

    resume(): void {
        this.isRecordingInternal = true;
        if (this.audioContext) this.audioContext.resume();
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') this.mediaRecorder.resume();
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
        this.mediaRecorder = null;
        this.audioBuffers = [];
        this.audioChunks = [];
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
