import { env } from 'cloudflare:workers';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
export const STT_MODEL = 'elevenlabs/scribe-v2';
export const LLM_MODEL = 'openai/gpt-5.4-nano';
// The trauma form maps one dictation onto ~50 fields; nano dropped findings and misread spoken numbers there.
export const TRAUMA_LLM_MODEL = 'openai/gpt-5.4-mini';

export class VoiceError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

function apiKey() {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new VoiceError('کلید OPENROUTER_API_KEY روی سرور تنظیم نشده است.', 500);
  return key;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${OPENROUTER_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'X-Title': 'Vardast Ward' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`OpenRouter ${path} failed with ${response.status}: ${detail.slice(0, 500)}`);
    throw new VoiceError(`سرویس پردازش صدا با خطا مواجه شد (کد ${response.status}).`);
  }
  return (await response.json()) as T;
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function transcribe(audio: ArrayBuffer, format: string, keyterms: string[]) {
  const result = await post<{ text?: string }>('/audio/transcriptions', {
    model: STT_MODEL,
    input_audio: { data: toBase64(audio), format },
    language: 'fa',
    keyterms,
  });
  return (result.text ?? '').trim();
}

type ChatCompletion = { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };

export async function completeJson(system: string, user: string, name: string, schema: object, effort: 'low' | 'medium' = 'low', model = LLM_MODEL): Promise<unknown> {
  const result = await post<ChatCompletion>('/chat/completions', {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    reasoning: { effort },
    // Only route to providers that honour response_format.
    provider: { require_parameters: true },
  });
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new VoiceError('پاسخ ساختاریافته از مدل دریافت نشد.');
  try {
    return JSON.parse(content);
  } catch {
    throw new VoiceError('پاسخ مدل قابل خواندن نبود.');
  }
}
