import type { ChatMessage } from './types';

export function createPayloadMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
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
}

export function summarizeText(value: string, limit = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

export function buildChatRequestSummary(messages: ChatMessage[]): string {
  const userMessages = messages.filter(item => item.role === 'user');
  const lastUserMessage = [...userMessages].reverse().find(item => item.content.trim());
  const imageCount = messages.reduce((total, item) => total + (item.images?.length || 0), 0);
  return [
    `${messages.length} 条消息`,
    `${userMessages.length} 条用户输入`,
    imageCount > 0 ? `${imageCount} 张图片` : '',
    lastUserMessage?.content ? `最新输入：${summarizeText(lastUserMessage.content, 80)}` : '',
  ].filter(Boolean).join('，');
}

export function buildSpeechRequestSummary(fileName: string, scene: string, mimeType?: string): string {
  return [`场景 ${scene}`, `文件 ${fileName}`, mimeType ? `格式 ${mimeType}` : ''].filter(Boolean).join('，');
}

export function extractSseDataPayload(line: string): string | null {
  if (!line.startsWith("data:")) {
    return null;
  }
  return line.slice(5).trimStart();
}

export async function readErrorPayload(res: Response): Promise<any> {
  const rawText = await res.text();
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    return { error: { message: rawText } };
  }
}
