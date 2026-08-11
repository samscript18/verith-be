import { HttpStatus } from '@nestjs/common';
import { ApplicationException } from './application.exception';

export class ExternalProviderException extends ApplicationException {
  constructor(
    message: string,
    code: string,
    status = HttpStatus.SERVICE_UNAVAILABLE,
  ) {
    super(message, status, code);
  }
}
