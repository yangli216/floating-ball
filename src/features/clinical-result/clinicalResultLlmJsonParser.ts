export function cleanLLMJsonEnvelope(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/```json\s*/gi, '```')
    .replace(/```/g, '')
    .trim();
}

export function findBalancedJsonCandidate(
  text: string,
  start: number,
  openChar: '{' | '[',
  closeChar: '}' | ']',
): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function extractLLMJsonCandidate(text: string): string {
  const cleaned = cleanLLMJsonEnvelope(text);
  const candidates: Array<{ start: number; json: string }> = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (char === '[') {
      const json = findBalancedJsonCandidate(cleaned, i, '[', ']');
      if (json) candidates.push({ start: i, json });
    } else if (char === '{') {
      const json = findBalancedJsonCandidate(cleaned, i, '{', '}');
      if (json) candidates.push({ start: i, json });
    }
  }

  candidates.sort((a, b) => a.start - b.start);
  for (const candidate of candidates) {
    try {
      JSON.parse(candidate.json);
      return candidate.json;
    } catch {
      // Try the next balanced block; explanatory text may contain brackets.
    }
  }

  return candidates[0]?.json || cleaned;
}

export function parseLLMJson<T = unknown>(text: string): T {
  try {
    const jsonStr = extractLLMJsonCandidate(text);
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    throw new Error(`JSON解析失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}
