import { describe, it, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET / — health check, không cần đăng nhập', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok', service: 'kpi-api' });
  });

  it('GET /departments/tree — không có token thì bị chặn', () => {
    return request(app.getHttpServer()).get('/departments/tree').expect(401);
  });

  it('POST /auth/login — sai mật khẩu thì 401', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@hmico.vn', password: 'sai-mat-khau' })
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
