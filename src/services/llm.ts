export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[]; // data URLs or public URLs
}

function getApiKey(explicit?: string): string {
  const key = explicit || import.meta.env.VITE_OPENAI_API_KEY || localStorage.getItem("OPENAI_API_KEY") || "";
  if (!key) throw new Error("缺少 OpenAI API Key。请在 .env 设置 VITE_OPENAI_API_KEY 或在 localStorage 设置 OPENAI_API_KEY。");
  return key;
}

// 文本与图像的对话（基于 Chat Completions）
export async function chat(messages: ChatMessage[], apiKey?: string): Promise<string> {
  const key = getApiKey(apiKey);

  const payloadMessages = messages.map((m) => {
    if (m.images && m.images.length > 0) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // 文本+图像，性价比好
      messages: payloadMessages,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || res.statusText);
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

// 语音转文字（Whisper）
export async function transcribeAudio(blob: Blob, apiKey?: string): Promise<string> {
  const key = getApiKey(apiKey);
  const file = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
  const form = new FormData();
  form.append("file", file);
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || res.statusText);
  }
  return data?.text ?? "";
}