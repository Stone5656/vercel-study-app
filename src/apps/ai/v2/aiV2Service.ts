import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentParameters } from '@google/genai';

import type { AiV2Context } from './aiV2Model.js';

export type AiV2AnswerService = {
  generateAnswer(prompt: string, context: AiV2Context): Promise<string>;
};

export type AiV2GeminiClient = {
  models: {
    generateContent(
      parameters: GenerateContentParameters,
    ): Promise<{ text?: string }>;
  };
};

type GeminiClientFactory = (apiKey: string) => AiV2GeminiClient;

export type AiV2GeminiServiceOptions = {
  environment?: NodeJS.ProcessEnv;
  createClient?: GeminiClientFactory;
  logFailure?: () => void;
};

export class AiV2AnswerServiceError extends Error {
  constructor(message = 'AI V2 answer service failed') {
    super(message);
    this.name = 'AiV2AnswerServiceError';
  }
}

export function buildAiV2GeminiContents(
  context: AiV2Context,
  prompt: string,
): Content[] {
  const contents: Content[] = [];
  for (const turn of context.turns.slice(-5)) {
    contents.push(
      { role: 'user', parts: [{ text: turn.prompt }] },
      { role: 'model', parts: [{ text: turn.response }] },
    );
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  return contents;
}

export function createAiV2GeminiAnswerService(
  options: AiV2GeminiServiceOptions = {},
): AiV2AnswerService {
  const environment = options.environment ?? process.env;
  const createClient =
    options.createClient ?? ((apiKey: string) => new GoogleGenAI({ apiKey }));
  const logFailure =
    options.logFailure ?? (() => console.warn('AI V2 Gemini request failed'));
  let client: AiV2GeminiClient | undefined;

  return {
    async generateAnswer(prompt, context): Promise<string> {
      const apiKey = environment.GEMINI_API_KEY;
      const model = environment.GEMINI_MODEL;
      if (!apiKey || !model) {
        throw new AiV2AnswerServiceError('Gemini configuration unavailable');
      }

      try {
        client ??= createClient(apiKey);
        const result = await client.models.generateContent({
          model,
          contents: buildAiV2GeminiContents(context, prompt),
          config: {
            maxOutputTokens: 1024,
            automaticContinuation: false,
            automaticFunctionCalling: { disable: true },
            httpOptions: {
              timeout: 30_000,
              retryOptions: { attempts: 1 },
            },
          },
        });
        if (
          typeof result.text !== 'string' ||
          result.text.trim().length === 0
        ) {
          throw new AiV2AnswerServiceError('Gemini returned an empty response');
        }
        return result.text;
      } catch {
        logFailure();
        throw new AiV2AnswerServiceError();
      }
    },
  };
}
