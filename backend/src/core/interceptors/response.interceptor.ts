import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import type { RequestWithId } from '../types/request-with-id.type';
import { Reflector } from '@nestjs/core';
import { SKIP_RESPONSE_ENVELOPE } from '../../shared/decorators/skip-response-envelope.decorator';

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<T>
> {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<T>> {
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_ENVELOPE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return next.handle() as Observable<SuccessEnvelope<T>>;
    }
    const request = context
      .switchToHttp()
      .getRequest<Request>() as RequestWithId;

    return next.handle().pipe(
      map((data) => ({
        success: true,
        message: 'Request completed successfully',
        data,
        meta: {
          requestId: request.requestId,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}
