export enum AiFailureClass {
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  TEMPORARY = 'TEMPORARY',
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  BILLING = 'BILLING',
  UNKNOWN = 'UNKNOWN',
}

export function classifyAiFailure(code: string): AiFailureClass {
  if (code.includes('AUTHENTICATION')) return AiFailureClass.AUTHENTICATION;
  if (code.includes('RATE_LIMIT') || code.includes('QUOTA'))
    return AiFailureClass.RATE_LIMIT;
  if (code.includes('BILLING')) return AiFailureClass.BILLING;
  if (
    code.includes('INVALID_REQUEST') ||
    code.includes('INVALID_SCHEMA') ||
    code.includes('INVALID_MODEL')
  )
    return AiFailureClass.INVALID_REQUEST;
  if (
    code.includes('INVALID_RESPONSE') ||
    code.includes('INVALID_JSON') ||
    code.includes('OUTPUT_TRUNCATED') ||
    code.includes('OUTPUT_VALIDATION') ||
    code.includes('EMPTY_RESPONSE') ||
    code.includes('CONTENT_BLOCKED')
  )
    return AiFailureClass.INVALID_RESPONSE;
  if (
    code.includes('TIMEOUT') ||
    code.includes('UNAVAILABLE') ||
    code.includes('NETWORK')
  )
    return AiFailureClass.TEMPORARY;
  return AiFailureClass.UNKNOWN;
}
