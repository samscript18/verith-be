import { HttpStatus } from '@nestjs/common';
import { ExternalProviderException } from '../../../core/exceptions';
import { ProviderState } from '../../../shared/enums/provider-state.enum';

export async function providerFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  codePrefix: string,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (response.ok) return response;
    const state = failureState(response.status);
    throw new ExternalProviderException(
      'The AI provider request failed',
      `${codePrefix}_${state}`,
      response.status === 429
        ? HttpStatus.TOO_MANY_REQUESTS
        : HttpStatus.SERVICE_UNAVAILABLE,
    );
  } catch (error) {
    if (error instanceof ExternalProviderException) throw error;
    if (
      timedOut ||
      (error instanceof Error &&
        ['AbortError', 'TimeoutError'].includes(error.name))
    ) {
      throw new ExternalProviderException(
        'The AI provider request timed out',
        `${codePrefix}_${ProviderState.TIMEOUT}`,
      );
    }
    throw new ExternalProviderException(
      'The AI provider is unavailable',
      `${codePrefix}_${ProviderState.UNAVAILABLE}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function failureState(status: number): string {
  if (status === 401 || status === 403)
    return ProviderState.AUTHENTICATION_FAILED;
  if (status === 402) return 'BILLING_REQUIRED';
  if (status === 404) return 'INVALID_MODEL';
  if (status === 408 || status === 504) return ProviderState.TIMEOUT;
  if (status === 429) return ProviderState.RATE_LIMITED;
  if (status === 400 || status === 422) return 'INVALID_REQUEST';
  return ProviderState.UNAVAILABLE;
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
