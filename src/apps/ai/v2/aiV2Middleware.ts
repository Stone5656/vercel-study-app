import express, { type RequestHandler } from 'express';

const invalidJsonResponse = {
  success: false,
  error: {
    code: 'INVALID_JSON',
    message: 'JSONの形式が不正です',
  },
} as const;

const payloadTooLargeResponse = {
  success: false,
  error: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'リクエスト本文が大きすぎます',
  },
} as const;

const unsupportedMediaTypeResponse = {
  success: false,
  error: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'JSON形式で送信してください',
  },
} as const;

export const aiV2JsonParser = express.json({
  limit: 16_384,
  strict: false,
});

export const requireAiV2Json: RequestHandler = (req, res, next): void => {
  if (!req.is('application/json')) {
    res.status(415).json(unsupportedMediaTypeResponse);
    return;
  }
  next();
};

export function createAiV2DemoGuard(
  environment: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return (_req, res, next): void => {
    const enabled =
      environment.NODE_ENV === 'development' &&
      environment.AI_V2_DEMO_ENABLED === 'true' &&
      environment.VERCEL_ENV === undefined;

    if (!enabled) {
      res.status(503).json({
        success: false,
        error: {
          code: 'DEMO_DISABLED',
          message: 'AI会話機能は現在利用できません',
        },
      });
      return;
    }
    next();
  };
}

export const aiV2JsonErrorHandler: express.ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    res.status(400).json(invalidJsonResponse);
    return;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    res.status(413).json(payloadTooLargeResponse);
    return;
  }
  next(error);
};
