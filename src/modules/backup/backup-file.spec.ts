import { describe, expect, it } from 'vitest';
import { bocDatabaseUrl, chonFileCanXoa, ngayTuTenFile, tenFileSaoLuu } from './backup-file.js';

const f = (ngay: string, gio = '020000') => `kpi_${ngay}_${gio}.dump`;

describe('tenFileSaoLuu', () => {
  it('đặt tên theo giờ Việt Nam, không theo UTC', () => {
    // 23:30 UTC ngày 14 = 06:30 ngày 15 giờ VN
    expect(tenFileSaoLuu(new Date('2026-09-14T23:30:00Z'))).toBe('kpi_2026-09-15_063000.dump');
  });
  it('đọc lại được ngày từ tên', () => {
    expect(ngayTuTenFile('kpi_2026-09-15_063000.dump')).toEqual({ nam: 2026, thang: 9, ngay: 15, khoa: '2026-09-15' });
    expect(ngayTuTenFile('ghi-chu.txt')).toBeNull();
  });
});

describe('chonFileCanXoa — ba bậc', () => {
  it('giữ N ngày gần nhất, kể cả nhiều bản trong cùng một ngày', () => {
    const files = [f('2026-09-10'), f('2026-09-11'), f('2026-09-12', '0200'), f('2026-09-12', '150000'), f('2026-09-13')];
    const xoa = chonFileCanXoa(files, 2, 0);
    // giữ 12 (cả hai bản) và 13; 10 và 11 là bản cuối tháng? không — cùng tháng 9, bản cuối tháng là 13 → 10, 11 bị xoá
    // nhưng bậc 3 giữ bản cuối năm = 13 (đã giữ). Vậy xoá 10, 11.
    expect(xoa.sort()).toEqual([f('2026-09-10'), f('2026-09-11')]);
  });

  it('giữ bản MUỘN NHẤT của mỗi tháng trong M tháng gần nhất', () => {
    const files = [
      f('2026-06-01'), f('2026-06-30'),
      f('2026-07-01'), f('2026-07-31'),
      f('2026-08-05'), f('2026-08-31'),
      f('2026-09-14'),
    ];
    const xoa = chonFileCanXoa(files, 1, 2);
    // bậc 1: ngày 14/09. bậc 2: 2 tháng gần nhất = 08 (31/08) và 09 (14/09). bậc 3: cuối năm 2026 = 14/09.
    expect(xoa.sort()).toEqual([f('2026-06-01'), f('2026-06-30'), f('2026-07-01'), f('2026-07-31'), f('2026-08-05')]);
  });

  it('bản cuối năm giữ vĩnh viễn dù đã quá cả hai bậc', () => {
    const files = [f('2024-12-31'), f('2025-03-01'), f('2025-12-31'), f('2026-09-14')];
    const xoa = chonFileCanXoa(files, 1, 1);
    expect(xoa).toEqual([f('2025-03-01')]);
  });

  it('không bao giờ xoá file không đúng khuôn tên', () => {
    const files = ['kpi_2026-09-14_020000.dump', 'kpi_2026-09-13_020000.dump', 'thu-cong.dump', 'README.txt'];
    expect(chonFileCanXoa(files, 1, 0)).toEqual(['kpi_2026-09-13_020000.dump']);
  });

  it('danh sách rỗng → không xoá gì', () => {
    expect(chonFileCanXoa([], 14, 12)).toEqual([]);
  });
});

describe('bocDatabaseUrl', () => {
  it('bóc đủ năm phần, giải mã ký tự đặc biệt trong mật khẩu', () => {
    expect(bocDatabaseUrl('postgresql://kpi_dev:p%40ss@localhost:5432/kpi_db?schema=public')).toEqual({
      host: 'localhost', port: '5432', user: 'kpi_dev', pass: 'p@ss', db: 'kpi_db',
    });
  });
});
