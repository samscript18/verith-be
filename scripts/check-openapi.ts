import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

type DocumentedOperation = OperationObject & {
  'x-verith-access'?: string;
  'x-verith-response-envelope'?: boolean;
};

async function checkOpenApi(): Promise<void> {
  const source = resolve(process.cwd(), 'openapi.json');
  const document = JSON.parse(await readFile(source, 'utf8')) as OpenAPIObject;
  const failures: string[] = [];
  let operationCount = 0;

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, candidate] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !candidate) continue;
      operationCount += 1;
      checkOperation(path, method, candidate as DocumentedOperation, failures);
    }
  }

  checkComponents(document, failures);
  checkReferences(document, failures);
  if (operationCount === 0) failures.push('The document has no operations.');

  if (failures.length) {
    process.stderr.write(
      `OpenAPI documentation check failed (${failures.length}):\n${failures
        .map((failure) => `- ${failure}`)
        .join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `OpenAPI documentation check passed: ${operationCount} operations, ${Object.keys(document.paths).length} paths, ${Object.keys(document.components?.schemas ?? {}).length} schemas.\n`,
  );
}

function checkOperation(
  path: string,
  method: string,
  operation: DocumentedOperation,
  failures: string[],
): void {
  const label = `${method.toUpperCase()} ${path}`;
  if (!operation.operationId) failures.push(`${label} has no operationId.`);
  if (!operation.summary?.trim()) failures.push(`${label} has no summary.`);
  if (!operation.description?.trim())
    failures.push(`${label} has no description.`);
  if (!operation.tags?.length) failures.push(`${label} has no tag.`);
  if (!operation['x-verith-access'])
    failures.push(`${label} has no access classification.`);
  if (typeof operation['x-verith-response-envelope'] !== 'boolean') {
    failures.push(`${label} has no response-envelope classification.`);
  }

  const successResponses = Object.entries(operation.responses).filter(
    ([status]) => status.startsWith('2'),
  );
  if (!successResponses.length) failures.push(`${label} has no 2xx response.`);
  for (const [status, response] of successResponses) {
    if (!response || '$ref' in response || status === '204') continue;
    if (!response.description?.trim()) {
      failures.push(`${label} ${status} response has no description.`);
    }
    const media = Object.values(response.content ?? {});
    if (!media.length || media.some((item) => !item.schema)) {
      failures.push(`${label} ${status} response has no documented schema.`);
    }
  }

  const parameters = operation.parameters ?? [];
  if (!hasRequestIdParameter(parameters)) {
    failures.push(`${label} does not document X-Request-Id.`);
  }
  for (const parameter of parameters) {
    if ('$ref' in parameter) continue;
    if (!parameter.description?.trim()) {
      failures.push(
        `${label} ${parameter.in} parameter ${parameter.name} has no description.`,
      );
    }
    if (
      parameter.in === 'path' &&
      parameter.schema &&
      !('$ref' in parameter.schema) &&
      parameter.schema.example === undefined
    ) {
      failures.push(
        `${label} path parameter ${parameter.name} has no example.`,
      );
    }
  }
  if (
    operation.requestBody &&
    !('$ref' in operation.requestBody) &&
    !operation.requestBody.description?.trim()
  ) {
    failures.push(`${label} request body has no description.`);
  }
}

function hasRequestIdParameter(
  parameters: Array<ParameterObject | ReferenceObject>,
): boolean {
  return parameters.some(
    (parameter) =>
      ('$ref' in parameter && parameter.$ref.endsWith('/RequestIdHeader')) ||
      (!('$ref' in parameter) &&
        parameter.in === 'header' &&
        parameter.name.toLowerCase() === 'x-request-id'),
  );
}

function checkComponents(document: OpenAPIObject, failures: string[]): void {
  for (const name of [
    'ApiSuccessResponse',
    'ApiErrorResponse',
    'ApiResponseMeta',
  ]) {
    if (!document.components?.schemas?.[name]) {
      failures.push(`Missing reusable schema ${name}.`);
    }
  }
  for (const name of ['bearer', 'verith_refresh']) {
    if (!document.components?.securitySchemes?.[name]) {
      failures.push(`Missing security scheme ${name}.`);
    }
  }
  for (const tag of document.tags ?? []) {
    if (!tag.description?.trim()) {
      failures.push(`Tag ${tag.name} has no description.`);
    }
  }
}

function checkReferences(document: OpenAPIObject, failures: string[]): void {
  const visit = (value: unknown, location: string): void => {
    if (!value || typeof value !== 'object') return;
    if ('$ref' in value && typeof value.$ref === 'string') {
      if (!resolveReference(document, value.$ref)) {
        failures.push(`Unresolved reference ${value.$ref} at ${location}.`);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${location}/${key}`);
    }
  };
  visit(document, '#');
}

function resolveReference(document: OpenAPIObject, reference: string): unknown {
  if (!reference.startsWith('#/')) return true;
  return reference
    .slice(2)
    .split('/')
    .reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[segment];
    }, document);
}

void checkOpenApi().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`OpenAPI documentation check failed: ${message}\n`);
  process.exitCode = 1;
});
