import type { RequestHandler } from 'express';

const demoDisabledResponse = {
  success: false,
  error: {
    code: 'DEMO_DISABLED',
    message: 'AI質問機能は現在利用できません',
  },
} as const;

export function isAiDemoEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.AI_DEMO_ENABLED === 'true' &&
    environment.VERCEL_ENV !== 'production'
  );
}

export function createAiDemoGuard(
  environment: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return (_req, res, next): void => {
    if (!isAiDemoEnabled(environment)) {
      res.status(503).json(demoDisabledResponse);
      return;
    }

    next();
  };
}
