import { HttpStatus } from '@nestjs/common';
import { ApplicationException } from './application.exception';

export class ExternalProviderException extends ApplicationException {
  readonly operatorDetails: unknown;

  constructor(
    message: string,
    code: string,
    status = HttpStatus.SERVICE_UNAVAILABLE,
    details: unknown = null,
    operatorDetails: unknown = null,
  ) {
    super(message, status, code, details);
    this.operatorDetails = operatorDetails;
  }
}
