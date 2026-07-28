import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { ResponseInterceptor } from '../src/core/interceptors/response.interceptor';
import { RequestIdMiddleware } from '../src/core/middleware/request-id.middleware';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/')
      .expect(200)
      .expect('X-Request-Id', /^req_/);
    const body = JSON.parse(response.text) as {
      success: boolean;
      data: { name: string; status: string };
      meta: { requestId: string };
    };

    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      name: 'Verith API',
      status: 'operational',
      documentation: '/api/docs',
    });
    expect(body.meta.requestId).toMatch(/^req_/);
  });
});
