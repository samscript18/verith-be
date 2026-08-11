import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RequestWithId } from '../types/request-with-id.type';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const header = request.header('x-request-id');
    const requestId =
      header && REQUEST_ID_PATTERN.test(header)
        ? header
        : `req_${randomUUID()}`;

    (request as RequestWithId).requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
