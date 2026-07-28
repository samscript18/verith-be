import { HttpStatus, type ValidationError } from '@nestjs/common';
import { ApplicationException } from './application.exception';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

function flattenErrors(
  errors: ValidationError[],
  parent = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const ownErrors = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...ownErrors, ...flattenErrors(error.children ?? [], field)];
  });
}

export class RequestValidationException extends ApplicationException {
  constructor(errors: ValidationError[]) {
    super(
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      flattenErrors(errors),
    );
  }
}

export class ValidationException extends ApplicationException {
  constructor(message: string, details: ValidationErrorDetail[] | null = null) {
    super(message, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', details);
  }
}
