import {
  Catch,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';

type ErrorResponseBody = {
  statusCode: number;
  message: string;
  requestId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractMessageFromHttpException(exception: HttpException): string | null {
  try {
    const res = exception.getResponse();
    if (typeof res === 'string') return res || null;
    if (!isRecord(res)) return null;
    const msg = res.message;
    if (typeof msg === 'string') return msg || null;
    if (Array.isArray(msg) && msg.every((m) => typeof m === 'string')) return msg.join('; ').trim() || null;
    return null;
  } catch {
    return null;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest() as { id?: string; method?: string; url?: string } | undefined;
    const reply = ctx.getResponse() as {
      status: (code: number) => { send: (body: unknown) => void };
      header?: (key: string, value: string) => void;
    };

    const requestId = request?.id;
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const isProd = process.env.NODE_ENV === 'production';
    const message = (() => {
      if (exception instanceof HttpException) {
        return extractMessageFromHttpException(exception) ?? exception.message ?? '请求失败';
      }
      if (exception instanceof Error) {
        return isProd ? '服务器内部错误' : exception.message || '服务器内部错误';
      }
      return isProd ? '服务器内部错误' : String(exception);
    })();

    // server-side log for diagnosis
    try {
      const meta = {
        requestId,
        method: request?.method,
        url: request?.url,
        status,
        message,
      };
      if (status >= 500) console.error('[api] request error', meta, exception);
      else console.warn('[api] request error', meta);
    } catch {
      // ignore logging failure
    }

    if (requestId && reply.header) {
      try {
        reply.header('x-request-id', requestId);
      } catch {
        // ignore
      }
    }

    const body: ErrorResponseBody = { statusCode: status, message };
    if (requestId) body.requestId = requestId;

    reply.status(status).send(body);
  }
}




