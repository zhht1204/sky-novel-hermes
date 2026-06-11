import type { AnalysisResult } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';

export interface LiteLlmConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export class LiteLlmClient {
  constructor(private readonly config: LiteLlmConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.baseUrl && this.config.model);
  }

  async summarize(sourceId: string, text: string): Promise<AnalysisResult> {
    if (!this.enabled) {
      throw new Error('LiteLLM is not configured. Set LITELLM_BASE_URL and LITELLM_MODEL.');
    }

    const response = await fetch(new URL('/chat/completions', this.config.baseUrl).toString(), {
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
      throw new Error(`LiteLLM request failed: ${response.status} ${await response.text()}`);
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
}

export function createLiteLlmClientFromEnv(): LiteLlmClient {
  return new LiteLlmClient({
    baseUrl: process.env.LITELLM_BASE_URL ?? '',
    apiKey: process.env.LITELLM_API_KEY,
    model: process.env.LITELLM_MODEL ?? 'gpt-4o-mini',
  });
}
