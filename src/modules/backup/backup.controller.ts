import { Body, Controller, Get, Param, Post, Req, Res, StreamableFile } from '@nestjs/common';
import { IsString } from 'class-validator';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { BackupService } from './backup.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

class RestoreDto {
  /** Phải gõ đúng tên file — xác nhận có chủ ý, không phải bấm OK cho qua. */
  @IsString() xacNhan!: string;
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

  /** Khôi phục ĐÈ database đang chạy — xem điều kiện ở `BackupService.khoiPhuc`. */
  @Post(':tenFile/restore')
  restore(
    @Param('tenFile') tenFile: string,
    @Body() dto: RestoreDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.backup.khoiPhuc(tenFile, dto.xacNhan, user, req.ip);
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
