/**
 * Kiểm tra biến môi trường ngay lúc khởi động.
 *
 * Thiếu JWT_SECRET mà vẫn chạy được là kịch bản tệ nhất: hệ thống hoạt
 * động bình thường nhưng token ký bằng chuỗi rỗng. Thà chết ngay lúc bật.
 */
export interface AppEnv {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL_DAYS: number;
  PORT: number;
  /** Danh sách địa chỉ frontend được phép gọi API, phân tách bằng dấu phẩy. */
  CORS_ORIGINS: string[];
}

const MIN_SECRET_LENGTH = 32;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const loi: string[] = [];

  const databaseUrl = String(raw.DATABASE_URL ?? '');
  if (!databaseUrl) {
    loi.push('DATABASE_URL chưa được đặt');
  }

  const jwtSecret = String(raw.JWT_SECRET ?? '');
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    loi.push(
      `JWT_SECRET phải có ít nhất ${MIN_SECRET_LENGTH} ký tự ` +
        `(hiện có ${jwtSecret.length}). Sinh bằng: ` +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }

  const accessTtl = String(raw.JWT_ACCESS_TTL ?? '15m');

  const refreshDays = Number(raw.JWT_REFRESH_TTL_DAYS ?? 7);
  if (!Number.isInteger(refreshDays) || refreshDays < 1) {
    loi.push('JWT_REFRESH_TTL_DAYS phải là số nguyên dương');
  }

  const corsOrigins = String(raw.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (corsOrigins.length === 0) {
    loi.push('CORS_ORIGINS phải có ít nhất một địa chỉ');
  }

  const port = Number(raw.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    loi.push('PORT phải là số cổng hợp lệ');
  }

  if (loi.length > 0) {
    throw new Error(
      'Cấu hình môi trường không hợp lệ:\n' +
        loi.map((m) => `  - ${m}`).join('\n') +
        '\nXem .env.example để biết cần những biến nào.',
    );
  }

  return {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_ACCESS_TTL: accessTtl,
    JWT_REFRESH_TTL_DAYS: refreshDays,
    PORT: port,
    CORS_ORIGINS: corsOrigins,
  };
}
