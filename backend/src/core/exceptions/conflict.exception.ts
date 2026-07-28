import { HttpStatus } from '@nestjs/common';
import { ApplicationException } from './application.exception';

export class ConflictException extends ApplicationException {
  constructor(message: string, code: string) {
    super(message, HttpStatus.CONFLICT, code);
  }
}
