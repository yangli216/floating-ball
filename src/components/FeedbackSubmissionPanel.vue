<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue';
import Icon from './Icon.vue';
import { getLatestAiTrace } from '../services/aiTrace';
import { submitUserFeedback, type UserFeedbackScreenshot } from '../services/userFeedback';
import { isRegionalMode } from '../services/regionalClient';
import { trackClick, trackError, trackFormSubmit } from '../services/operationTracker';

const props = withDefaults(defineProps<{
  variant?: 'embedded' | 'dialog';
  sourceModule?: string;
}>(), {
  variant: 'embedded',
  sourceModule: 'feedback',
});

const emit = defineEmits<{
  close: [];
  submitted: [];
  screenshotCaptureStart: [];
  screenshotCaptureEnd: [];
}>();

const showToast = inject('showToast') as ((msg: string, type?: 'success' | 'error' | 'info') => void) | undefined;

const submitting = ref(false);
const score = ref(5);
const comment = ref('');
const screenshot = ref<UserFeedbackScreenshot | null>(null);
const latestTraceVersion = ref(0);
const capturingScreenshot = ref(false);

const latestTrace = computed(() => {
  latestTraceVersion.value;
  return getLatestAiTrace();
});

const canSubmit = computed(() => {
  return isRegionalMode() && !submitting.value && comment.value.trim().length > 0;
});

const latestTraceSummary = computed(() => {
  const trace = latestTrace.value;
  if (!trace) {
    return '当前还没有可关联的 AI 调用记录，仍可提交通用反馈。';
  }

  const parts = [
    trace.channel === 'chat' ? '文本对话' : trace.channel === 'speech_transcribe' ? '语音转写' : '实时语音',
    trace.model || '模型待定',
    trace.requestSummary || '无请求摘要',
  ];

  if (trace.responseSummary) {
    parts.push(trace.responseSummary);
  }

  return parts.filter(Boolean).join(' / ');
});

function refreshTraceSummary(): void {
  latestTraceVersion.value += 1;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

async function captureBuiltInScreenshot(): Promise<void> {
  if (capturingScreenshot.value) {
    return;
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('当前环境不支持内置截图，请改用“选择截图”上传图片');
  }

  capturingScreenshot.value = true;
  try {
    emit('screenshotCaptureStart');
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 180));

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
      } as MediaTrackConstraints,
      audio: false,
    });

    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new Error('未获取到截图画面');
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      video.onerror = () => reject(new Error('截图预览初始化失败'));
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('截图画布初始化失败');
    }

    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');

    screenshot.value = {
      fileName: `feedback-capture-${Date.now()}.png`,
      mimeType: 'image/png',
      dataUrl,
    };

    trackClick('feedback_screenshot_captured', { width, height });
    stream.getTracks().forEach(item => item.stop());
    video.pause();
    video.srcObject = null;
  } catch (error) {
    trackError('feedback_screenshot_capture_failed', error);
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('你取消了截图授权，请重试并选择要截取的屏幕或窗口');
    }
    throw error instanceof Error ? error : new Error('内置截图失败');
  } finally {
    emit('screenshotCaptureEnd');
    capturingScreenshot.value = false;
  }
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  try {
    if (!file.type.startsWith('image/')) {
      throw new Error('只支持上传图片文件');
    }
    if (file.size > 3 * 1024 * 1024) {
      throw new Error('图片不能超过 3MB');
    }

    screenshot.value = {
      fileName: file.name,
      mimeType: file.type || 'image/png',
      dataUrl: await readFileAsDataUrl(file),
    };
    trackClick('feedback_screenshot_selected', { fileName: file.name, fileSize: file.size });
  } catch (error) {
    trackError('feedback_screenshot_selected_failed', error);
    showToast?.(error instanceof Error ? error.message : '选择图片失败', 'error');
  } finally {
    if (input) {
      input.value = '';
    }
  }
}

function clearScreenshot(): void {
  screenshot.value = null;
}

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) {
    return;
  }

  submitting.value = true;
  const startedAt = Date.now();
  trackClick('feedback_submit_clicked', {
    hasScreenshot: !!screenshot.value,
    hasTrace: !!latestTrace.value,
    score: score.value,
  });

  try {
    const response = await submitUserFeedback({
      score: score.value,
      comment: comment.value,
      screenshot: screenshot.value,
      sourceModule: props.sourceModule,
    });

    trackFormSubmit('feedback_submit', {
      feedbackId: response.feedbackId,
      hasTrace: !!latestTrace.value?.traceId,
      traceId: latestTrace.value?.traceId,
      score: score.value,
    }, Date.now() - startedAt);

    comment.value = '';
    score.value = 5;
    screenshot.value = null;
    showToast?.('反馈已提交到后台', 'success');
    refreshTraceSummary();
    emit('submitted');
  } catch (error) {
    trackError('feedback_submit_failed', error, {
      hasScreenshot: !!screenshot.value,
      traceId: latestTrace.value?.traceId,
    });
    showToast?.(error instanceof Error ? error.message : '反馈提交失败', 'error');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div :class="props.variant === 'dialog' ? 'feedback-dialog-panel' : 'settings-section'">
    <div class="section-header">
      <div class="section-header__title">
        <Icon icon="lucide:message-square-warning" :size="20" />
        <h3>问题反馈</h3>
      </div>
      <button
        v-if="props.variant === 'dialog'"
        class="dialog-close-btn"
        type="button"
        aria-label="关闭反馈弹层"
        @click="emit('close')"
      >
        <Icon icon="lucide:x" :size="18" />
      </button>
    </div>
    <p class="section-desc">
      上传截图、评分并描述问题；提交时会自动关联最近一次 AI 调用摘要，方便后台排查。
    </p>

    <div class="trace-card">
      <div class="trace-card__header">
        <span>最近一次 AI 调用</span>
        <button class="link-btn" type="button" @click="refreshTraceSummary">刷新上下文</button>
      </div>
      <div class="trace-card__body">
        <div class="trace-summary">{{ latestTraceSummary }}</div>
        <div v-if="latestTrace?.traceId" class="trace-meta">
          traceId: {{ latestTrace.traceId }}
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>满意度评分</label>
      <div class="score-row">
        <button
          v-for="value in 5"
          :key="value"
          class="score-btn"
          type="button"
          :class="{ active: value <= score }"
          @click="score = value"
        >
          <Icon :icon="value <= score ? 'lucide:star' : 'lucide:star-off'" :size="16" />
          {{ value }}
        </button>
      </div>
    </div>

    <div class="form-group">
      <label>反馈说明</label>
      <textarea
        v-model="comment"
        class="feedback-textarea"
        rows="5"
        maxlength="2000"
        placeholder="请描述出现了什么问题、在哪个场景出现、你期望看到什么结果。"
      />
      <div class="helper-text">{{ comment.trim().length }}/2000</div>
    </div>

    <div class="form-group">
      <label>截图上传</label>
      <div class="upload-row">
        <button
          class="action-btn"
          type="button"
          :disabled="capturingScreenshot"
          @click="captureBuiltInScreenshot"
        >
          <Icon :icon="capturingScreenshot ? 'lucide:loader-2' : 'lucide:monitor-up'" :size="16" :class="{ spin: capturingScreenshot }" />
          {{ capturingScreenshot ? '截图中...' : '内置截图' }}
        </button>
        <label class="action-btn" aria-label="上传截图">
          <Icon icon="lucide:image-plus" :size="16" />
          选择截图
          <input type="file" accept="image/*" hidden @change="handleFileChange" />
        </label>
        <button
          v-if="screenshot"
          class="action-btn secondary"
          type="button"
          @click="clearScreenshot"
        >
          <Icon icon="lucide:trash-2" :size="16" />
          移除
        </button>
      </div>
      <div v-if="screenshot" class="screenshot-preview">
        <img :src="screenshot.dataUrl" :alt="screenshot.fileName" />
        <div class="helper-text">{{ screenshot.fileName }}</div>
      </div>
      <div v-else class="helper-text">支持内置截图，也支持上传 PNG/JPG/WebP；单张不超过 3MB。</div>
    </div>

    <div v-if="!isRegionalMode()" class="info-banner warning">
      <Icon icon="lucide:triangle-alert" :size="18" />
      <p>当前不是区域化模式，反馈无法上传到后台。</p>
    </div>

    <button class="action-btn primary submit-btn" :disabled="!canSubmit" @click="handleSubmit">
      <Icon :icon="submitting ? 'lucide:loader-2' : 'lucide:send'" :size="18" :class="{ spin: submitting }" />
      {{ submitting ? '提交中...' : '提交反馈' }}
    </button>
  </div>
</template>

<style scoped>
.feedback-dialog-panel {
  padding: 22px 24px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 252, 0.98));
}

.section-header__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-close-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--medical-border-light);
  border-radius: 12px;
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  cursor: pointer;
}

.dialog-close-btn:hover {
  border-color: var(--medical-primary);
  color: var(--medical-primary);
}

.trace-card {
  padding: 14px 16px;
  border: 1px solid var(--medical-border-light);
  border-radius: 14px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef8fb 100%);
  margin-bottom: 18px;
}

.trace-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--medical-text-muted);
}

.trace-card__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trace-summary {
  font-size: 13px;
  line-height: 1.6;
  color: var(--medical-text-secondary);
}

.trace-meta,
.helper-text {
  font-size: 12px;
  color: var(--medical-text-muted);
}

.score-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.score-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--medical-border-medium);
  border-radius: 999px;
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.score-btn.active {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.08);
  color: var(--medical-primary);
}

.feedback-textarea {
  width: 100%;
  resize: vertical;
  min-height: 120px;
  padding: 12px 14px;
  border: 1px solid var(--medical-border-medium);
  border-radius: 14px;
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.feedback-textarea:focus {
  outline: none;
  border-color: var(--medical-primary);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
}

.upload-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--medical-border-medium);
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  cursor: pointer;
}

.action-btn.secondary {
  background: var(--medical-bg-secondary);
}

.action-btn.primary {
  border-color: transparent;
  background: var(--medical-primary);
  color: #fff;
}

.submit-btn {
  margin-top: 12px;
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--medical-primary);
  cursor: pointer;
  font-size: 12px;
}

.screenshot-preview {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--medical-border-light);
  border-radius: 14px;
  background: var(--medical-bg-primary);
}

.screenshot-preview img {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 10px;
  background: #f1f5f9;
}

.info-banner.warning {
  margin-top: 18px;
  background: #fff7ed;
  color: #9a3412;
}
</style>
