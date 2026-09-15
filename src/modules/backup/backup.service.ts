import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { AppEnv } from '../../config/env.validation.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  bocDatabaseUrl,
  chonFileCanXoa,
  ngayTuTenFile,
  phanNgayVN,
  tenFileSaoLuu,
  type ThongTinBanSao,
} from './backup-file.js';

/** Quá số giờ này chưa có bản thành công thì Tổng quan của ADMIN báo đỏ. */
export const GIO_CANH_BAO_KHONG_CO_BAN = 36;

export interface TrangThaiSaoLuu {
  thuMuc: string;
  thuMucMirror: string | null;
  cheDo: 'local' | 'docker';
  dangChay: boolean;
  banGanNhat: ThongTinBanSao | null;
  /** ISO của lần chạy tự động kế tiếp theo Cài đặt; null nếu tắt. */
  lanKeTiep: string | null;
  quaHan: boolean;
  soBan: number;
  tongKichThuoc: number;
  /** Byte còn trống trên ổ chứa thư mục sao lưu; null nếu không đo được. */
  dungLuongTrong: number | null;
  loiGanNhat: { luc: string; thongDiep: string } | null;
}

/**
 * Sao lưu database bằng `pg_dump -Fc` (chốt 15/09/2026).
 *
 * Nguồn sự thật là THƯ MỤC FILE: mỗi `.dump` có một `.json` cạnh bên. Không
 * có bảng lịch sử trong database — DB hỏng thì bảng cũng hỏng theo, còn file
 * thì vẫn đọc được. AuditLog vẫn ghi mỗi lần chạy để tra "ai bấm, lúc nào".
 *
 * Khôi phục CỐ Ý không có ở đây: `scripts/khoi-phuc.sh` chạy trên máy chủ.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly thuMuc: string;
  private readonly thuMucMirror: string | null;
  private readonly cheDo: 'local' | 'docker';
  private readonly container: string;
  private readonly db: ReturnType<typeof bocDatabaseUrl>;
  /** Khoá trong bộ nhớ: một tiến trình (đã chốt 10/09) nên đủ; hai bản chạy song song là gấp đôi tải DB vô ích. */
  private dangChay = false;
  private loiGanNhat: TrangThaiSaoLuu['loiGanNhat'] = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.thuMuc = resolve(config.get('BACKUP_DIR', { infer: true }));
    const mirror = config.get('BACKUP_MIRROR_DIR', { infer: true });
    this.thuMucMirror = mirror ? resolve(mirror) : null;
    this.cheDo = config.get('BACKUP_MODE', { infer: true });
    this.container = config.get('BACKUP_DOCKER_CONTAINER', { infer: true });
    this.db = bocDatabaseUrl(config.get('DATABASE_URL', { infer: true }));
  }

  // ------------------------------------------------------------------ đọc

  async trangThai(): Promise<TrangThaiSaoLuu> {
    const ds = await this.danhSach();
    const ganNhat = ds[0] ?? null;
    const s = this.settings.lay().saoLuu;
    const lanKeTiep = s.tuDongHangDem ? this.lanChayKeTiep(s.gioChay) : null;
    const quaHan =
      !ganNhat || Date.now() - new Date(ganNhat.taoLuc).getTime() > GIO_CANH_BAO_KHONG_CO_BAN * 3_600_000;
    let dungLuongTrong: number | null = null;
    try {
      await mkdir(this.thuMuc, { recursive: true });
      const fs = await statfs(this.thuMuc);
      dungLuongTrong = Number(fs.bavail) * Number(fs.bsize);
    } catch {
      dungLuongTrong = null;
    }
    return {
      thuMuc: this.thuMuc,
      thuMucMirror: this.thuMucMirror,
      cheDo: this.cheDo,
      dangChay: this.dangChay,
      banGanNhat: ganNhat,
      lanKeTiep,
      quaHan,
      soBan: ds.length,
      tongKichThuoc: ds.reduce((t, b) => t + b.kichThuoc, 0),
      dungLuongTrong,
      loiGanNhat: this.loiGanNhat,
    };
  }

  /** Mọi bản trong thư mục, mới nhất trước. Bản thiếu `.json` (chép tay vào) vẫn liệt kê với thông tin tối thiểu. */
  async danhSach(): Promise<ThongTinBanSao[]> {
    await mkdir(this.thuMuc, { recursive: true });
    const ten = (await readdir(this.thuMuc)).filter((t) => t.endsWith('.dump'));
    const ds = await Promise.all(
      ten.map(async (tenFile): Promise<ThongTinBanSao> => {
        try {
          const raw = await readFile(join(this.thuMuc, `${tenFile}.json`), 'utf8');
          return { ...(JSON.parse(raw) as ThongTinBanSao), tenFile };
        } catch {
          const st = await stat(join(this.thuMuc, tenFile));
          return {
            tenFile,
            taoLuc: st.mtime.toISOString(),
            kichThuoc: st.size,
            nguon: 'THU_CONG',
            nguoiBamId: null,
            nguoiBamTen: null,
            migrationMoiNhat: null,
            giayChay: 0,
            daKiemTra: false,
            daChepSangMirror: false,
          };
        }
      }),
    );
    return ds.sort((a, b) => (a.tenFile < b.tenFile ? 1 : -1));
  }

  /** Luồng file để tải về — chỉ nhận ĐÚNG tên file trong thư mục, chặn `../`. */
  async moFile(tenFile: string, user: AuthenticatedUser, ipAddress?: string) {
    if (basename(tenFile) !== tenFile || !tenFile.endsWith('.dump')) {
      throw new NotFoundException('Không tìm thấy bản sao lưu');
    }
    const duongDan = join(this.thuMuc, tenFile);
    let st;
    try {
      st = await stat(duongDan);
    } catch {
      throw new NotFoundException('Không tìm thấy bản sao lưu');
    }
    await this.audit.log({
      actorId: user.id,
      entityType: 'Backup',
      entityId: tenFile,
      action: 'DOWNLOAD',
      after: { tenFile, kichThuoc: st.size },
      ipAddress,
    });
    return { stream: createReadStream(duongDan), kichThuoc: st.size };
  }

  // ------------------------------------------------------------------ ghi

  /** Chạy một bản. `actor` null = tự động theo lịch. */
  async saoLuu(
    nguon: 'TU_DONG' | 'THU_CONG',
    actor: AuthenticatedUser | null,
    ipAddress?: string,
  ): Promise<ThongTinBanSao> {
    if (this.dangChay) {
      throw new ConflictException('Đang có một bản sao lưu chạy dở, chờ xong rồi bấm lại');
    }
    this.dangChay = true;
    const batDau = new Date();
    const tenFile = tenFileSaoLuu(batDau);
    const duongDan = join(this.thuMuc, tenFile);
    try {
      await mkdir(this.thuMuc, { recursive: true });
      await this.chayPgDump(duongDan);
      const daKiemTra = await this.kiemTraFile(duongDan);
      if (!daKiemTra) {
        await rm(duongDan, { force: true });
        throw new Error('File dump tạo ra nhưng pg_restore không đọc được — đã xoá, không tính là bản sao');
      }
      const st = await stat(duongDan);
      let nguoiBamTen: string | null = null;
      if (actor) {
        const u = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { fullName: true } });
        nguoiBamTen = u?.fullName ?? null;
      }
      const thongTin: ThongTinBanSao = {
        tenFile,
        taoLuc: batDau.toISOString(),
        kichThuoc: st.size,
        nguon,
        nguoiBamId: actor?.id ?? null,
        nguoiBamTen,
        migrationMoiNhat: await this.migrationMoiNhat(),
        giayChay: Math.round((Date.now() - batDau.getTime()) / 1000),
        daKiemTra,
        daChepSangMirror: false,
      };
      thongTin.daChepSangMirror = await this.chepSangMirror(tenFile);
      await writeFile(join(this.thuMuc, `${tenFile}.json`), JSON.stringify(thongTin, null, 2));
      if (thongTin.daChepSangMirror) {
        await copyFile(join(this.thuMuc, `${tenFile}.json`), join(this.thuMucMirror!, `${tenFile}.json`));
      }

      const daXoa = await this.donBanCu();
      this.loiGanNhat = null;
      await this.audit.log({
        actorId: actor?.id ?? null,
        entityType: 'Backup',
        entityId: tenFile,
        action: nguon === 'TU_DONG' ? 'AUTO_BACKUP' : 'BACKUP',
        after: { tenFile, kichThuoc: st.size, giayChay: thongTin.giayChay, daChepSangMirror: thongTin.daChepSangMirror, daXoa },
        ipAddress,
      });
      this.logger.log(`Sao lưu xong ${tenFile} (${(st.size / 1_048_576).toFixed(1)} MB, ${thongTin.giayChay}s, dọn ${daXoa.length} bản cũ)`);
      return thongTin;
    } catch (error) {
      const thongDiep = error instanceof Error ? error.message : String(error);
      this.loiGanNhat = { luc: new Date().toISOString(), thongDiep };
      this.logger.error(`Sao lưu thất bại: ${thongDiep}`);
      await this.audit.log({
        actorId: actor?.id ?? null,
        entityType: 'Backup',
        entityId: tenFile,
        action: 'BACKUP_FAILED',
        after: { tenFile, loi: thongDiep },
        ipAddress,
      });
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(`Sao lưu thất bại: ${thongDiep}`);
    } finally {
      this.dangChay = false;
    }
  }

  // ----------------------------------------------------------- khôi phục

  /**
   * KHÔI PHỤC ĐÈ database đang chạy từ một bản trong thư mục (chốt 15/09:
   * người dùng yêu cầu có nút cho ADMIN, dù đã cảnh báo). Bốn lớp chặn:
   *  1. `xacNhan` phải gõ ĐÚNG tên file;
   *  2. bản sao phải có `.json` và migration TRÙNG với mã đang chạy — bản cũ
   *     hơn mã thì khôi phục xong app lỗi ngay, ca đó dùng script trên máy chủ;
   *  3. dump bản hiện tại ra `truoc-khoi-phuc_*.dump` trước khi ghi đè — lỡ
   *     nhầm còn đường lùi (bản này KHÔNG bị dọn tự động vì tên khác khuôn);
   *  4. khoá cùng cửa với sao lưu — không chạy chồng.
   * Sau khi đè: nối lại Prisma (bảng đã bị drop/tạo lại), nạp lại cache cài
   * đặt, rồi mới ghi AuditLog (bảng AuditLog cũng vừa bị thay).
   */
  async khoiPhuc(
    tenFile: string,
    xacNhan: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<{ tenFile: string; banTruocKhoiPhuc: string; giayChay: number }> {
    if (basename(tenFile) !== tenFile || !tenFile.endsWith('.dump')) {
      throw new NotFoundException('Không tìm thấy bản sao lưu');
    }
    if (xacNhan !== tenFile) {
      throw new BadRequestException('Gõ đúng tên file sao lưu để xác nhận khôi phục');
    }
    const duongDan = join(this.thuMuc, tenFile);
    let thongTin: ThongTinBanSao;
    try {
      thongTin = JSON.parse(await readFile(`${duongDan}.json`, 'utf8')) as ThongTinBanSao;
    } catch {
      throw new BadRequestException(
        'Bản này không có file .json kèm theo (chép tay vào?) nên không biết nó thuộc phiên bản mã nào — khôi phục bằng scripts/khoi-phuc.sh trên máy chủ',
      );
    }
    const migrationHienTai = await this.migrationMoiNhat();
    if (!thongTin.migrationMoiNhat || thongTin.migrationMoiNhat !== migrationHienTai) {
      throw new BadRequestException(
        `Bản sao ở migration ${thongTin.migrationMoiNhat ?? '?'}, mã đang chạy ở ${migrationHienTai ?? '?'} — khôi phục xong app sẽ lỗi. Dùng scripts/khoi-phuc.sh rồi chạy prisma migrate deploy`,
      );
    }
    if (this.dangChay) {
      throw new ConflictException('Đang có sao lưu chạy dở, chờ xong rồi bấm lại');
    }
    this.dangChay = true;
    const batDau = new Date();
    const banTruoc = tenFileSaoLuu(batDau).replace(/^kpi_/, 'truoc-khoi-phuc_');
    try {
      // Lớp 3: đường lùi
      await this.chayPgDump(join(this.thuMuc, banTruoc));
      if (!(await this.kiemTraFile(join(this.thuMuc, banTruoc)))) {
        throw new Error('Không dump được bản hiện tại để lùi — dừng, chưa đụng dữ liệu');
      }
      await writeFile(
        join(this.thuMuc, `${banTruoc}.json`),
        JSON.stringify(
          {
            tenFile: banTruoc,
            taoLuc: batDau.toISOString(),
            kichThuoc: (await stat(join(this.thuMuc, banTruoc))).size,
            nguon: 'THU_CONG',
            nguoiBamId: actor.id,
            nguoiBamTen: null,
            migrationMoiNhat: migrationHienTai,
            giayChay: 0,
            daKiemTra: true,
            daChepSangMirror: false,
          } satisfies ThongTinBanSao,
          null,
          2,
        ),
      );

      // Ghi đè. `--clean --if-exists`: xoá bảng cũ rồi tạo lại từ bản sao.
      await this.chayPgRestore(duongDan);

      // Bảng vừa bị drop/tạo lại: nối lại pool để bỏ plan cũ, nạp lại cache cài đặt
      await this.prisma.$disconnect();
      await this.prisma.$connect();
      await this.settings.napLai();

      const giayChay = Math.round((Date.now() - batDau.getTime()) / 1000);
      await this.audit.log({
        actorId: actor.id,
        entityType: 'Backup',
        entityId: tenFile,
        action: 'RESTORE',
        after: { tenFile, banTruocKhoiPhuc: banTruoc, giayChay },
        ipAddress,
      });
      this.logger.warn(`ĐÃ KHÔI PHỤC database từ ${tenFile} (bản lùi: ${banTruoc}, ${giayChay}s) — người bấm ${actor.id}`);
      return { tenFile, banTruocKhoiPhuc: banTruoc, giayChay };
    } catch (error) {
      const thongDiep = error instanceof Error ? error.message : String(error);
      this.loiGanNhat = { luc: new Date().toISOString(), thongDiep: `Khôi phục: ${thongDiep}` };
      this.logger.error(`Khôi phục thất bại: ${thongDiep}`);
      await this.audit
        .log({ actorId: actor.id, entityType: 'Backup', entityId: tenFile, action: 'RESTORE_FAILED', after: { tenFile, loi: thongDiep }, ipAddress })
        .catch(() => undefined);
      throw new ServiceUnavailableException(`Khôi phục thất bại: ${thongDiep}`);
    } finally {
      this.dangChay = false;
    }
  }

  private chayPgRestore(duongDan: string): Promise<void> {
    const { host, port, user, pass, db } = this.db;
    const chung = ['--clean', '--if-exists', '--no-owner', '--no-privileges', '-U', user, '-d', db];
    if (this.cheDo === 'docker') {
      return this.chayLenh('docker', ['exec', '-i', '-e', `PGPASSWORD=${pass}`, this.container, 'pg_restore', ...chung], {}, duongDan);
    }
    return this.chayLenh('pg_restore', ['-h', host, '-p', port, ...chung, duongDan], { PGPASSWORD: pass });
  }

  /** Xoá bản cũ theo ba bậc (file thuần quyết định), cả ở mirror. Trả tên các file đã xoá. */
  private async donBanCu(): Promise<string[]> {
    const s = this.settings.lay().saoLuu;
    const ten = (await readdir(this.thuMuc)).filter((t) => t.endsWith('.dump'));
    const canXoa = chonFileCanXoa(ten, s.giuBanNgay, s.giuBanThang);
    for (const t of canXoa) {
      await rm(join(this.thuMuc, t), { force: true });
      await rm(join(this.thuMuc, `${t}.json`), { force: true });
      if (this.thuMucMirror) {
        await rm(join(this.thuMucMirror, t), { force: true }).catch(() => undefined);
        await rm(join(this.thuMucMirror, `${t}.json`), { force: true }).catch(() => undefined);
      }
    }
    return canXoa;
  }

  private async chepSangMirror(tenFile: string): Promise<boolean> {
    if (!this.thuMucMirror) return false;
    try {
      await mkdir(this.thuMucMirror, { recursive: true });
      await copyFile(join(this.thuMuc, tenFile), join(this.thuMucMirror, tenFile));
      return true;
    } catch (error) {
      // Mirror hỏng (ổ chưa gắn) KHÔNG làm hỏng bản chính — chỉ ghi log để ADMIN thấy
      this.logger.warn(`Không chép được sang mirror ${this.thuMucMirror}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /** `pg_dump -Fc` ra file. Chế độ docker: dump trong container rồi stream stdout ra file trên máy chạy API. */
  private chayPgDump(duongDan: string): Promise<void> {
    const { host, port, user, pass, db } = this.db;
    const args =
      this.cheDo === 'docker'
        ? ['exec', '-e', `PGPASSWORD=${pass}`, this.container, 'pg_dump', '-Fc', '-U', user, '-d', db]
        : ['-Fc', '-h', host, '-p', port, '-U', user, '-d', db];
    const lenh = this.cheDo === 'docker' ? 'docker' : 'pg_dump';
    return this.chayLenhRaFile(lenh, args, { PGPASSWORD: pass }, duongDan);
  }

  /** `pg_restore --list` đọc được mục lục là file lành. */
  private async kiemTraFile(duongDan: string): Promise<boolean> {
    try {
      if (this.cheDo === 'docker') {
        // File nằm ngoài container: đẩy qua stdin
        await this.chayLenh('docker', ['exec', '-i', this.container, 'pg_restore', '--list'], {}, duongDan);
      } else {
        await this.chayLenh('pg_restore', ['--list', duongDan], {});
      }
      return true;
    } catch (error) {
      this.logger.error(`pg_restore --list thất bại: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  private async migrationMoiNhat(): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
      return rows[0]?.migration_name ?? null;
    } catch {
      return null;
    }
  }

  private lanChayKeTiep(gioChay: number): string {
    const bayGio = new Date();
    const p = phanNgayVN(bayGio);
    // Mốc hôm nay theo giờ VN = UTC (gio - 7)
    const homNay = Date.UTC(p.nam, p.thang - 1, p.ngay, gioChay - 7, 0, 0);
    const moc = homNay > bayGio.getTime() ? homNay : homNay + 86_400_000;
    return new Date(moc).toISOString();
  }

  /** Bản thành công gần nhất có nằm trong ngày (giờ VN) này chưa — để scheduler không chạy hai lần. */
  async daCoBanTrongNgay(d: Date): Promise<boolean> {
    const khoa = ngayTuTenFile(tenFileSaoLuu(d))?.khoa;
    const ds = await this.danhSach();
    return ds.some((b) => b.daKiemTra && ngayTuTenFile(b.tenFile)?.khoa === khoa);
  }

  // ------------------------------------------------------------ tiến trình con

  private chayLenhRaFile(lenh: string, args: string[], env: Record<string, string>, raFile: string): Promise<void> {
    return new Promise((ok, loi) => {
      const p = spawn(lenh, args, { env: { ...process.env, ...env } });
      const ghi = p.stdout.pipe(createWriteStream(raFile));
      let stderr = '';
      p.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      p.on('error', (e) => loi(new Error(`Không chạy được ${lenh}: ${e.message}`)));
      p.on('close', (code) => {
        ghi.end();
        if (code === 0) ok();
        else loi(new Error(`${lenh} thoát mã ${code}: ${stderr.trim().slice(0, 500)}`));
      });
    });
  }

  private chayLenh(lenh: string, args: string[], env: Record<string, string>, stdinFile?: string): Promise<void> {
    return new Promise((ok, loi) => {
      const p = spawn(lenh, args, { env: { ...process.env, ...env } });
      if (stdinFile) createReadStream(stdinFile).pipe(p.stdin);
      let stderr = '';
      p.stdout.on('data', () => undefined);
      p.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      p.on('error', (e) => loi(new Error(`Không chạy được ${lenh}: ${e.message}`)));
      p.on('close', (code) => (code === 0 ? ok() : loi(new Error(`${lenh} thoát mã ${code}: ${stderr.trim().slice(0, 500)}`))));
    });
  }
}
