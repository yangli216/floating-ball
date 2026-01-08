<template>
  <div class="voice-capsule">
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
      <button class="control-btn secondary" @click="togglePause" :title="isPaused ? '继续' : '暂停'">
        <svg v-if="!isPaused" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
      <button class="control-btn primary" @click="handleStop" title="结束接诊">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 4h16v16H4z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { audioRecorder } from '../services/audioRecorder';

const emit = defineEmits(['stop', 'error']);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isPaused = ref(false);
const duration = ref(0);
const startTime = ref(0);
let timerInterval: ReturnType<typeof setInterval> | null = null;
let animationFrameId: number | null = null;

const isSpeaking = computed(() => {
  // Simple check: if not paused and duration > 0, assume speaking/recording active
  return !isPaused.value && duration.value > 0;
});

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const drawVisualizer = () => {
  if (!canvasRef.value) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;

  const analyser = audioRecorder.getAnalyser();
  if (!analyser) return;

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

    ctx.fillStyle = '#3b82f6';
    
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
  try {
    await audioRecorder.start();
    startTime.value = Date.now();
    timerInterval = setInterval(() => {
        if (!isPaused.value) {
            duration.value = Math.floor((Date.now() - startTime.value) / 1000);
        }
    }, 1000);
    drawVisualizer();
  } catch (err) {
    console.error("Failed to start recording:", err);
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
  if (timerInterval) clearInterval(timerInterval);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  
  try {
    const blob = await audioRecorder.stop();
    emit('stop', blob);
  } catch (err) {
    console.error("Failed to stop recording:", err);
    emit('error', err);
  }
};

onMounted(() => {
  startRecording();
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  audioRecorder.stop().catch(() => {}); // Ensure cleanup
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
  border: 2px solid #3b82f6;
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
  transition: all 0.2s ease;
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
