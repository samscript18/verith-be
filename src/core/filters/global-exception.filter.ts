import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationException, ExternalProviderException } from '../exceptions';
import type { RequestWithId } from '../types/request-with-id.type';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>() as RequestWithId;
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isApplicationError = exception instanceof ApplicationException;
    const message = isApplicationError
      ? exception.message
      : Number(status) >= 500
        ? 'An unexpected error occurred'
        : this.getSafeHttpMessage(exception);
    const code = isApplicationError
      ? exception.code
      : Number(status) === Number(HttpStatus.BAD_REQUEST)
        ? 'BAD_REQUEST'
        : 'INTERNAL_SERVER_ERROR';
    const details = isApplicationError ? exception.details : null;

    if (Number(status) >= 500) {
      this.logger.error({
        requestId: request.requestId,
        method: request.method,
        route: request.originalUrl,
        errorClass:
          exception instanceof Error
            ? exception.constructor.name
            : 'UnknownError',
        message:
          exception instanceof Error ? exception.message : 'Unknown error',
        ...(exception instanceof ExternalProviderException &&
        exception.operatorDetails
          ? { providerDetails: exception.operatorDetails }
          : {}),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    response.status(status).json({
      success: false,
      message,
      error: { code, details },
      meta: {
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private getSafeHttpMessage(exception: unknown): string {
    if (!(exception instanceof HttpException))
      return 'An unexpected error occurred';
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = response.message;
      return Array.isArray(message)
        ? 'Request validation failed'
        : String(message);
    }
    return exception.message;
  }
}
