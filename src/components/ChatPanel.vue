<script setup lang="ts">
import { ref, computed, inject } from "vue";
import type { ChatMessage } from "../services/llm";
import { chatStream, transcribeAudio } from "../services/llm";
import { PROMPTS } from "../prompts";
import { feedbackService } from "../services/feedback";
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css'; // 引入代码高亮样式
import Icon from "./Icon.vue";

// 注入 showToast 方法
const showToast = inject<(message: string) => void>('showToast');

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: function (str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' +
               hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
               '</code></pre>';
      } catch (__) {}
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
  }
});

// Markdown 渲染函数
const renderMarkdown = (content: string) => {
  return md.render(content);
};

const messages = ref<ChatMessage[]>([
  { role: "system", content: PROMPTS.chat.defaultSystem },
  { role: "assistant", content: PROMPTS.chat.welcomeMessage }
]);

const visibleMessages = computed(() => messages.value.filter(m => m.role !== 'system'));
const input = ref("");
const imageDataUrl = ref<string | null>(null);
const sending = ref(false);

// 录音相关
const recording = ref(false);
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

function scrollToBottom() {
  requestAnimationFrame(() => {
    const el = document.getElementById("chat-scroll");
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });
}

async function handleSend() {
  if (!input.value.trim() && !imageDataUrl.value) return;
  sending.value = true;

  const startTime = Date.now();

  // 1. 构造用户消息
  const userMsg: ChatMessage = {
    role: "user",
    content: input.value.trim() || "",
    images: imageDataUrl.value ? [imageDataUrl.value] : undefined,
  };
  messages.value.push(userMsg);

  // 2. 立即清空输入框和图片
  const userContent = input.value.trim();
  input.value = "";
  imageDataUrl.value = null;
  scrollToBottom();

  try {
    // 3. 保存用户消息到数据库
    const userMessageId = await feedbackService.saveMessage({
      role: 'user',
      content: userContent,
      images: userMsg.images,
    });
    userMsg.messageId = userMessageId;

    // 4. 创建空的助手回复消息
    const assistantMsg = ref<ChatMessage>({ role: "assistant", content: "" });
    messages.value.push(assistantMsg.value);

    // 5. 调用流式接口
    await chatStream(messages.value.slice(0, -1), (chunk) => {
      assistantMsg.value.content += chunk;
      scrollToBottom();
    });

    // 6. 计算性能指标
    const latencyMs = Date.now() - startTime;
    const tokenCount = Math.ceil(assistantMsg.value.content.length / 2); // 简单估算

    // 7. 保存助手消息到数据库
    const assistantMessageId = await feedbackService.saveMessage({
      role: 'assistant',
      content: assistantMsg.value.content,
      tokenCount,
      latencyMs,
    });
    assistantMsg.value.messageId = assistantMessageId;
    assistantMsg.value.tokenCount = tokenCount;
    assistantMsg.value.latencyMs = latencyMs;

    // 8. 记录性能指标
    await feedbackService.recordMetric({
      metricType: 'llm_latency',
      metricValue: latencyMs,
      unit: 'ms',
    });

  } catch (err) {
    messages.value.push({ role: "assistant", content: `抱歉，调用模型失败：${(err as Error).message}` });
    scrollToBottom();
  } finally {
    sending.value = false;
  }
}

// IME 状态处理
const isComposing = ref(false);

function onCompositionStart() {
  isComposing.value = true;
}

function onCompositionEnd() {
  // 使用 setTimeout 延迟重置，确保在 Enter 键（keydown）触发时 isComposing 仍为 true
  setTimeout(() => {
    isComposing.value = false;
  }, 0);
}

function handleEnter(e: KeyboardEvent) {
  if (isComposing.value || e.isComposing) return;
  handleSend();
}

function handleFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl.value = reader.result as string;
  };
  reader.readAsDataURL(file);
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) audioChunks.push(evt.data);
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      recording.value = false;
      try {
        const text = await transcribeAudio(blob);
        input.value = text;
      } catch (err) {
        messages.value.push({ role: "assistant", content: `语音识别失败：${(err as Error).message}` });
        scrollToBottom();
      }
    };
    mediaRecorder.start();
    recording.value = true;
  } catch (err) {
    messages.value.push({ role: "assistant", content: `无法开始录音：${(err as Error).message}` });
    scrollToBottom();
  }
}

function stopRecording() {
  mediaRecorder?.stop();
}

// 处理反馈
async function handleFeedback(messageId: string, feedbackType: 'positive' | 'negative') {
  try {
    const sessionId = feedbackService.getCurrentSessionId();
    if (!sessionId) {
      console.warn('[ChatPanel] No active session for feedback');
      return;
    }

    await feedbackService.saveFeedback({
      sessionId,
      targetType: 'message',
      targetId: messageId,
      feedbackType,
      rating: feedbackType === 'positive' ? 5 : 1,
    });

    showToast?.(feedbackType === 'positive' ? '感谢您的反馈！' : '我们会继续改进');
    console.log(`[ChatPanel] Feedback saved: ${feedbackType} for message ${messageId}`);
  } catch (error) {
    console.error('[ChatPanel] Failed to save feedback:', error);
    showToast?.('保存反馈失败，请稍后再试');
  }
}
</script>

<template>
  <div class="chat-panel">
    <div id="chat-scroll" class="chat-body">
      <div v-for="(m, idx) in visibleMessages" :key="idx" class="msg" :class="m.role">
        <div class="msg-container">
          <div class="bubble">
            <div v-if="m.role === 'assistant'" class="markdown-body" v-html="renderMarkdown(m.content)"></div>
            <div v-else class="user-text">{{ m.content }}</div>
          </div>
          <!-- 反馈按钮（仅助手消息） -->
          <div v-if="m.role === 'assistant' && m.messageId" class="feedback-buttons">
            <button
              class="feedback-btn"
              @click="handleFeedback(m.messageId!, 'positive')"
              title="有用"
              aria-label="标记此回复有用"
            >
              <Icon icon="lucide:thumbs-up" class="icon" size="16" aria-hidden="true" />
            </button>
            <button
              class="feedback-btn"
              @click="handleFeedback(m.messageId!, 'negative')"
              title="无用"
              aria-label="标记此回复无用"
            >
              <Icon icon="lucide:thumbs-down" class="icon" size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div v-if="imageDataUrl" class="preview">
        <img :src="imageDataUrl" alt="preview" />
      </div>
    </div>

    <div class="chat-footer">
      <div class="input-wrapper">
        <label for="chat-input" class="sr-only">输入消息</label>
        <input
          id="chat-input"
          class="text-input"
          type="text"
          v-model="input"
          placeholder="请输入您的问题或描述症状..."
          aria-label="输入您的问题或描述症状"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
          @keydown.enter="handleEnter"
        />
        <label class="action-btn" title="选择图片" aria-label="选择图片">
          <Icon icon="lucide:image" class="icon" size="18" aria-hidden="true" />
          <input type="file" accept="image/*" @change="handleFileChange" hidden />
        </label>
        <button
          class="action-btn"
          :class="{ recording }"
          @click="recording ? stopRecording() : startRecording()"
          :aria-label="recording ? '停止录音' : '开始语音输入'"
          :title="recording ? '停止录音' : '语音输入'"
        >
          <Icon :icon="recording ? 'lucide:mic-off' : 'lucide:mic'" class="icon" size="18" aria-hidden="true" />
        </button>
      </div>
      <button
        class="send-btn"
        :disabled="sending"
        :aria-busy="sending"
        :aria-label="sending ? '发送中...' : '发送消息'"
        @click="handleSend"
      >
        <Icon v-if="sending" icon="lucide:loader-2" class="animate-spin" size="18" aria-hidden="true" />
        <Icon v-else icon="lucide:send" size="18" aria-hidden="true" />
      </button>
    </div>
  </div>

</template>

<style scoped>
.chat-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent; /* 让父容器背景透过来 */
  color: var(--color-text-strong);
}

.chat-body {
  flex: 1;
  padding: 12px 16px;
  overflow-y: auto;
  overflow-x: hidden; /* 防止横向滚动 */
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Custom Scrollbar */
.chat-body::-webkit-scrollbar {
  width: 6px;
}
.chat-body::-webkit-scrollbar-track {
  background: transparent;
}
.chat-body::-webkit-scrollbar-thumb {
  background: var(--color-border-medium);
  border-radius: 3px;
}
.chat-body::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-strong);
}

/* 消息入场动画 */
.msg {
  display: flex;
  width: 100%;
  animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform, opacity;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg.user { justify-content: flex-end; }
.msg.assistant { justify-content: flex-start; }

.msg-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 85%;
}

.msg.user .msg-container {
  align-items: flex-end;
}

.bubble {
  padding: 10px 14px;
  border-radius: 18px;
  line-height: 1.5;
  font-size: 14px;
  box-shadow: var(--shadow-sm);
  position: relative;
  width: 100%;
}

.msg.assistant .bubble {
  background: var(--surface-glass);
  border-top-left-radius: 4px;
  color: var(--color-text-strong);
  border: 1px solid var(--color-border-light);
}

.msg.user .bubble {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  border-bottom-right-radius: 4px;
  box-shadow: 0 4px 12px var(--color-primary-200);
}

/* Markdown 样式 */
.markdown-body {
  font-size: 14px;
  line-height: 1.6;
}
.markdown-body :deep(p) { margin: 0 0 10px 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(pre) {
  background: var(--color-background-gray);
  color: var(--color-text-primary);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 10px 0;
  border: 1px solid var(--color-border-light);
}
.markdown-body :deep(code) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  background: var(--color-primary-50);
  padding: 2px 4px;
  border-radius: 4px;
}
.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
.markdown-body :deep(ul), .markdown-body :deep(ol) {
  padding-left: 20px;
  margin: 10px 0;
}
.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}
.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.user-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  word-break: break-word; /* 防止长词溢出 */
  display: none; /* 隐藏旧的 pre */
}

/* 预览图 */
.preview {
  margin-top: 6px;
  align-self: flex-end;
}
.preview img {
  max-width: 120px;
  max-height: 120px;
  border-radius: 12px;
  border: 2px solid var(--color-border-light);
  box-shadow: var(--shadow-md);
}

.chat-footer {
  flex-shrink: 0;
  padding: 12px 16px 20px 16px; /* 底部稍微留多一点 */
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--color-border-light);
  display: flex;
  gap: 10px;
  align-items: center;
}

/* 输入框容器化，包含文件和语音按钮 */
.input-wrapper {
  flex: 1;
  height: 44px;
  background: var(--color-background-white);
  border-radius: 22px;
  display: flex;
  align-items: center;
  padding: 0 4px 0 16px;
  border: 1px solid transparent;
  transition: all var(--duration-normal) var(--ease-out);
}
.input-wrapper:hover {
  border-color: var(--color-border-light);
}
.input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-200);
  background: var(--color-background-white);
}

.text-input {
  flex: 1;
  height: 100%;
  border: none;
  background: transparent;
  width: 100%;
  outline: none;
  font-size: 14px;
  color: var(--color-text-strong);
}
.text-input::placeholder { color: var(--color-text-muted); }

/* 禁用 input 自身的所有 focus 样式，因为焦点效果已应用在 input-wrapper 上 */
.text-input:focus,
.text-input:focus-visible {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
}

.action-btn {
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition: all var(--duration-normal) var(--ease-out);
  margin-left: 2px;
}
.action-btn:hover {
  background: var(--color-primary-50);
  color: var(--color-primary);
}
.action-btn.recording {
  color: var(--color-error);
  background: var(--color-error-bg);
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

.action-btn input { display: none; }
.action-btn .icon { width: 20px; height: 20px; }

.send-btn {
  height: 44px;
  width: 44px; /* 圆形发送按钮 */
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--color-cta) 0%, var(--color-cta-dark) 100%);
  color: white;
  font-size: 0; /* 隐藏"发送"文字，只显示图标 */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px var(--color-cta-200);
  transition: all var(--duration-normal) cubic-bezier(0.34, 1.56, 0.64, 1);
}
.send-btn:hover:not(:disabled) {
  transform: scale(1.05) rotate(-10deg);
  box-shadow: 0 6px 16px var(--color-cta-200);
}
.send-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: grayscale(0.4);
}

/* 滚动条美化 - 使用上方的统一样式 */

/* 反馈按钮 */
.feedback-buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out);
}

.msg:hover .feedback-buttons {
  opacity: 1;
}

.feedback-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--surface-glass-strong);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition: all var(--duration-normal) var(--ease-out);
  box-shadow: var(--shadow-sm);
}

.feedback-btn:hover {
  background: var(--color-background-white);
  color: var(--color-primary);
  transform: scale(1.1);
  box-shadow: var(--shadow-md);
}

.feedback-btn:active {
  transform: scale(0.95);
}

.feedback-btn .icon {
  width: 16px;
  height: 16px;
}

.feedback-btn:hover:first-child {
  color: var(--color-success); /* 绿色 - 点赞 */
}

.feedback-btn:hover:last-child {
  color: var(--color-error); /* 红色 - 踩 */
}

/* Loading 动画 - 发送按钮 */
.send-btn .animate-spin {
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Reduced Motion 支持 */
@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    animation: none;
  }

  .msg {
    animation: none;
  }
}
</style>