import { describe, it, expect, beforeEach } from 'vitest';
import { LoginAttemptService } from './login-attempt.service.js';

const EMAIL = 'admin@hmico.vn';
const PHUT = 60_000;

describe('LoginAttemptService', () => {
  let service: LoginAttemptService;
  const t0 = Date.now();

  beforeEach(() => {
    service = new LoginAttemptService();
  });

  it('chưa sai lần nào thì không bị khoá', () => {
    expect(service.getLockRemainingMinutes(EMAIL, t0)).toBe(0);
  });

  it('sai đúng 10 lần vẫn CHƯA khoá', () => {
    for (let i = 0; i < 10; i++) service.recordFailure(EMAIL, t0);
    expect(service.getLockRemainingMinutes(EMAIL, t0)).toBe(0);
  });

  it('sai lần thứ 11 thì khoá', () => {
    for (let i = 0; i < 11; i++) service.recordFailure(EMAIL, t0);
    expect(service.getLockRemainingMinutes(EMAIL, t0)).toBe(15);
  });

  it('hết 15 phút thì tự mở khoá', () => {
    for (let i = 0; i < 11; i++) service.recordFailure(EMAIL, t0);

    expect(service.getLockRemainingMinutes(EMAIL, t0 + 14 * PHUT)).toBe(1);
    expect(service.getLockRemainingMinutes(EMAIL, t0 + 16 * PHUT)).toBe(0);
  });

  it('sai rải rác quá cửa sổ 15 phút thì đếm lại từ đầu, không khoá', () => {
    // 10 lần sai, rồi 10 lần nữa sau khi cửa sổ đã trôi qua
    for (let i = 0; i < 10; i++) service.recordFailure(EMAIL, t0);
    for (let i = 0; i < 10; i++) service.recordFailure(EMAIL, t0 + 20 * PHUT);

    expect(service.getLockRemainingMinutes(EMAIL, t0 + 20 * PHUT)).toBe(0);
  });

  it('đăng nhập thành công xoá sạch lịch sử sai', () => {
    for (let i = 0; i < 10; i++) service.recordFailure(EMAIL, t0);
    service.reset(EMAIL);

    // Sau khi reset, 10 lần sai nữa vẫn chưa đủ để khoá
    for (let i = 0; i < 10; i++) service.recordFailure(EMAIL, t0);
    expect(service.getLockRemainingMinutes(EMAIL, t0)).toBe(0);
  });

  it('đếm riêng cho từng email', () => {
    for (let i = 0; i < 11; i++) service.recordFailure(EMAIL, t0);

    expect(service.getLockRemainingMinutes(EMAIL, t0)).toBe(15);
    expect(service.getLockRemainingMinutes('nguoikhac@hmico.vn', t0)).toBe(0);
  });

  it('email KHÔNG tồn tại cũng bị khoá như email thật', () => {
    // Nếu chỉ khoá email có thật thì thông báo khoá sẽ tiết lộ email nào
    // có thật — đúng thứ mà login đang cố giấu.
    const emailBia = 'khong-he-co@hmico.vn';
    for (let i = 0; i < 11; i++) service.recordFailure(emailBia, t0);

    expect(service.getLockRemainingMinutes(emailBia, t0)).toBe(15);
  });
});
