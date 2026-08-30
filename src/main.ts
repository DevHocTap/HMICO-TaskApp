import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      // Cắt bỏ field không khai trong DTO thay vì lặng lẽ nhận vào
      whitelist: true,
      forbidNonWhitelisted: true,
      // Cho phép "3" -> 3 theo kiểu khai trong DTO
      transform: true,
    }),
  );

  // Frontend React chạy khác cổng nên phải bật CORS
  app.enableCors();

  const config = app.get(ConfigService<AppEnv, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap();
