import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.validation.js';
import { taoKiemTraOrigin } from './config/cors.js';

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

  const config = app.get(ConfigService<AppEnv, true>);

  // Frontend React chạy khác cổng nên phải bật CORS. KHÔNG dùng
  // enableCors() trần — như vậy là cho phép mọi trang web gọi API này.
  app.enableCors({
    origin: taoKiemTraOrigin(
      config.get('CORS_ORIGINS', { infer: true }),
      process.env.NODE_ENV !== 'production',
    ),
    credentials: true,
  });
  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap();
