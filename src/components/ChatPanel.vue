<script setup lang="ts">
import { ref } from "vue";
import type { ChatMessage } from "../services/llm";
import { chat, transcribeAudio } from "../services/llm";

const messages = ref<ChatMessage[]>([
  { role: "system", content: "你是一个桌面智能助手，简洁回答并给出必要步骤。" },
]);
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
  try {
    const userMsg: ChatMessage = {
      role: "user",
      content: input.value.trim() || "",
      images: imageDataUrl.value ? [imageDataUrl.value] : undefined,
    };
    messages.value.push(userMsg);
    scrollToBottom();

    const reply = await chat(messages.value);
    messages.value.push({ role: "assistant", content: reply });
    input.value = "";
    imageDataUrl.value = null;
    scrollToBottom();
  } catch (err) {
    messages.value.push({ role: "assistant", content: `抱歉，调用模型失败：${(err as Error).message}` });
    scrollToBottom();
  } finally {
    sending.value = false;
  }
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
      <div v-for="(m, idx) in messages" :key="idx" class="msg" :class="m.role">
        <div class="bubble">
          <pre>{{ m.content }}</pre>
        </div>
      </div>
      <div v-if="imageDataUrl" class="preview">
        <img :src="imageDataUrl" alt="preview" />
      </div>
    </div>

    <div class="chat-footer">
      <input
        class="text-input"
        type="text"
        v-model="input"
        placeholder="输入你的问题..."
        @keyup.enter="handleSend"
      />
      <label class="file-btn" title="选择图片" aria-label="选择图片">
        <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="18" height="14" rx="3" ry="3" fill="currentColor" opacity="0.12" />
          <rect x="3" y="6" width="18" height="14" rx="3" ry="3" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5" />
          <rect x="6.5" y="4" width="5" height="3" rx="1.2" ry="1.2" fill="currentColor" />
        </svg>
        <input type="file" accept="image/*" @change="handleFileChange" hidden />
      </label>
      <button class="mic-btn" :class="{ recording }" @click="recording ? stopRecording() : startRecording()" title="语音输入" aria-label="语音输入">
        <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect x="9" y="3.5" width="6" height="10" rx="3" ry="3" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M6 11.5c0 3.3 2.7 6 6 6s6-2.7 6-6" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M12 17.5v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
      <button class="send-btn" :disabled="sending" @click="handleSend">发送</button>
    </div>
  </div>
  
</template>

<style scoped>
.chat-panel {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 1fr 56px;
  background: var(--panel-bg);
  color: var(--text-strong);
  border-radius: 16px;
  overflow: hidden;
}
.chat-body {
  padding: 12px;
  overflow: auto;
}
.msg { display: flex; margin: 6px 0; }
.msg.user { justify-content: flex-end; }
.bubble {
  max-width: 80%;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.55);
  color: var(--text-strong);
  box-shadow: 0 6px 18px rgba(127,167,255,0.18);
}
.msg.user .bubble {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
  color: #ffffff;
}
.bubble pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
}
.preview { margin: 8px 0; }
.preview img { max-width: 60%; border-radius: 8px; }
.chat-footer {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background: var(--surface-glass-weak);
  border-top: 1px solid rgba(255,255,255,0.28);
}
.text-input {
  width: 100%; height: 36px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); padding: 0 10px;
  background: rgba(255,255,255,0.72);
  color: var(--text-strong);
}
.file-btn, .mic-btn, .send-btn {
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.08);
  padding: 0 12px;
  cursor: pointer;
  background: rgba(255,255,255,0.65);
  color: var(--text-strong);
  transition: background var(--anim-dur) ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.file-btn:hover, .mic-btn:hover, .send-btn:hover { background: rgba(255,255,255,0.8); }
.mic-btn.recording { background: rgba(234, 102, 102, 0.42); color: #fff; }

.file-btn, .mic-btn { width: 36px; padding: 0; }
.file-btn .icon, .mic-btn .icon { width: 18px; height: 18px; display: block; }
</style>