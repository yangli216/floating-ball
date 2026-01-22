<template>
  <div class="voice-capsule" data-tauri-drag-region>
    <!-- Left: Avatar -->
    <div class="avatar-section">
      <div class="avatar-wrapper" :class="{ 'speaking': isSpeaking }">
        <img src="/robot-avatar.png" alt="AI Agent" />
      </div>
    </div>

    <!-- Center: Visualizer -->
    <div class="visualizer-section">
      <canvas ref="canvasRef" width="160" height="40"></canvas>
      <div class="timer">{{ formatTime(duration) }}</div>
    </div>

    <!-- Right: Controls -->
    <div class="controls-section">
      <button
        class="control-btn secondary"
        @click="togglePause"
        :aria-label="isPaused ? '继续录音' : '暂停录音'"
        :title="isPaused ? '继续' : '暂停'"
      >
        <Icon :icon="isPaused ? 'lucide:play' : 'lucide:pause'" size="20" aria-hidden="true" />
      </button>
      <button
        class="control-btn primary"
        @click="handleStop"
        aria-label="结束接诊并保存录音"
        title="结束接诊"
      >
        <Icon icon="lucide:square" size="20" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { audioRecorder } from '../services/audioRecorder';

// 获取当前主题的主色调
const getPrimaryColor = () => {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#0891B2';
};
import { RealtimeSpeechService, getAliyunSpeechConfig } from '../services/aliyunSpeech';
import Icon from './Icon.vue';

const emit = defineEmits<{
  stop: [blob: Blob, transcriptionText: string];
  error: [error: any];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isPaused = ref(false);
const duration = ref(0);
const startTime = ref(0);
const realtimeText = ref(''); // 实时识别文本
const prefersReducedMotion = ref(false);
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
    // 检查 API Key 并初始化实时语音服务
    const config = getAliyunSpeechConfig();
    if (config.apiKey) {
      speechService = new RealtimeSpeechService();
      console.log('[VoiceCapsule] Starting realtime speech service...');
      await speechService.start((text, _isFinal) => {
        realtimeText.value = text;
        console.log('[VoiceCapsule] Realtime:', text.substring(0, 30) + '...');
      });
      // 设置音频回调
      audioRecorder.setOnAudioChunk((pcmData) => {
        if (speechService?.isConnected()) {
          speechService.sendAudio(pcmData);
        }
      });
    } else {
      console.warn('[VoiceCapsule] No API Key, realtime disabled');
    }
    
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
  } catch (err) {
    console.error("[VoiceCapsule] Failed to start recording:", err);
    console.timeEnd('[VoiceCapsule] startRecording');
    emit('error', err);
  }
};

const togglePause = () => {
  if (isPaused.value) {
    audioRecorder.resume();
    // Adjust start time to account for pause duration? 
    // For simplicity, just resuming timer flow relative to now not implemented perfectly here but sufficient for demo
  } else {
    audioRecorder.pause();
  }
  isPaused.value = !isPaused.value;
};

const handleStop = async () => {
  console.log('[VoiceCapsule] handleStop called');
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
    
    emit('stop', blob, transcription);
    console.log('[VoiceCapsule] Emitted stop with transcription');
  } catch (err) {
    console.error("[VoiceCapsule] Failed to stop recording:", err);
    emit('error', err);
  }
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
.voice-capsule {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.avatar-section {
  display: flex;
  align-items: center;
}

.avatar-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.avatar-wrapper img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.avatar-wrapper.speaking::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--color-primary);
  opacity: 0;
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.4); opacity: 0; }
}

.visualizer-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0 16px;
  height: 100%;
}

.timer {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  margin-top: 4px;
}

.controls-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.control-btn svg {
  width: 20px;
  height: 20px;
}

.control-btn.secondary {
  background: #f1f5f9;
  color: #64748b;
}

.control-btn.secondary:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.control-btn.primary {
  background: #ef4444;
  color: white;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.control-btn.primary:hover {
  background: #dc2626;
  transform: scale(1.05);
}

.control-btn:active {
  transform: scale(0.95);
}
</style>
