import { HttpException, type HttpStatus } from '@nestjs/common';

export class ApplicationException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus,
    readonly code: string,
    readonly details: unknown = null,
  ) {
    super(message, status);
  }
}
