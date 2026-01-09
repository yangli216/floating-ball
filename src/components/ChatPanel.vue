<script setup lang="ts">
import { ref, computed } from "vue";
import type { ChatMessage } from "../services/llm";
import { chatStream, transcribeAudio } from "../services/llm";
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css'; // 引入代码高亮样式

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
  { role: "system", content: "你是一个专业的医疗助手，回答请专业、准确、亲切。" },
  { role: "assistant", content: "您好，我是您的智能医疗助手，请问有什么可以帮您？" }
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
  
  // 1. 构造用户消息
  const userMsg: ChatMessage = {
    role: "user",
    content: input.value.trim() || "",
    images: imageDataUrl.value ? [imageDataUrl.value] : undefined,
  };
  messages.value.push(userMsg);
  
  // 2. 立即清空输入框和图片
  input.value = "";
  imageDataUrl.value = null;
  scrollToBottom();

  try {
    // 3. 创建空的助手回复消息
    const assistantMsg = ref<ChatMessage>({ role: "assistant", content: "" });
    messages.value.push(assistantMsg.value);

    // 4. 调用流式接口
    await chatStream(messages.value.slice(0, -1), (chunk) => {
      assistantMsg.value.content += chunk;
      scrollToBottom();
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
</script>

<template>
  <div class="chat-panel">
    <div id="chat-scroll" class="chat-body">
      <div v-for="(m, idx) in visibleMessages" :key="idx" class="msg" :class="m.role">
        <div class="bubble">
          <div v-if="m.role === 'assistant'" class="markdown-body" v-html="renderMarkdown(m.content)"></div>
          <div v-else class="user-text">{{ m.content }}</div>
        </div>
      </div>
      <div v-if="imageDataUrl" class="preview">
        <img :src="imageDataUrl" alt="preview" />
      </div>
    </div>

    <div class="chat-footer">
      <div class="input-wrapper">
        <input
          class="text-input"
          type="text"
          v-model="input"
          placeholder="请输入您的问题或描述症状..."
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
          @keydown.enter="handleEnter"
        />
        <label class="action-btn" title="选择图片" aria-label="选择图片">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="6" width="18" height="14" rx="3" ry="3" fill="currentColor" opacity="0.12" />
            <rect x="3" y="6" width="18" height="14" rx="3" ry="3" fill="none" stroke="currentColor" stroke-width="1.5" />
            <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5" />
            <rect x="6.5" y="4" width="5" height="3" rx="1.2" ry="1.2" fill="currentColor" />
          </svg>
          <input type="file" accept="image/*" @change="handleFileChange" hidden />
        </label>
        <button class="action-btn" :class="{ recording }" @click="recording ? stopRecording() : startRecording()" title="语音输入" aria-label="语音输入">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="3.5" width="6" height="10" rx="3" ry="3" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M6 11.5c0 3.3 2.7 6 6 6s6-2.7 6-6" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M12 17.5v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <button class="send-btn" :disabled="sending" @click="handleSend">发送</button>
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
  color: var(--text-strong);
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
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}
.chat-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
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

.bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 18px;
  line-height: 1.5;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  position: relative;
}

.msg.assistant .bubble {
  background: rgba(255, 255, 255, 0.75);
  border-top-left-radius: 4px;
  color: var(--text-strong);
  border: 1px solid rgba(255,255,255,0.6);
}

.msg.user .bubble {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 4px 12px rgba(79, 167, 255, 0.25);
}

/* Markdown 样式 */
.markdown-body {
  font-size: 14px;
  line-height: 1.6;
}
.markdown-body :deep(p) { margin: 0 0 10px 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(pre) {
  background: #2d2d2d;
  color: #ccc;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 10px 0;
}
.markdown-body :deep(code) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  background: rgba(0,0,0,0.05);
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
  color: var(--accent-strong);
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
  border: 2px solid #fff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.chat-footer {
  flex-shrink: 0;
  padding: 12px 16px 20px 16px; /* 底部稍微留多一点 */
  background: linear-gradient(0deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255,255,255,0.5);
  display: flex;
  gap: 10px;
  align-items: center;
}

/* 输入框容器化，包含文件和语音按钮 */
.input-wrapper {
  flex: 1;
  height: 44px;
  background: #fff;
  border-radius: 22px;
  display: flex;
  align-items: center;
  padding: 0 4px 0 16px;
  box-shadow: 
    0 2px 6px rgba(0, 0, 0, 0.04),
    0 0 0 1px rgba(0, 0, 0, 0.04) inset;
  transition: box-shadow 0.2s ease;
}
.input-wrapper:focus-within {
  box-shadow: 
    0 4px 12px rgba(121, 194, 255, 0.25),
    0 0 0 1px var(--accent) inset;
}

.text-input {
  flex: 1;
  height: 100%;
  border: none;
  background: transparent;
  width: 100%;
  outline: none;
  font-size: 14px;
  color: var(--text-strong);
}
.text-input::placeholder { color: #94a3b8; }

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
  color: #64748b;
  transition: all 0.2s ease;
  margin-left: 2px;
}
.action-btn:hover {
  background: rgba(0,0,0,0.06);
  color: var(--accent-strong);
}
.action-btn.recording {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
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
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
  color: white;
  font-size: 0; /* 隐藏"发送"文字，只显示图标 */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(121, 194, 255, 0.4);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.send-btn:hover:not(:disabled) {
  transform: scale(1.05) rotate(-10deg);
  box-shadow: 0 6px 16px rgba(121, 194, 255, 0.5);
}
.send-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: grayscale(0.4);
}
/* 发送图标 */
.send-btn::after {
  content: "";
  width: 20px;
  height: 20px;
  background-color: currentColor;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='22' y1='2' x2='11' y2='13'%3E%3C/line%3E%3Cpolygon points='22 2 15 22 11 13 2 9 22 2'%3E%3C/polygon%3E%3C/svg%3E") no-repeat center/contain;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='22' y1='2' x2='11' y2='13'%3E%3C/line%3E%3Cpolygon points='22 2 15 22 11 13 2 9 22 2'%3E%3C/polygon%3E%3C/svg%3E") no-repeat center/contain;
  transform: translateX(-1px) translateY(1px); /* 视觉居中校正 */
}

/* 滚动条美化 */
.chat-body::-webkit-scrollbar {
  width: 4px;
}
.chat-body::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.1);
  border-radius: 2px;
}
.chat-body::-webkit-scrollbar-track {
  background: transparent;
}
</style>