import type { OpenAPIObject } from '@nestjs/swagger';
import { enhanceOpenApiDocument } from './openapi-document';

describe('enhanceOpenApiDocument', () => {
  it('adds complete operation, envelope, parameter, and error documentation', () => {
    const document = enhanceOpenApiDocument({
      openapi: '3.0.0',
      info: { title: 'Test', version: '1' },
      paths: {
        '/api/v1/widgets/{id}': {
          get: {
            operationId: 'WidgetsController_get',
            tags: ['Application'],
            security: [{ bearer: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: '' } },
          },
        },
      },
      components: {},
    });

    const operation = document.paths['/api/v1/widgets/{id}']?.get;
    expect(operation?.summary).toBe('Get widget');
    expect(operation?.description).toContain('valid Verith access token');
    expect(operation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiSuccessResponse' },
        },
      },
    });
    expect(operation?.responses).toMatchObject({
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
      '429': { $ref: '#/components/responses/TooManyRequests' },
      '500': { $ref: '#/components/responses/InternalServerError' },
    });
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          description: 'MongoDB ObjectId of the target resource.',
        }),
        { $ref: '#/components/parameters/RequestIdHeader' },
      ]),
    );
  });

  it('documents raw downloads without the JSON envelope', () => {
    const document = enhanceOpenApiDocument({
      openapi: '3.0.0',
      info: { title: 'Test', version: '1' },
      paths: {
        '/api/v1/reports/{id}/export/pdf': {
          get: {
            operationId: 'ReportsController_pdfExport',
            tags: ['Reports'],
            responses: { '200': { description: '' } },
          },
        },
      },
      components: {},
    });

    const operation = document.paths['/api/v1/reports/{id}/export/pdf']?.get;
    expect(operation?.responses['200']).toMatchObject({
      content: {
        'application/pdf': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    });
    expect(
      (operation as OperationWithVerithExtensions | undefined)?.[
        'x-verith-response-envelope'
      ],
    ).toBe(false);
  });

  it('can enhance a document repeatedly without nesting envelopes', () => {
    const document: OpenAPIObject = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1' },
      paths: {
        '/api/v1/widgets': {
          get: {
            operationId: 'WidgetsController_list',
            tags: ['Widgets'],
            responses: { '200': { description: '' } },
          },
        },
      },
      components: {},
    };

    enhanceOpenApiDocument(document);
    enhanceOpenApiDocument(document);

    expect(
      document.paths['/api/v1/widgets']?.get?.responses['200'],
    ).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiSuccessResponse' },
        },
      },
    });
    expect(document.tags).toContainEqual({
      name: 'Widgets',
      description: 'Widgets API operations and workflows.',
    });
  });
});

type OperationWithVerithExtensions = NonNullable<
  OpenAPIObject['paths'][string]['get']
> & {
  'x-verith-response-envelope'?: boolean;
};
