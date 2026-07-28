import { HttpStatus } from '@nestjs/common';
import { ApplicationException } from './application.exception';

export class AuthenticationException extends ApplicationException {
  constructor(
    message = 'Authentication failed',
    code = 'AUTHENTICATION_FAILED',
  ) {
    super(message, HttpStatus.UNAUTHORIZED, code);
  }
}
