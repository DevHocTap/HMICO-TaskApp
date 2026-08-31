import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator.js';
import { PUBLIC_KEY } from '../src/common/decorators/public.decorator.js';
import { MA_TRAN_PHAN_QUYEN, timDong } from './permission-matrix.js';

/** Một route thật, đọc ra từ ứng dụng đang chạy. */
interface RouteThat {
  method: string;
  path: string;
  roles: Role[] | undefined;
  isPublic: boolean;
}

const PHUONG_THUC: Record<string, string> = {
  '0': 'GET',
  '1': 'POST',
  '2': 'PUT',
  '3': 'DELETE',
  '4': 'PATCH',
};

describe('Ma trận phân quyền', () => {
  let app: INestApplication;
  let routes: RouteThat[];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const reflector = app.get(Reflector);
    // Duyệt bảng định tuyến của Express để lấy MỌI route đang phục vụ.
    // Đọc từ ứng dụng thật, không phải từ danh sách viết tay — thêm
    // endpoint mà quên khai quyền sẽ hiện ra ở đây.
    const server = app.getHttpAdapter().getInstance() as {
      router?: { stack: unknown[] };
      _router?: { stack: unknown[] };
    };
    const stack = (server.router ?? server._router)?.stack ?? [];

    routes = [];
    for (const lop of stack as Array<Record<string, any>>) {
      const route = lop.route as
        | { path: string; methods: Record<string, boolean>; stack: any[] }
        | undefined;
      if (!route) continue;

      for (const [m, bat] of Object.entries(route.methods)) {
        if (!bat) continue;
        const handler = route.stack?.[0]?.handle;
        const duong = route.path.replace(/^\//, '');
        routes.push({
          method: m.toUpperCase(),
          path: duong,
          roles: handler ? reflector.get<Role[]>(ROLES_KEY, handler) : undefined,
          isPublic: handler
            ? Boolean(reflector.get<boolean>(PUBLIC_KEY, handler))
            : false,
        });
      }
    }
    void PHUONG_THUC;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('tìm được route từ ứng dụng đang chạy', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  /**
   * ĐÂY LÀ TEST QUAN TRỌNG NHẤT.
   *
   * Thêm endpoint mà quên khai quyền trong ma trận thì đỏ ngay. Không có
   * nó, một endpoint mới có thể lọt ra production không ai kiểm quyền —
   * đúng như lỗi createBatch thiếu kiểm phạm vi đã xảy ra.
   */
  it('MỌI route đều có dòng trong ma trận phân quyền', () => {
    const thieu = routes
      .filter((r) => !timDong(r.method, r.path))
      .map((r) => `${r.method} /${r.path}`);

    expect(
      thieu,
      `Các endpoint sau chưa khai quyền trong test/permission-matrix.ts:\n` +
        thieu.map((t) => `  - ${t}`).join('\n'),
    ).toEqual([]);
  });

  it('ma trận không khai thừa route không tồn tại', () => {
    const coThat = new Set(routes.map((r) => `${r.method} ${r.path}`));
    const thua = MA_TRAN_PHAN_QUYEN.filter(
      (d) => !coThat.has(`${d.method} ${d.path}`),
    ).map((d) => `${d.method} /${d.path}`);

    expect(thua, `Ma trận khai route không còn tồn tại: ${thua.join(', ')}`).toEqual(
      [],
    );
  });

  describe('@Roles thật khớp với ma trận', () => {
    it('mỗi route có @Roles đúng như khai báo', () => {
      const lech: string[] = [];

      for (const r of routes) {
        const dong = timDong(r.method, r.path);
        if (!dong) continue;

        const thucTe = [...(r.roles ?? [])].sort();
        const khaiBao = [...dong.allowedRoles].sort();

        if (JSON.stringify(thucTe) !== JSON.stringify(khaiBao)) {
          lech.push(
            `${r.method} /${r.path}: code có [${thucTe.join(',') || '(không giới hạn)'}], ` +
              `ma trận khai [${khaiBao.join(',') || '(không giới hạn)'}]`,
          );
        }
      }

      expect(lech, lech.join('\n')).toEqual([]);
    });
  });

  describe('endpoint công khai phải khai rõ', () => {
    it('chỉ những route ghi chú "công khai" mới được gắn @Public()', () => {
      const batNgo = routes
        .filter((r) => r.isPublic)
        .filter((r) => !timDong(r.method, r.path)?.note?.includes('công khai'))
        .map((r) => `${r.method} /${r.path}`);

      expect(
        batNgo,
        `Route gắn @Public() nhưng ma trận không ghi là công khai: ${batNgo.join(', ')}`,
      ).toEqual([]);
    });

    it('route khai là công khai thì phải thật sự có @Public()', () => {
      const thieuPublic = MA_TRAN_PHAN_QUYEN.filter((d) =>
        d.note?.includes('công khai'),
      )
        .filter((d) => {
          const r = routes.find(
            (x) => x.method === d.method && x.path === d.path,
          );
          return r && !r.isPublic;
        })
        .map((d) => `${d.method} /${d.path}`);

      expect(thieuPublic, thieuPublic.join(', ')).toEqual([]);
    });
  });

  it('mọi thao tác ghi trên dữ liệu nhân sự đều giới hạn vai trò', () => {
    const hoLong = MA_TRAN_PHAN_QUYEN.filter(
      (d) =>
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(d.method) &&
        d.allowedRoles.length === 0 &&
        d.dataScope === 'none',
    ).map((d) => `${d.method} /${d.path}`);

    // Chỉ các endpoint auth công khai được phép nằm ở đây
    const chapNhan = ['POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout'];
    expect(hoLong.filter((x) => !chapNhan.includes(x))).toEqual([]);
  });
});
