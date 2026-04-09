<template>
  <div class="voice-capsule-wrapper" data-tauri-drag-region>
    <!-- Recording state: compact TTPlayer-style bar -->
    <template v-if="!isStopped">
      <!-- Row 1: avatar + waveform + timer + controls -->
      <div class="voice-capsule-bar">
        <div class="avatar-wrapper" :class="{ 'speaking': isSpeaking }">
          <img src="/robot-avatar.png" alt="AI Agent" />
        </div>

        <canvas ref="canvasRef" class="waveform" width="100" height="28"></canvas>
        <span class="timer">{{ formatTime(duration) }}</span>

        <button
          class="ctl-btn"
          @click="togglePause"
          :title="isPaused ? '继续' : '暂停'"
        >
          <Icon :icon="isPaused ? 'lucide:play' : 'lucide:pause'" size="16" aria-hidden="true" />
        </button>
        <button class="ctl-btn stop" @click="handleStop" title="结束接诊">
          <Icon icon="lucide:square" size="16" aria-hidden="true" />
        </button>
      </div>

      <!-- Row 2: Scrolling lyrics-style transcription -->
      <div class="lyrics-row" v-if="realtimeText">
        <div class="lyrics-scroll" ref="transcriptionRef">
          <span>{{ realtimeText }}</span>
        </div>
      </div>
    </template>

    <!-- Stopped state: review & edit -->
    <template v-else>
      <!-- Stopped header row -->
      <div class="voice-capsule-bar stopped-bar">
        <div class="avatar-wrapper">
          <img src="/robot-avatar.png" alt="AI Agent" />
        </div>
        <span class="stopped-label">录音完成</span>
        <span class="timer">{{ formatTime(duration) }}</span>
        <span class="spacer"></span>
        <button class="ctl-btn" @click="isExpanded = !isExpanded" :title="isExpanded ? '收起' : '展开'">
          <Icon :icon="isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="16" aria-hidden="true" />
        </button>
      </div>

      <!-- Collapsed: single-line preview -->
      <div class="lyrics-row preview" v-if="!isExpanded" @click="isExpanded = true">
        <div class="preview-text">{{ editableText || '未识别到文字' }}</div>
      </div>

      <!-- Expanded: editable -->
      <div class="expanded-area" v-if="isExpanded">
        <textarea
          class="text-editor"
          v-model="editableText"
          placeholder="未识别到文字，可手动输入..."
          rows="6"
        ></textarea>
      </div>

      <!-- Action buttons -->
      <div class="stopped-actions">
        <button class="action-btn cancel" @click="handleCancel">取消</button>
        <button class="action-btn confirm" @click="handleConfirm" :disabled="!editableText.trim()">确认</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { audioRecorder, getMicrophoneErrorMessage } from '../services/audioRecorder';
import { trackClick, trackError } from '../services/operationTracker';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';

// 获取当前主题的主色调
const getPrimaryColor = () => {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#0891B2';
};
import { RealtimeSpeechService } from '../services/aliyunSpeech';
import Icon from './Icon.vue';

const emit = defineEmits<{
  stop: [blob: Blob, transcriptionText: string];
  error: [error: any];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const transcriptionRef = ref<HTMLElement | null>(null);
const isPaused = ref(false);
const duration = ref(0);
const startTime = ref(0);
const realtimeText = ref('');
const prefersReducedMotion = ref(false);
const isStopped = ref(false);
const isExpanded = ref(false);
const editableText = ref('');
let stoppedBlob: Blob | null = null;

// Compact window dimensions
const CAPSULE_W = 360;
const CAPSULE_H_RECORDING = 80;
const CAPSULE_H_STOPPED = 140;      // collapsed preview + action buttons
const CAPSULE_H_EXPANDED = 248;     // expanded editor + action buttons

const resizeWindow = async (w: number, h: number) => {
  try {
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(w, h));
  } catch (e) {
    console.warn('[VoiceCapsule] Window resize failed:', e);
  }
};

// Resize window when entering stopped state
watch(isStopped, (stopped) => {
  if (stopped) {
    resizeWindow(CAPSULE_W, CAPSULE_H_STOPPED);
  }
});

// Resize window when expanding/collapsing text editor
watch(isExpanded, (expanded) => {
  resizeWindow(CAPSULE_W, expanded ? CAPSULE_H_EXPANDED : CAPSULE_H_STOPPED);
});

// Auto-scroll transcription text horizontally to always show the latest
watch(realtimeText, () => {
  nextTick(() => {
    if (transcriptionRef.value) {
      transcriptionRef.value.scrollLeft = transcriptionRef.value.scrollWidth;
    }
  });
});
let timerInterval: ReturnType<typeof setInterval> | null = null;
let animationFrameId: number | null = null;
let speechService: RealtimeSpeechService | null = null;

const isSpeaking = computed(() => {
  // Simple check: if not paused and duration > 0, assume speaking/recording active
  return !isPaused.value && duration.value > 0;
});

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const drawStaticVisualizer = () => {
  if (!canvasRef.value) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;

  const analyser = audioRecorder.getAnalyser();
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  // 静态显示 - 仅更新当前音量，无动画
  analyser.getByteFrequencyData(dataArray);

  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);

  // 计算平均音量
  const sum = dataArray.reduce((a, b) => a + b, 0);
  const average = sum / bufferLength;
  const percent = average / 255;

  // 显示单个音量条
  const barWidth = canvasRef.value.width * 0.6;
  const height = Math.max(4, percent * canvasRef.value.height);
  const x = (canvasRef.value.width - barWidth) / 2;
  const y = (canvasRef.value.height - height) / 2;

  ctx.fillStyle = getPrimaryColor();
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.roundRect(x, y, barWidth, height, 2);
  ctx.fill();
};

const drawVisualizer = () => {
  if (!canvasRef.value) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;

  const analyser = audioRecorder.getAnalyser();
  if (!analyser) return;

  // 如果用户偏好减少动画，使用静态显示
  if (prefersReducedMotion.value) {
    // 使用 setInterval 定期更新，而不是 requestAnimationFrame
    const updateInterval = setInterval(() => {
      if (isPaused.value) return;
      drawStaticVisualizer();
    }, 100); // 每 100ms 更新一次，足够显示音量变化

    // 清理函数
    return () => clearInterval(updateInterval);
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const draw = () => {
    if (isPaused.value) {
      animationFrameId = requestAnimationFrame(draw);
      return;
    }

    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvasRef.value!.width, canvasRef.value!.height);

    // Draw simplified waveform (bars)
    const barWidth = 3;
    const gap = 2;
    const totalBars = Math.floor(canvasRef.value!.width / (barWidth + gap));

    // Use a subset of frequency data for better visuals (low-mid frequencies)
    const step = Math.floor(bufferLength / totalBars);

    ctx.fillStyle = getPrimaryColor();

    for(let i = 0; i < totalBars; i++) {
      const dataIndex = i * step;
      const value = dataArray[dataIndex] || 0;
      const percent = value / 255;
      const height = Math.max(4, percent * canvasRef.value!.height);
      const y = (canvasRef.value!.height - height) / 2;

      // Dynamic color opacity based on volume
      ctx.globalAlpha = 0.3 + (percent * 0.7);

      // Draw rounded rect equivalent
      ctx.beginPath();
      ctx.roundRect((i * (barWidth + gap)), y, barWidth, height, 2);
      ctx.fill();
    }

    animationFrameId = requestAnimationFrame(draw);
  };

  draw();
};

const startRecording = async () => {
  console.time('[VoiceCapsule] startRecording');
  try {
    // 初始化语音服务，录音结束后自动检测使用本地模型或 API
    speechService = new RealtimeSpeechService();
    await speechService.start((text, _isFinal) => {
      realtimeText.value = text;
    });

    // 收集音频块用于录音结束后批量处理
    audioRecorder.setOnAudioChunk((pcmData) => {
      if (speechService?.isConnected()) {
        speechService.sendAudio(pcmData);
      }
    });

    console.log('[VoiceCapsule] Requesting microphone access...');
    await audioRecorder.start();
    console.log('[VoiceCapsule] Recorder started');
    startTime.value = Date.now();
    timerInterval = setInterval(() => {
        if (!isPaused.value) {
            duration.value = Math.floor((Date.now() - startTime.value) / 1000);
        }
    }, 1000);
    drawVisualizer();
    console.timeEnd('[VoiceCapsule] startRecording');
    trackClick('voice_recording_start');
  } catch (err) {
    console.error("[VoiceCapsule] Failed to start recording:", err);
    console.timeEnd('[VoiceCapsule] startRecording');
    trackError('voice_recording_start_failed', err);
    if (speechService) {
      speechService.close();
      speechService = null;
    }
    emit('error', getMicrophoneErrorMessage(err));
  }
};

const togglePause = () => {
  if (isPaused.value) {
    audioRecorder.resume();
  } else {
    audioRecorder.pause();
  }
  isPaused.value = !isPaused.value;
  trackClick('voice_recording_toggle_pause', { isPaused: isPaused.value });
};

const handleStop = async () => {
  console.log('[VoiceCapsule] handleStop called');
  trackClick('voice_recording_stop', { durationSeconds: duration.value });
  if (timerInterval) clearInterval(timerInterval);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  
  try {
    audioRecorder.setOnAudioChunk(undefined);
    console.log('[VoiceCapsule] Stopping recorder...');
    const blob = await audioRecorder.stop();
    console.log('[VoiceCapsule] Got blob:', blob.size, 'bytes');
    
    // 调试：保存录音到本地并提供回放
    await saveAudioForDebug(blob);
    
    // 获取实时语音服务的最终结果
    let transcription = '';
    if (speechService) {
      console.log('[VoiceCapsule] Finishing speech service...');
      transcription = await speechService.finish();
      console.log('[VoiceCapsule] Final transcription:', transcription);
      speechService = null;
    }
    
    // 进入已停止状态，允许医生审核/编辑文字
    stoppedBlob = blob;
    editableText.value = transcription || realtimeText.value;
    isStopped.value = true;
    console.log('[VoiceCapsule] Entered stopped state for review');
  } catch (err) {
    console.error("[VoiceCapsule] Failed to stop recording:", err);
    trackError('voice_recording_stop_failed', err);
    emit('error', err);
  }
};

const handleConfirm = () => {
  trackClick('voice_transcription_confirm');
  if (stoppedBlob) {
    emit('stop', stoppedBlob, editableText.value);
  }
};

const handleCancel = () => {
  trackClick('voice_transcription_cancel');
  // 重置状态，不发送结果
  isStopped.value = false;
  isExpanded.value = false;
  editableText.value = '';
  stoppedBlob = null;
  realtimeText.value = '';
  duration.value = 0;
  resizeWindow(CAPSULE_W, CAPSULE_H_RECORDING);
  // 重新开始录音
  startRecording();
};

/**
 * 调试功能：保存录音到本地并提供回放
 */
const saveAudioForDebug = async (blob: Blob) => {
  try {
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording_${timestamp}.wav`;
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    
    // 自动下载
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    console.log('[VoiceCapsule] Audio saved as:', filename);
    console.log('[VoiceCapsule] Audio URL for playback:', url);
    
    // 同时在控制台提供回放方式
    console.log('[VoiceCapsule] To play audio, run in console: new Audio("' + url + '").play()');
    
    // 可选：自动播放一次确认
    // const audio = new Audio(url);
    // audio.play();
    
    // 注意：URL.revokeObjectURL 不在这里调用，以便后续可以回放
  } catch (err) {
    console.error('[VoiceCapsule] Failed to save audio:', err);
  }
};

onMounted(() => {
  // 检查用户是否偏好减少动画
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion.value = mediaQuery.matches;

  // 监听偏好变化
  const handleMotionPreferenceChange = (e: MediaQueryListEvent) => {
    prefersReducedMotion.value = e.matches;
    console.log('[VoiceCapsule] Motion preference changed:', e.matches ? 'reduced' : 'normal');
  };
  mediaQuery.addEventListener('change', handleMotionPreferenceChange);

  // 启动录音
  startRecording();

  // 清理函数会在 onUnmounted 中处理
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  audioRecorder.setOnAudioChunk(undefined);
  audioRecorder.stop().catch(() => {});
  if (speechService) { speechService.close(); speechService = null; }

  // 清理媒体查询监听器
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  mediaQuery.removeEventListener('change', () => {});
});
</script>

<style scoped>
/* ===== Wrapper: compact floating bar ===== */
.voice-capsule-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.10);
  overflow: hidden;
}

/* ===== Top bar: single row, all inline ===== */
.voice-capsule-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  flex-shrink: 0;
}

.avatar-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.avatar-wrapper img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.avatar-wrapper.speaking::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px solid var(--color-primary);
  opacity: 0;
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.85); opacity: 1; }
  100% { transform: scale(1.35); opacity: 0; }
}

.waveform {
  flex: 1;
  min-width: 60px;
  height: 28px;
}

.timer {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  flex-shrink: 0;
  min-width: 36px;
  text-align: right;
}

.ctl-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.ctl-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.ctl-btn.stop {
  background: #ef4444;
  color: white;
}

.ctl-btn.stop:hover {
  background: #dc2626;
}

/* ===== Lyrics row: horizontal scroll single-line ===== */
.lyrics-row {
  padding: 0 10px 6px;
}

.lyrics-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scroll-behavior: smooth;
  font-size: 13px;
  line-height: 1.4;
  color: #334155;
  mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 8px), black);
  -webkit-mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 8px), black);
}

.lyrics-scroll::-webkit-scrollbar {
  display: none;
}

/* ===== Stopped state ===== */
.stopped-bar {
  border-bottom: 1px solid #f1f5f9;
}

.stopped-label {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.spacer {
  flex: 1;
}

/* Collapsed preview */
.lyrics-row.preview {
  cursor: pointer;
  padding: 4px 10px 6px;
}

.lyrics-row.preview:hover {
  background: #f8fafc;
}

.preview-text {
  font-size: 13px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Expanded editor */
.expanded-area {
  flex: 1;
  padding: 0 10px;
  min-height: 0;
  display: flex;
}

.text-editor {
  width: 100%;
  flex: 1;
  box-sizing: border-box;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
  resize: none;
  outline: none;
  font-family: inherit;
}

.text-editor:focus {
  border-color: var(--color-primary);
}

.text-editor::placeholder {
  color: #cbd5e1;
}

/* Action buttons */
.stopped-actions {
  display: flex;
  gap: 6px;
  padding: 6px 10px 8px;
  flex-shrink: 0;
}

.action-btn {
  flex: 1;
  height: 30px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn.cancel {
  background: #f1f5f9;
  color: #64748b;
}

.action-btn.cancel:hover {
  background: #e2e8f0;
}

.action-btn.confirm {
  background: var(--color-primary, #0891B2);
  color: white;
}

.action-btn.confirm:hover:not(:disabled) {
  filter: brightness(1.1);
}

.action-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
