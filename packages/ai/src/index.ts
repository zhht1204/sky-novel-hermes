import type { AnalysisResult, LanguageProfile } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';

export interface LiteLlmConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export class LiteLlmClient {
  constructor(private readonly config: LiteLlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  get enabled(): boolean {
    return Boolean(this.config.baseUrl && this.config.model);
  }

  async summarize(sourceId: string, text: string): Promise<AnalysisResult> {
    if (!this.enabled) {
      throw new Error('LiteLLM is not configured. Set LITELLM_BASE_URL and LITELLM_MODEL.');
    }

    const response = await fetch(chatCompletionsUrl(this.config.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: 'You analyze Chinese web novel text and return concise structured summaries.' },
          { role: 'user', content: `Summarize this content in Chinese in 5-8 bullet points:\n\n${text.slice(0, 12000)}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`LiteLLM request failed: ${response.status} ${await readResponseMessage(response)}`);
    }

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return {
      kind: 'book-summary',
      sourceId,
      model: this.config.model,
      summary: json.choices?.[0]?.message?.content?.trim() ?? '',
      data: {},
      createdAt: nowIso(),
    };
  }

  async detectLanguage(bookUrl: string, text: string): Promise<LanguageProfile> {
    const heuristic = detectLanguageHeuristically(text);
    if (heuristic.confidence >= 0.82 || !this.enabled) {
      return {
        bookUrl,
        language: heuristic.language,
        confidence: heuristic.confidence,
        sampleSize: text.length,
        detectedAt: nowIso(),
        detector: 'heuristic',
      };
    }

    const response = await this.chat([
      { role: 'system', content: 'Detect the primary language of novel text. Return only compact JSON with keys language and confidence. Use short language names or BCP-47 codes.' },
      { role: 'user', content: text.slice(0, 8000) },
    ], 0);
    const parsed = parseLanguageDetection(response);
    return {
      bookUrl,
      language: parsed.language || heuristic.language,
      confidence: parsed.confidence ?? heuristic.confidence,
      sampleSize: text.length,
      detectedAt: nowIso(),
      detector: 'litellm',
    };
  }

  async translateChapter(input: {
    title: string;
    text: string;
    sourceLanguage: string;
    targetLanguage: string;
    prompt: string;
    maxChunkChars: number;
  }): Promise<string> {
    if (!this.enabled) {
      throw new Error('LiteLLM is not configured. Set LITELLM_BASE_URL and LITELLM_MODEL.');
    }
    const chunks = chunkText(input.text, input.maxChunkChars);
    const translated: string[] = [];
    for (const chunk of chunks) {
      translated.push(await this.chat([
        { role: 'system', content: renderPrompt(input.prompt, input, chunk) },
        { role: 'user', content: chunk },
      ], 0.2));
    }
    return translated.map((item) => item.trim()).filter(Boolean).join('\n\n');
  }

  private async chat(messages: Array<{ role: 'system' | 'user'; content: string }>, temperature: number): Promise<string> {
    if (!this.enabled) {
      throw new Error('LiteLLM is not configured. Set LITELLM_BASE_URL and LITELLM_MODEL.');
    }
    const response = await fetch(chatCompletionsUrl(this.config.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.config.model, messages, temperature }),
    });
    if (!response.ok) {
      throw new Error(`LiteLLM request failed: ${response.status} ${await readResponseMessage(response)}`);
    }
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() ?? '';
  }
}

export const DEFAULT_TRANSLATION_PROMPT = [
  'Translate the chapter from {sourceLanguage} to {targetLanguage}.',
  'Return only the translated novel text. Do not add explanations, notes, markdown fences, or summaries.',
  'Preserve paragraph breaks, dialogue markers, names, numbers, and chapter tone.',
  'Chapter title: {title}',
].join('\n');

export function createLiteLlmClientFromEnv(): LiteLlmClient {
  return new LiteLlmClient({
    baseUrl: process.env.LITELLM_BASE_URL ?? '',
    apiKey: process.env.LITELLM_API_KEY,
    model: process.env.LITELLM_MODEL ?? 'gpt-4o-mini',
  });
}

function detectLanguageHeuristically(text: string): { language: string; confidence: number } {
  const sample = text.slice(0, 12000);
  if (!sample.trim()) return { language: 'unknown', confidence: 0 };
  const counts = {
    hangul: countMatches(sample, /[\uac00-\ud7af]/g),
    kana: countMatches(sample, /[\u3040-\u30ff]/g),
    cjk: countMatches(sample, /[\u4e00-\u9fff]/g),
    latin: countMatches(sample, /[A-Za-z]/g),
    traditional: countMatches(sample, /[萬與專業東書個風後國這為來時會點體長門開關無葉氣]/g),
    simplified: countMatches(sample, /[万与专业东书个风后国这为来时会点体长门开关无叶气]/g),
  };
  const significant = counts.hangul + counts.kana + counts.cjk + counts.latin;
  if (significant === 0) return { language: 'unknown', confidence: 0.2 };
  if (counts.hangul / significant > 0.25) return { language: 'ko', confidence: 0.95 };
  if (counts.kana / significant > 0.08) return { language: 'ja', confidence: 0.92 };
  if (counts.cjk / significant > 0.35) {
    if (counts.traditional > counts.simplified * 1.2) return { language: 'zh-Hant', confidence: 0.88 };
    if (counts.simplified > counts.traditional * 1.2) return { language: 'zh-Hans', confidence: 0.86 };
    return { language: 'zh', confidence: 0.72 };
  }
  if (counts.latin / significant > 0.7) return { language: 'en', confidence: 0.9 };
  return { language: 'unknown', confidence: 0.25 };
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (/\/chat\/completions\/?$/i.test(trimmed)) return trimmed;
  return new URL('chat/completions', trimmed.endsWith('/') ? trimmed : `${trimmed}/`).toString();
}

async function readResponseMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
    if (typeof parsed.message === 'string') return parsed.message;
    if (parsed.error && typeof parsed.error === 'object' && 'message' in parsed.error) {
      const message = (parsed.error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  } catch {
    // Fall through to HTML/text cleanup below.
  }
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || response.statusText;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function parseLanguageDetection(content: string): { language: string; confidence?: number } {
  try {
    const parsed = JSON.parse(content) as { language?: unknown; confidence?: unknown };
    return {
      language: typeof parsed.language === 'string' ? parsed.language : 'unknown',
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : undefined,
    };
  } catch {
    return { language: content.trim().split(/\s+/)[0] || 'unknown' };
  }
}

function chunkText(text: string, maxChunkChars: number): string[] {
  const limit = Math.max(1000, maxChunkChars);
  if (text.length <= limit) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= limit) {
      current = paragraph;
      continue;
    }
    for (let offset = 0; offset < paragraph.length; offset += limit) {
      chunks.push(paragraph.slice(offset, offset + limit));
    }
    current = '';
  }
  if (current) chunks.push(current);
  return chunks;
}

function renderPrompt(prompt: string, input: { title: string; sourceLanguage: string; targetLanguage: string }, text: string): string {
  return prompt
    .replaceAll('{sourceLanguage}', input.sourceLanguage)
    .replaceAll('{targetLanguage}', input.targetLanguage)
    .replaceAll('{title}', input.title)
    .replaceAll('{text}', text);
}
