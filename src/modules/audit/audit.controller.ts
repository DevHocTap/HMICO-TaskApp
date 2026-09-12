import { BadRequestException, Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditQueryService, TRAN_XUAT_EXCEL } from './audit-query.service.js';
import { AuditExcelService } from './audit-excel.service.js';
import { AuditService } from './audit.service.js';
import { ListAuditLogsQuery } from './dto/audit.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

/**
 * Đọc nhật ký thao tác.
 *
 * CHỈ ĐỌC — không có endpoint sửa hay xoá, và sẽ không bao giờ có. Nhật ký
 * sửa được thì không còn là bằng chứng.
 *
 * `HR` và `MANAGER` KHÔNG vào được: nhật ký ghi lại chính thao tác của họ
 * (đặt lại mật khẩu, đổi vai trò, chấm điểm), nên cho họ đọc là để đối
 * tượng bị giám sát tự kiểm tra mình.
 */
@Roles(Role.ADMIN, Role.EXECUTIVE)
@Controller('audit-logs')
export class AuditController {
  constructor(
    private readonly queries: AuditQueryService,
    private readonly excel: AuditExcelService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: ListAuditLogsQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.queries.list(query, user);
  }

  /**
   * Xuất nhật ký ra .xlsx theo đúng bộ lọc đang xem. Cùng phạm vi loại với
   * `list` (ban giám đốc chỉ được `Scorecard`). Tự ghi một dòng nhật ký về
   * việc xuất — tải nhật ký về cũng là một thao tác cần dấu vết.
   */
  @Get('export')
  async export(
    @Query() query: ListAuditLogsQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: { set: (h: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    const { total, dongs } = await this.queries.layDeXuat(query, user);
    if (dongs === null) {
      throw new BadRequestException(
        `Bộ lọc hiện có ${total} dòng, vượt trần ${TRAN_XUAT_EXCEL}. Thu hẹp khoảng ngày hoặc loại đối tượng rồi xuất lại.`,
      );
    }
    const file = await this.excel.buildWorkbook(dongs);
    const ten = this.excel.fileName();

    await this.audit.log({
      actorId: user.id,
      entityType: 'Report',
      entityId: 'audit-logs',
      action: 'EXPORT_AUDIT',
      after: { soDong: dongs.length, boLoc: { ...query } },
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ten}"`,
      'Content-Length': String(file.length),
    });
    return new StreamableFile(file);
  }
}
