export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[]; // data URLs or public URLs
}

export const DEFAULT_LLM_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  audioModel: "whisper-1"
};

// 获取配置信息
export function getLLMConfig() {
  const apiKey = localStorage.getItem("OPENAI_API_KEY") || import.meta.env.VITE_OPENAI_API_KEY || "";
  // 默认为 OpenAI 官方地址和模型
  const baseUrl = (localStorage.getItem("LLM_BASE_URL") || import.meta.env.VITE_LLM_BASE_URL || DEFAULT_LLM_CONFIG.baseUrl).replace(/\/+$/, "");
  const model = localStorage.getItem("LLM_MODEL") || import.meta.env.VITE_LLM_MODEL || DEFAULT_LLM_CONFIG.model;
  const audioModel = localStorage.getItem("LLM_AUDIO_MODEL") || import.meta.env.VITE_LLM_AUDIO_MODEL || DEFAULT_LLM_CONFIG.audioModel;

  return { apiKey, baseUrl, model, audioModel };
}

function getConfigAndKey(explicitKey?: string) {
  const { apiKey: envKey, baseUrl, model, audioModel } = getLLMConfig();
  const key = explicitKey || envKey;
  if (!key) throw new Error("缺少 API Key。请在 .env 设置 VITE_OPENAI_API_KEY 或在 localStorage 设置 OPENAI_API_KEY。");
  return { key, baseUrl, model, audioModel };
}

function createPayloadMessages(messages: ChatMessage[]) {
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

export async function chatStream(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  apiKey?: string
): Promise<void> {
  const { key, baseUrl, model } = getConfigAndKey(apiKey);
  const payloadMessages = createPayloadMessages(messages);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model,
      messages: payloadMessages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data?.error?.message || res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法获取流式响应");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 处理多行数据
    const lines = buffer.split('\n');
    buffer = lines.pop() || ""; // 保留未完整的最后一行

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") return;

      try {
        const json = JSON.parse(dataStr);
        const content = json.choices?.[0]?.delta?.content || "";
        if (content) onChunk(content);
      } catch (e) {
        console.warn("解析流式数据失败:", e);
      }
    }
  }
}

// 文本与图像的对话（基于 Chat Completions）
export async function chat(messages: ChatMessage[], apiKey?: string): Promise<string> {
  const { key, baseUrl, model } = getConfigAndKey(apiKey);
  const payloadMessages = createPayloadMessages(messages);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model,
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
  const { key, baseUrl, audioModel } = getConfigAndKey(apiKey);
  const file = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
  const form = new FormData();
  form.append("file", file);
  form.append("model", audioModel);

  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
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

export interface RiskAnalysisItem {
  level: 1 | 2 | 3;
  category: 'allergy' | 'chronic' | 'medication' | 'population' | 'vital' | 'other';
  content: string;
}

export async function analyzePatientRisks(patientData: any, apiKey?: string): Promise<RiskAnalysisItem[]> {
  // Construct a prompt for the LLM
  const systemPrompt = `你是一名资深的临床医疗风险评估专家。你的任务是根据提供的患者信息和历史病历数据，分析潜在的健康风险点。

请分析以下维度：
1. **过敏风险 (allergy)**: 药物或食物过敏史。
2. **慢性病风险 (chronic)**: 既往高血压、糖尿病等慢性病史。
3. **用药风险 (medication)**: 当前用药即使与既往史冲突，或存在药物相互作用。
4. **特殊人群 (population)**: 老人、儿童、孕妇等。
5. **生命体征/急症 (vital)**: 如高热、呼吸困难等急症迹象。
6. **其他 (other)**: 其他值得注意的风险。

**输出规则**：
- 输出必须是标准的 JSON 数组格式。
- 每个风险项包含：
    - \`level\`: 风险等级 (1=高风险/红色, 2=中风险/橙色, 3=低风险/黄色)。
    - \`category\`: 风险类别 (allergy, chronic, medication, population, vital, other)。
    - \`content\`: 简短明确的风险提示内容（不超过20字）。
- 如果没有显著风险，请返回空数组 []。
- 不要包含 markdown 标记 (如 \`\`\`json)，直接返回 JSON 字符串。
`;

  const userContent = `患者信息：
姓名: ${patientData.patientName}
性别: ${patientData.gender}
年龄: ${patientData.age}
主诉: ${patientData.chiefComplaint || '无'}
现病史: ${patientData.historyOfPresentIllness || '无'}
既往史: ${patientData.pastMedicalHistory || '无'}
过敏史: ${patientData.allergyHistory || '无'}
初步诊断: ${patientData.diagnosis || '无'}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  try {
    const response = await chat(messages, apiKey);
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    // Keep only the array part if surrounded by text
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;

    return JSON.parse(targetJson);
  } catch (e) {
    console.error('Risk analysis failed:', e);
    // Return a fallback risk item to indicate failure
    return [{
      level: 3,
      category: 'other',
      content: '风险评估服务暂时不可用'
    }];
  }
}
