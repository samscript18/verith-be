import { HttpStatus } from '@nestjs/common';
import { ExternalProviderException } from '../../../core/exceptions';
import { ProviderState } from '../../../shared/enums/provider-state.enum';

export async function providerFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  codePrefix: string,
): Promise<Response> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return response;
    const state =
      response.status === 401 || response.status === 403
        ? ProviderState.AUTHENTICATION_FAILED
        : response.status === 429
          ? ProviderState.RATE_LIMITED
          : ProviderState.UNAVAILABLE;
    throw new ExternalProviderException(
      'The AI provider request failed',
      `${codePrefix}_${state}`,
      response.status === 429
        ? HttpStatus.TOO_MANY_REQUESTS
        : HttpStatus.SERVICE_UNAVAILABLE,
    );
  } catch (error) {
    if (error instanceof ExternalProviderException) throw error;
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ExternalProviderException(
        'The AI provider request timed out',
        `${codePrefix}_${ProviderState.TIMEOUT}`,
      );
    }
    throw new ExternalProviderException(
      'The AI provider is unavailable',
      `${codePrefix}_${ProviderState.UNAVAILABLE}`,
    );
  }
}

export function parseJsonText(value: string, codePrefix: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ExternalProviderException(
      'The AI provider returned invalid JSON',
      `${codePrefix}_INVALID_JSON`,
    );
  }
}

export function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
