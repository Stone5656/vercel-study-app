import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters } from '@google/genai';
import type { RequestHandler } from 'express';

export type AiAnswerService = {
  generateAnswer(prompt: string): Promise<string>;
};

export const MOCK_ANSWER = '接続確認用の模擬回答';

export const mockAiAnswerService: AiAnswerService = {
  async generateAnswer(prompt: string): Promise<string> {
    void prompt;
    return MOCK_ANSWER;
  },
};

export type GeminiClient = {
  models: {
    generateContent(
      parameters: GenerateContentParameters,
    ): Promise<{ text?: string }>;
  };
};

type GeminiClientFactory = (apiKey: string) => GeminiClient;

export type GeminiServiceOptions = {
  environment?: NodeJS.ProcessEnv;
  createClient?: GeminiClientFactory;
  logFailure?: () => void;
};

export class AiAnswerServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiAnswerServiceError';
  }
}

export function createGeminiAnswerService(
  options: GeminiServiceOptions = {},
): AiAnswerService {
  const environment = options.environment ?? process.env;
  const createClient =
    options.createClient ?? ((apiKey: string) => new GoogleGenAI({ apiKey }));
  const logFailure =
    options.logFailure ?? (() => console.warn('Gemini request failed'));
  let client: GeminiClient | undefined;

  return {
    async generateAnswer(prompt: string): Promise<string> {
      const apiKey = environment.GEMINI_API_KEY;
      const model = environment.GEMINI_MODEL;
      if (!apiKey || !model) {
        throw new AiAnswerServiceError('Gemini configuration is unavailable');
      }

      try {
        client ??= createClient(apiKey);
        const result = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            maxOutputTokens: 1024,
            automaticContinuation: false,
            automaticFunctionCalling: {
              disable: true,
            },
            httpOptions: {
              timeout: 30_000,
              retryOptions: {
                attempts: 1,
              },
            },
          },
        });

        if (
          typeof result.text !== 'string' ||
          result.text.trim().length === 0
        ) {
          throw new AiAnswerServiceError('Gemini returned an empty response');
        }
        return result.text;
      } catch {
        logFailure();
        throw new AiAnswerServiceError('Gemini request failed');
      }
    },
  };
}

export function selectAiAnswerService(
  environment: NodeJS.ProcessEnv = process.env,
): AiAnswerService {
  if (
    environment.AI_MOCK_ENABLED === 'true' &&
    environment.VERCEL_ENV === undefined
  ) {
    return mockAiAnswerService;
  }

  return createGeminiAnswerService({ environment });
}

export function createAiAnswerServiceGuard(
  environment: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return (_req, res, next): void => {
    const local = environment.VERCEL_ENV === undefined;
    const mockEnabled = local && environment.AI_MOCK_ENABLED === 'true';
    const realServiceConfigured =
      Boolean(environment.GEMINI_API_KEY) && Boolean(environment.GEMINI_MODEL);

    if (!mockEnabled && !realServiceConfigured) {
      res.status(503).json({
        success: false,
        error: {
          code: 'AI_UNAVAILABLE',
          message: 'AI回答機能を利用できません',
        },
      });
      return;
    }

    next();
  };
}

export const createLocalMockGuard = createAiAnswerServiceGuard;
