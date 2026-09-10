import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.validation.js';
import { taoKiemTraOrigin } from './config/cors.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Bắt mọi exception lọt ra khỏi controller: dịch lỗi Prisma sang mã HTTP
  // đúng, và không để chi tiết nội bộ của lỗi 5xx lọt ra ngoài.
  app.useGlobalFilters(new AllExceptionsFilter());

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

  /**
   * Số lớp proxy phía trước. BẮT BUỘC đặt khi chạy sau nginx.
   *
   * Không đặt thì `request.ip` là địa chỉ của nginx (127.0.0.1), nên cả
   * công ty gộp thành một IP: hạn mức đăng nhập theo IP vô nghĩa, và
   * `AuditLog.ipAddress` ghi nhầm cho mọi thao tác.
   *
   * Đặt SỐ LỚP chứ không phải `true`: `true` nghĩa là tin toàn bộ chuỗi
   * `X-Forwarded-For`, mà chuỗi đó do client gửi lên — ai cũng giả được IP
   * để né hạn mức. Một nginx phía trước thì đặt 1.
   */
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

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
