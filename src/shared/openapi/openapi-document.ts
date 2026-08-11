import { DocumentBuilder } from '@nestjs/swagger';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

type VerithOperationObject = OperationObject & {
  'x-verith-access'?: 'public' | 'authenticated' | 'authenticated-admin';
  'x-verith-response-envelope'?: boolean;
};

const TAG_DESCRIPTIONS: Record<string, string> = {
  Application: 'Service identity and API discovery.',
  Health: 'Process liveness and dependency readiness probes.',
  Authentication:
    'Registration, login, token refresh, email verification, password recovery, and session management.',
  Users: 'Authenticated profiles, preferences, and public profile lookup.',
  Uploads: 'Owner-bound media upload authorization and asset lifecycle.',
  Verifications:
    'Investigation creation, processing state, claims, evidence, analysis, guidance, and event streaming.',
  Reports:
    'Owned verification reports, visibility, feedback, coaching, check cards, and exports.',
  'Public Reports': 'Sanitized reports explicitly shared for public access.',
  Learning: 'Published courses, lessons, progress, and lesson completion.',
  'Learning Admin': 'Administrative course and lesson authoring workflows.',
  Quizzes: 'Published quizzes, server-scored attempts, and explanations.',
  'Quizzes Admin': 'Administrative quiz authoring and publication workflows.',
  Challenges: 'Daily Practice and challenge catalog, attempts, and results.',
  'Challenges Admin':
    'Administrative challenge authoring, provenance inspection, and publication controls.',
  Gamification:
    'User XP, Truth Points, streaks, ranks, badges, achievements, and leaderboards.',
  'Gamification Admin':
    'Administrative gamification catalog and reward operations.',
  'Community Missions': 'Community verification missions and participation.',
  'Media Literacy':
    'Media and Information Literacy growth profile and signals.',
  Notifications: 'User notification inbox, unread counts, and read state.',
  'Notifications Admin': 'Administrative product-message delivery.',
  Privacy: 'Encrypted data exports and privacy workflows.',
  Entitlements: 'Effective user access and administrative entitlement grants.',
  'Product analytics': 'Privacy-safe client interaction events.',
  'Admin analytics':
    'Operational and privacy-thresholded administrative aggregates.',
  Admin: 'User, verification, audit-log, and operational administration.',
  'AI Integrations': 'Configured AI provider health and capability visibility.',
  'Search Integrations':
    'Configured search provider health and capability visibility.',
  'AI Prompt Admin': 'Versioned AI prompt administration and publication.',
  'AI Provider Admin': 'Runtime AI provider configuration and health controls.',
  'Publishers Admin': 'Publisher credibility profile administration.',
  'Report Feedback Admin': 'Administrative review of report feedback.',
};

const PARAMETER_DESCRIPTIONS: Record<string, string> = {
  id: 'MongoDB ObjectId of the target resource.',
  userId: 'MongoDB ObjectId of the target user.',
  verificationId: 'MongoDB ObjectId of the verification.',
  reportId: 'MongoDB ObjectId of the report.',
  lessonId: 'MongoDB ObjectId of the lesson.',
  evidenceId: 'Stable identifier of the evidence record.',
  sessionId: 'MongoDB ObjectId of the authenticated session.',
  username: 'Case-insensitive public username.',
  slug: 'Stable, URL-safe resource slug.',
  cursor: 'Opaque cursor returned by the previous page.',
  limit: 'Maximum number of records to return.',
  status: 'Optional status used to filter results.',
  search: 'Case-insensitive search text.',
  after: 'Return events whose sequence is greater than this value.',
  phase: 'Assessment phase within the mission learning journey.',
  range: 'Requested aggregation time range.',
};

const PARAMETER_EXAMPLES: Record<string, string | number> = {
  id: '64b7f4d8c7a4a12f9c123456',
  userId: '64b7f4d8c7a4a12f9c123456',
  verificationId: '64b7f4d8c7a4a12f9c123456',
  reportId: '64b7f4d8c7a4a12f9c123456',
  lessonId: '64b7f4d8c7a4a12f9c123456',
  evidenceId: 'evidence-01',
  sessionId: '64b7f4d8c7a4a12f9c123456',
  username: 'truthseeker',
  slug: 'daily-media-literacy-2026-08-11',
  cursor: 'eyJpZCI6IjY0YjdmNGQ4In0',
  limit: 20,
  after: 0,
  phase: 'baseline',
};

const RAW_RESPONSE_CONTENT: Array<{
  matches: (path: string) => boolean;
  mediaType: string;
  schema: SchemaObject;
}> = [
  {
    matches: (path) => path.endsWith('/stream'),
    mediaType: 'text/event-stream',
    schema: { type: 'string', description: 'Server-sent event stream.' },
  },
  {
    matches: (path) => path.endsWith('/check-card.svg'),
    mediaType: 'image/svg+xml',
    schema: { type: 'string', format: 'binary' },
  },
  {
    matches: (path) => path.endsWith('/export/pdf'),
    mediaType: 'application/pdf',
    schema: { type: 'string', format: 'binary' },
  },
  {
    matches: (path) =>
      path.endsWith('/export/json') || path.endsWith('/download'),
    mediaType: 'application/json',
    schema: { type: 'object', additionalProperties: true },
  },
];

export function buildOpenApiConfig() {
  let builder = new DocumentBuilder()
    .setTitle('Verith API')
    .setDescription(
      [
        'Production API for explainable misinformation verification and Media and Information Literacy learning.',
        '',
        'Successful JSON responses use a common envelope with `success`, `message`, `data`, and request metadata. Errors use a stable machine-readable `error.code` and never expose provider credentials or internal stack traces.',
        '',
        'Use the bearer scheme for access tokens. Browser refresh uses the `verith_refresh` HttpOnly cookie together with the `X-CSRF-Token` header. Send an optional `X-Request-Id` to correlate requests; Verith returns the effective value in every response.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addServer('/', 'Current Verith host')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived Verith access token.',
      },
      'bearer',
    )
    .addCookieAuth(
      'verith_refresh',
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'HttpOnly browser refresh-token cookie. Cookie refresh also requires X-CSRF-Token.',
      },
      'verith_refresh',
    );

  for (const [name, description] of Object.entries(TAG_DESCRIPTIONS)) {
    builder = builder.addTag(name, description);
  }
  return builder.build();
}

export function enhanceOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  addReusableComponents(document);
  const usedTags = new Set<string>();

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, candidate] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !candidate) continue;
      const operation = candidate as VerithOperationObject;
      operation.tags?.forEach((tag) => usedTags.add(tag));
      enhanceOperation(document, path, method, operation);
    }
  }

  document.tags = [...usedTags]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      name,
      description:
        TAG_DESCRIPTIONS[name] ?? `${name} API operations and workflows.`,
    }));
  return document;
}

function enhanceOperation(
  document: OpenAPIObject,
  path: string,
  method: string,
  operation: VerithOperationObject,
): void {
  operation.summary ||= inferSummary(operation.operationId, method, path);
  operation.description ||= inferDescription(operation, path);
  operation.parameters = enhanceParameters(operation.parameters ?? []);
  if (operation.requestBody && !('$ref' in operation.requestBody)) {
    operation.requestBody.description ||= describeRequestBody(
      operation.requestBody.content,
    );
  }

  addSuccessDocumentation(path, operation);
  addErrorDocumentation(path, method, operation);
  addRequestIdHeaderToResponses(operation);
  addAuthenticationHeaders(path, operation);

  operation['x-verith-access'] = operation.security?.length
    ? path.includes('/admin/')
      ? 'authenticated-admin'
      : 'authenticated'
    : 'public';
  operation['x-verith-response-envelope'] =
    !isRawResponse(path) && !hasNoContentResponse(operation);

  document.components ??= {};
}

function addReusableComponents(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas = {
    ...(document.components.schemas ?? {}),
    ApiResponseMeta: {
      type: 'object',
      required: ['requestId', 'timestamp'],
      properties: {
        requestId: {
          type: 'string',
          example: 'req_01J5F4Y7J8W3K9M2Q6R1T0VABC',
          description: 'Request correlation identifier.',
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          example: '2026-08-11T12:00:00.000Z',
        },
      },
    },
    ApiSuccessResponse: {
      type: 'object',
      required: ['success', 'message', 'data', 'meta'],
      properties: {
        success: { type: 'boolean', enum: [true], example: true },
        message: {
          type: 'string',
          example: 'Request completed successfully',
        },
        data: {
          description: 'Operation-specific response payload.',
        },
        meta: { $ref: '#/components/schemas/ApiResponseMeta' },
      },
    },
    ApiError: {
      type: 'object',
      required: ['code', 'details'],
      properties: {
        code: {
          type: 'string',
          example: 'VALIDATION_ERROR',
          description: 'Stable machine-readable application error code.',
        },
        details: {
          nullable: true,
          description: 'Safe structured error details when available.',
        },
      },
    },
    ApiErrorResponse: {
      type: 'object',
      required: ['success', 'message', 'error', 'meta'],
      properties: {
        success: { type: 'boolean', enum: [false], example: false },
        message: { type: 'string', example: 'Request validation failed' },
        error: { $ref: '#/components/schemas/ApiError' },
        meta: { $ref: '#/components/schemas/ApiResponseMeta' },
      },
    },
  };

  document.components.parameters = {
    ...(document.components.parameters ?? {}),
    RequestIdHeader: {
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      description:
        'Optional 8–128 character correlation identifier. A generated value is used when omitted or invalid.',
      schema: {
        type: 'string',
        minLength: 8,
        maxLength: 128,
        pattern: '^[a-zA-Z0-9._:-]+$',
        example: 'client_01J5F4Y7J8W3K9M2',
      },
    },
  };

  const errorResponse = (description: string): ResponseObject => ({
    description,
    headers: requestIdResponseHeader(),
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiErrorResponse' },
      },
    },
  });
  document.components.responses = {
    ...(document.components.responses ?? {}),
    BadRequest: errorResponse('Request validation failed.'),
    Unauthorized: errorResponse('Authentication is missing or invalid.'),
    Forbidden: errorResponse(
      'The authenticated account does not have the required role or permission.',
    ),
    NotFound: errorResponse('The requested resource was not found.'),
    Conflict: errorResponse(
      'The request conflicts with the current resource state or a uniqueness constraint.',
    ),
    TooManyRequests: errorResponse('The endpoint rate limit was exceeded.'),
    InternalServerError: errorResponse('An unexpected server error occurred.'),
    ServiceUnavailable: errorResponse(
      'A required dependency or external provider is temporarily unavailable.',
    ),
  };
}

function enhanceParameters(
  parameters: Array<ParameterObject | ReferenceObject>,
): Array<ParameterObject | ReferenceObject> {
  const enhanced = parameters.map((parameter) => {
    if ('$ref' in parameter) return parameter;
    parameter.description ||=
      PARAMETER_DESCRIPTIONS[parameter.name] ??
      `Value of the ${parameter.name} ${parameter.in} parameter.`;
    if (parameter.schema && !('$ref' in parameter.schema)) {
      repairPrimitiveSchema(parameter.schema);
      parameter.schema.example ??= PARAMETER_EXAMPLES[parameter.name];
    }
    return parameter;
  });
  if (
    !enhanced.some(
      (parameter) =>
        '$ref' in parameter && parameter.$ref.endsWith('/RequestIdHeader'),
    )
  ) {
    enhanced.push({ $ref: '#/components/parameters/RequestIdHeader' });
  }
  return enhanced;
}

function repairPrimitiveSchema(schema: SchemaObject): void {
  const referencesObject = schema.allOf?.some(
    (entry) => '$ref' in entry && entry.$ref.endsWith('/Object'),
  );
  if (!referencesObject) return;
  if (
    typeof schema.minimum === 'number' ||
    typeof schema.maximum === 'number' ||
    typeof schema.default === 'number'
  ) {
    delete schema.allOf;
    schema.type = 'integer';
  }
}

function describeRequestBody(
  content: Record<string, { schema?: SchemaObject | ReferenceObject }>,
): string {
  const schema = content['application/json']?.schema;
  if (schema && '$ref' in schema) {
    return `JSON payload validated as ${schema.$ref.split('/').at(-1)}.`;
  }
  return 'Validated request payload.';
}

function addSuccessDocumentation(
  path: string,
  operation: OperationObject,
): void {
  const successEntries = Object.entries(operation.responses).filter(
    ([status]) => status.startsWith('2'),
  );
  for (const [status, responseOrReference] of successEntries) {
    if (!responseOrReference) continue;
    if ('$ref' in responseOrReference) continue;
    const response = responseOrReference;
    response.description = successDescription(status, response.description);
    if (status === '204') {
      delete response.content;
      continue;
    }
    const raw = RAW_RESPONSE_CONTENT.find((item) => item.matches(path));
    if (raw) {
      response.content = {
        [raw.mediaType]: { schema: raw.schema },
      };
      if (raw.mediaType !== 'text/event-stream') {
        response.headers = {
          ...(response.headers ?? {}),
          'Content-Disposition': {
            description: 'Attachment filename selected by the server.',
            schema: { type: 'string' },
          },
        };
      }
      continue;
    }

    const existing = response.content?.['application/json']?.schema;
    response.content = {
      ...(response.content ?? {}),
      'application/json': {
        schema: envelopeSchema(existing),
      },
    };
  }
}

function envelopeSchema(
  dataSchema?: SchemaObject | ReferenceObject,
): SchemaObject | ReferenceObject {
  if (!dataSchema) {
    return { $ref: '#/components/schemas/ApiSuccessResponse' };
  }
  if (isEnvelopeSchema(dataSchema)) return dataSchema;
  return {
    allOf: [
      { $ref: '#/components/schemas/ApiSuccessResponse' },
      {
        type: 'object',
        properties: { data: dataSchema },
      },
    ],
  };
}

function isEnvelopeSchema(schema: SchemaObject | ReferenceObject): boolean {
  if ('$ref' in schema) {
    return schema.$ref === '#/components/schemas/ApiSuccessResponse';
  }
  return Boolean(
    schema.allOf?.some(
      (entry) =>
        '$ref' in entry &&
        entry.$ref === '#/components/schemas/ApiSuccessResponse',
    ),
  );
}

function addErrorDocumentation(
  path: string,
  method: string,
  operation: OperationObject,
): void {
  const hasInput =
    Boolean(operation.requestBody) ||
    operation.parameters?.some(
      (parameter) => !('$ref' in parameter) && parameter.in === 'query',
    );
  if (hasInput) addResponseReference(operation, '400', 'BadRequest');
  if (operation.security?.length) {
    addResponseReference(operation, '401', 'Unauthorized');
    if (path.includes('/admin/')) {
      addResponseReference(operation, '403', 'Forbidden');
    }
  }
  if (path.includes('{')) addResponseReference(operation, '404', 'NotFound');
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    addResponseReference(operation, '409', 'Conflict');
  }
  if (!path.endsWith('/health') && !path.includes('/health/')) {
    addResponseReference(operation, '429', 'TooManyRequests');
  }
  addResponseReference(operation, '500', 'InternalServerError');
  if (
    path.includes('/integrations/') ||
    path.includes('/health') ||
    path.includes('/uploads') ||
    path.includes('/verifications')
  ) {
    addResponseReference(operation, '503', 'ServiceUnavailable');
  }
}

function addResponseReference(
  operation: OperationObject,
  status: string,
  component: string,
): void {
  operation.responses[status] ??= {
    $ref: `#/components/responses/${component}`,
  };
}

function addRequestIdHeaderToResponses(operation: OperationObject): void {
  for (const response of Object.values(operation.responses)) {
    if (!response) continue;
    if ('$ref' in response) continue;
    response.headers = {
      ...(response.headers ?? {}),
      ...requestIdResponseHeader(),
    };
  }
}

function requestIdResponseHeader() {
  return {
    'X-Request-Id': {
      description: 'Effective request correlation identifier.',
      schema: { type: 'string' },
    },
  };
}

function addAuthenticationHeaders(
  path: string,
  operation: OperationObject,
): void {
  const addHeader = (
    name: string,
    description: string,
    required = false,
    example?: string,
  ) => {
    operation.parameters ??= [];
    if (
      operation.parameters.some(
        (parameter) =>
          !('$ref' in parameter) &&
          parameter.in === 'header' &&
          parameter.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return;
    operation.parameters.push({
      name,
      in: 'header',
      required,
      description,
      schema: { type: 'string', ...(example ? { example } : {}) },
    });
  };

  if (
    ['/auth/google', '/auth/login', '/auth/refresh'].some((suffix) =>
      path.endsWith(suffix),
    )
  ) {
    addHeader(
      'X-Client-Type',
      'Set to `mobile` to receive the refresh token in the JSON payload instead of browser cookies.',
      false,
      'mobile',
    );
  }
  if (path.endsWith('/auth/refresh')) {
    addHeader(
      'X-CSRF-Token',
      'Required when refreshing with the browser cookie; must match the `verith_csrf` cookie.',
    );
  }
  if (path.includes('/privacy/exports/') && path.endsWith('/download')) {
    addHeader(
      'X-Data-Export-Token',
      'One-time export token issued when the encrypted export was requested.',
      true,
    );
  }
}

function inferSummary(
  operationId: string | undefined,
  method: string,
  path: string,
): string {
  const action =
    operationId?.split('_').at(-1) ?? path.split('/').at(-1) ?? 'resource';
  const words = splitWords(action);
  const resource = inferResource(path);
  const [first = ''] = words.split(' ');
  const exactSummaries: Record<string, string> = {
    attempt: 'Submit challenge attempt',
    changePassword: 'Change password',
    forgotPassword: 'Request password reset',
    login: 'Log in',
    logout: 'Log out',
    logoutAll: 'Log out all sessions',
    me: 'Get current authenticated user',
    refresh: 'Refresh authentication tokens',
    resendVerification: 'Resend verification email',
    today: "Get today's challenge",
  };
  if (exactSummaries[action]) return exactSummaries[action];
  const exactResourceActions: Record<string, string> = {
    archive: 'Archive',
    cancel: 'Cancel',
    create: 'Create',
    delete: 'Delete',
    detail: 'Get',
    get: 'Get',
    list: 'List',
    publish: 'Publish',
    remove: 'Delete',
    retry: 'Retry',
    unpublish: 'Unpublish',
    update: 'Update',
  };
  if (exactResourceActions[action]) {
    return `${exactResourceActions[action]} ${resource}`;
  }
  const alreadyAction = new Set([
    'archive',
    'cancel',
    'complete',
    'confirm',
    'create',
    'delete',
    'download',
    'export',
    'generate',
    'get',
    'inspect',
    'link',
    'list',
    'login',
    'logout',
    'mark',
    'publish',
    'register',
    'request',
    'reset',
    'retry',
    'revoke',
    'search',
    'submit',
    'suspend',
    'unlink',
    'unpublish',
    'update',
    'verify',
  ]).has(first);
  if (alreadyAction) return capitalize(words);
  const verb =
    method === 'get'
      ? 'Get'
      : method === 'post'
        ? 'Create'
        : method === 'delete'
          ? 'Delete'
          : 'Update';
  return `${verb} ${words}`;
}

function inferResource(path: string): string {
  const segments = path
    .split('/')
    .filter(Boolean)
    .filter((segment) => segment !== 'api' && segment !== 'v1')
    .filter((segment) => !segment.startsWith('{'));
  const value = segments.at(-1) ?? 'resource';
  const singular = value.endsWith('ies')
    ? `${value.slice(0, -3)}y`
    : value.endsWith('s') && !value.endsWith('status')
      ? value.slice(0, -1)
      : value;
  return splitWords(singular.replace(/\.[a-z]+$/i, ''));
}

function inferDescription(operation: OperationObject, path: string): string {
  const access = operation.security?.length
    ? path.includes('/admin/')
      ? 'Requires an authenticated account with the endpoint’s administrative role.'
      : 'Requires a valid Verith access token.'
    : 'This operation is publicly accessible.';
  const response = hasNoContentResponse(operation)
    ? 'A successful request returns no response body.'
    : isRawResponse(path)
      ? 'The successful response is returned as the documented raw media type.'
      : 'Successful JSON is returned in the standard Verith response envelope.';
  return `${operation.summary}. ${access} ${response}`;
}

function successDescription(status: string, existing?: string): string {
  if (existing && existing !== 'Successful response') return existing;
  if (status === '201') return 'Resource created successfully.';
  if (status === '202') return 'Request accepted for asynchronous processing.';
  if (status === '204')
    return 'Request completed successfully with no content.';
  return 'Request completed successfully.';
}

function hasNoContentResponse(operation: OperationObject): boolean {
  return Boolean(operation.responses['204']);
}

function isRawResponse(path: string): boolean {
  return RAW_RESPONSE_CONTENT.some((entry) => entry.matches(path));
}

function splitWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const SWAGGER_UI_OPTIONS = {
  customSiteTitle: 'Verith API Documentation',
  swaggerOptions: {
    displayRequestDuration: true,
    filter: true,
    persistAuthorization: true,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
    tryItOutEnabled: false,
  },
  jsonDocumentUrl: 'api/docs-json',
  yamlDocumentUrl: 'api/docs-yaml',
} as const;
