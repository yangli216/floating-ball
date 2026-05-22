<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { getLatestAiTrace } from '@services/aiTrace';
import { submitUserFeedback, type UserFeedbackScreenshot, type FeedbackSeverity } from '@services/userFeedback';
import { isRegionalMode } from '@services/regionalClient';
import { trackClick, trackError, trackFormSubmit } from '@services/operationTracker';
import { formatUserFacingError } from '@shared/lib/errorMessages';

interface GeneralFeedbackDraftRecord {
  score: number;
  comment: string;
  selectedTags: string[];
  feedbackId?: string;
  submittedAt?: number;
  revision?: number;
}

const GENERAL_FEEDBACK_STORAGE_PREFIX = 'GENERAL_FEEDBACK_DRAFT_V1';

const props = withDefaults(defineProps<{
  variant?: 'embedded' | 'dialog';
  sourceModule?: string;
  consultationId?: string | null;
}>(), {
  variant: 'embedded',
  sourceModule: 'feedback',
  consultationId: null,
});

const emit = defineEmits<{
  close: [];
  submitted: [];
  screenshotCaptureStart: [];
  screenshotCaptureEnd: [];
}>();

const showToast = inject('showToast') as ((msg: string, type?: 'success' | 'error' | 'info') => void) | undefined;

const GENERAL_FEEDBACK_ISSUE_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'recommendation_quality', label: '推荐质量' },
  { key: 'data_accuracy', label: '数据准确性' },
  { key: 'workflow', label: '操作流程' },
  { key: 'stability', label: '系统稳定性' },
  { key: 'ui', label: '界面体验' },
  { key: 'other', label: '其他' },
];

const submitting = ref(false);
const score = ref(5);
const comment = ref('');
const screenshot = ref<UserFeedbackScreenshot | null>(null);
const capturingScreenshot = ref(false);
const selectedTags = ref<string[]>([]);
const showScreenshotPanel = ref(false);
const submittedFeedbackId = ref<string | null>(null);
const submittedAt = ref<number | null>(null);
const feedbackRevision = ref(0);

const feedbackScopeKey = computed(() => {
  const sourceModule = props.sourceModule || 'feedback';
  const consultationId = props.consultationId?.trim() || 'sessionless';
  return `${consultationId}::${sourceModule}`;
});

const hasExistingFeedback = computed(() => Boolean(submittedFeedbackId.value));

const existingFeedbackHint = computed(() => {
  if (!hasExistingFeedback.value) {
    return '';
  }

  const timeText = submittedAt.value
    ? new Date(submittedAt.value).toLocaleString('zh-CN', { hour12: false })
    : '';
  return timeText
    ? `已加载当前问诊该模块在 ${timeText} 提交的反馈，可直接修改后重新提交。`
    : '已加载当前问诊该模块的反馈，可直接修改后重新提交。';
});

const canSubmit = computed(() => {
  if (!isRegionalMode() || submitting.value) return false;
  return comment.value.trim().length > 0 || selectedTags.value.length > 0;
});

function toggleTag(key: string): void {
  const idx = selectedTags.value.indexOf(key);
  if (idx >= 0) {
    selectedTags.value.splice(idx, 1);
  } else {
    selectedTags.value.push(key);
  }
}

function isTagSelected(key: string): boolean {
  return selectedTags.value.includes(key);
}

function deriveSeverity(rating: number): FeedbackSeverity {
  if (rating <= 2) return 'high';
  if (rating === 3) return 'medium';
  return 'low';
}

function getDraftStorageKey(): string {
  return `${GENERAL_FEEDBACK_STORAGE_PREFIX}:${feedbackScopeKey.value}`;
}

function applyDraftRecord(record: GeneralFeedbackDraftRecord | null): void {
  score.value = record?.score ?? 5;
  comment.value = record?.comment ?? '';
  selectedTags.value = Array.isArray(record?.selectedTags) ? [...record.selectedTags] : [];
  screenshot.value = null;
  showScreenshotPanel.value = false;
  submittedFeedbackId.value = record?.feedbackId || null;
  submittedAt.value = typeof record?.submittedAt === 'number' ? record.submittedAt : null;
  feedbackRevision.value = typeof record?.revision === 'number' ? record.revision : 0;
}

function loadDraftRecord(): void {
  try {
    const raw = localStorage.getItem(getDraftStorageKey());
    if (!raw) {
      applyDraftRecord(null);
      return;
    }

    const parsed = JSON.parse(raw) as Partial<GeneralFeedbackDraftRecord>;
    applyDraftRecord({
      score: Number.isInteger(parsed.score) ? Number(parsed.score) : 5,
      comment: typeof parsed.comment === 'string' ? parsed.comment : '',
      selectedTags: Array.isArray(parsed.selectedTags)
        ? parsed.selectedTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        : [],
      feedbackId: typeof parsed.feedbackId === 'string' && parsed.feedbackId.trim() ? parsed.feedbackId.trim() : undefined,
      submittedAt: typeof parsed.submittedAt === 'number' ? parsed.submittedAt : undefined,
      revision: typeof parsed.revision === 'number' ? parsed.revision : undefined,
    });
  } catch {
    applyDraftRecord(null);
  }
}

function saveDraftRecord(record: GeneralFeedbackDraftRecord): void {
  localStorage.setItem(getDraftStorageKey(), JSON.stringify({
    score: record.score,
    comment: record.comment,
    selectedTags: [...record.selectedTags],
    feedbackId: record.feedbackId,
    submittedAt: record.submittedAt,
    revision: record.revision,
  } satisfies GeneralFeedbackDraftRecord));
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
    showToast?.(formatUserFacingError(error, { fallback: '选择图片失败，请稍后重试。' }), 'error');
  } finally {
    if (input) {
      input.value = '';
    }
  }
}

function clearScreenshot(): void {
  screenshot.value = null;
}

function buildSubmitComment(): string {
  const trimmed = comment.value.trim();
  if (trimmed) return trimmed;
  if (selectedTags.value.length > 0) {
    const labels = selectedTags.value.map(key => {
      const opt = GENERAL_FEEDBACK_ISSUE_OPTIONS.find(o => o.key === key);
      return opt?.label || key;
    });
    return `问题标签：${labels.join('、')}`;
  }
  return '';
}

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) {
    return;
  }

  submitting.value = true;
  const startedAt = Date.now();
  const trace = getLatestAiTrace();
  const previousFeedbackId = submittedFeedbackId.value;
  const nextRevision = feedbackRevision.value + 1;
  trackClick('feedback_submit_clicked', {
    hasScreenshot: !!screenshot.value,
    hasTrace: !!trace,
    score: score.value,
    tags: selectedTags.value,
    feedbackScopeKey: feedbackScopeKey.value,
    hasExistingFeedback: hasExistingFeedback.value,
  });

  try {
    const response = await submitUserFeedback({
      score: score.value,
      comment: buildSubmitComment(),
      screenshot: screenshot.value,
      sourceModule: props.sourceModule,
      kind: 'general',
      severity: deriveSeverity(score.value),
      tags: selectedTags.value.length > 0 ? selectedTags.value : undefined,
      chainContextOverride: {
        consultationId: props.consultationId || null,
        feedbackScopeKey: feedbackScopeKey.value,
        feedbackRevision: nextRevision,
        previousFeedbackId,
      },
    });

    trackFormSubmit('feedback_submit', {
      feedbackId: response.feedbackId,
      previousFeedbackId,
      feedbackScopeKey: feedbackScopeKey.value,
      feedbackRevision: nextRevision,
      hasTrace: !!trace?.traceId,
      traceId: trace?.traceId,
      score: score.value,
      tags: selectedTags.value,
    }, Date.now() - startedAt);

    const now = Date.now();
    saveDraftRecord({
      score: score.value,
      comment: comment.value,
      selectedTags: selectedTags.value,
      feedbackId: response.feedbackId,
      submittedAt: now,
      revision: nextRevision,
    });
    submittedFeedbackId.value = response.feedbackId;
    submittedAt.value = now;
    feedbackRevision.value = nextRevision;
    screenshot.value = null;
    showScreenshotPanel.value = false;
    showToast?.(previousFeedbackId ? '反馈已更新' : '反馈已提交到后台', 'success');
    emit('submitted');
  } catch (error) {
    trackError('feedback_submit_failed', error, {
      hasScreenshot: !!screenshot.value,
      traceId: trace?.traceId,
    });
    showToast?.(formatUserFacingError(error, { fallback: '反馈提交失败，请稍后重试。' }), 'error');
  } finally {
    submitting.value = false;
  }
}

watch(() => feedbackScopeKey.value, () => {
  loadDraftRecord();
});

onMounted(() => {
  loadDraftRecord();
});
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
      给本次体验打分、勾选问题类型，并在需要时附上简短说明，我们会自动关联最近的 AI 调用记录。
    </p>
    <p v-if="existingFeedbackHint" class="section-desc section-desc--highlight">
      {{ existingFeedbackHint }}
    </p>

    <div class="form-group score-group">
      <label>满意度评分</label>
      <div class="score-stars">
        <button
          v-for="value in 5"
          :key="value"
          class="star-btn"
          type="button"
          :class="{ active: value <= score }"
          :aria-label="`评分${value}`"
          @click="score = value"
        >
          <Icon :icon="value <= score ? 'lucide:star' : 'lucide:star'" :size="22" />
        </button>
        <span class="score-hint">{{ score >= 4 ? '满意' : score === 3 ? '一般' : '不满意' }}</span>
      </div>
    </div>

    <div class="form-group">
      <label>问题类型 <span class="optional">（可多选）</span></label>
      <div class="tag-row">
        <button
          v-for="opt in GENERAL_FEEDBACK_ISSUE_OPTIONS"
          :key="opt.key"
          class="tag-chip"
          type="button"
          :class="{ active: isTagSelected(opt.key) }"
          @click="toggleTag(opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="form-group">
      <label>补充说明 <span class="optional">（选填）</span></label>
      <textarea
        v-model="comment"
        class="feedback-textarea"
        rows="3"
        maxlength="500"
        placeholder="可简单描述场景或期望，便于后台定位。"
      />
      <div class="helper-text">{{ comment.trim().length }}/500</div>
    </div>

    <div class="form-group screenshot-group">
      <button
        class="link-btn screenshot-toggle"
        type="button"
        @click="showScreenshotPanel = !showScreenshotPanel"
      >
        <Icon :icon="showScreenshotPanel ? 'lucide:chevron-up' : 'lucide:image-plus'" :size="14" />
        {{ showScreenshotPanel ? '收起截图' : '附加截图（选填）' }}
      </button>
      <div v-if="showScreenshotPanel" class="screenshot-panel">
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
            选择图片
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
      </div>
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
.section-desc--highlight {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(14, 116, 144, 0.09);
  color: #0f5f75;
}

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

.optional {
  font-weight: normal;
  color: var(--medical-text-muted);
  font-size: 12px;
}

.score-stars {
  display: flex;
  align-items: center;
  gap: 6px;
}

.star-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #cbd5e1;
  transition: color 0.15s ease, transform 0.15s ease;
}

.star-btn:hover {
  transform: scale(1.08);
}

.star-btn.active {
  color: #f59e0b;
}

.score-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--medical-text-muted);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--medical-border-medium);
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tag-chip.active {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.08);
  color: var(--medical-primary);
}

.screenshot-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
}

.screenshot-panel {
  margin-top: 10px;
  padding: 12px;
  border: 1px dashed var(--medical-border-light);
  border-radius: 12px;
  background: var(--medical-bg-secondary);
}
</style>
