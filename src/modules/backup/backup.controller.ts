import { Controller, Get, Param, Post, Req, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { BackupService } from './backup.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

/** Chỉ ADMIN: file sao lưu chứa hash mật khẩu và điểm của mọi người. */
@Roles(Role.ADMIN)
@Controller('backups')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  async list() {
    const [trangThai, danhSach] = await Promise.all([this.backup.trangThai(), this.backup.danhSach()]);
    return { trangThai, danhSach };
  }

  @Post()
  run(@CurrentUser() user: AuthenticatedUser, @Req() req: RequestInfo) {
    return this.backup.saoLuu('THU_CONG', user, req.ip);
  }

  @Get(':tenFile/download')
  async download(
    @Param('tenFile') tenFile: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, kichThuoc } = await this.backup.moFile(tenFile, user, req.ip);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${tenFile}"`,
      'Content-Length': String(kichThuoc),
    });
    return new StreamableFile(stream);
  }
}
