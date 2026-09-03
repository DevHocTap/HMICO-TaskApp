import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PeriodService } from './period.service.js';
import { CreatePeriodDto, ListPeriodsQuery } from './dto/period.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

/** Ai được chốt sổ tháng — HCNS chốt 03/09/2026, câu A5. */
const VAI_TRO_CHOT_SO = [Role.ADMIN, Role.HR, Role.EXECUTIVE] as const;

@Controller('periods')
export class PeriodController {
  constructor(private readonly service: PeriodService) {}

  /**
   * Đọc: MỌI vai trò đã đăng nhập.
   *
   * Kỳ đánh giá là dữ liệu TOÀN CÔNG TY, không thuộc phòng ban nào, nên
   * không đi qua `getAccessibleDepartmentIds` và không có gì để giấu: đây
   * chỉ là danh sách tháng. Mọi màn hình phiếu KPI đều cần nó để đổ vào ô
   * chọn kỳ — `/kpi/assign` của MANAGER, `/kpi/my` của STAFF.
   *
   * Siết vai trò ở đây là bắt giao diện đi đường vòng lấy tên kỳ từ chỗ
   * khác, đúng cái bẫy đã ghi ở `docs/no-ky-thuat.md` mục cây phòng ban
   * rỗng cho STAFF.
   */
  @Get()
  list(@Query() query: ListPeriodsQuery) {
    return this.service.list(query);
  }

  /**
   * Tạo kỳ thủ công: ADMIN và HR.
   *
   * Kỳ hàng tháng do tác vụ định kỳ tự sinh; đường tạo tay chỉ dùng khi cần
   * một kỳ quá khứ mà tác vụ cố ý không bù.
   */
  @Roles(Role.ADMIN, Role.HR)
  @Post()
  create(
    @Body() dto: CreatePeriodDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.create(dto, user, req.ip);
  }

  /**
   * Khoá và mở kỳ: ADMIN, HR, EXECUTIVE — HCNS chốt 03/09/2026 (câu A5).
   *
   * Khoá kỳ là quyết định NGHIỆP VỤ (chốt sổ tháng), không phải thao tác kỹ
   * thuật, nên người chốt sổ phải là HCNS hoặc ban giám đốc. ADMIN giữ quyền
   * theo câu A4 — tài khoản quản trị có toàn quyền.
   *
   * Trưởng phòng muốn sửa điểm của kỳ đã chốt thì gửi yêu cầu cho HCNS hoặc
   * ban giám đốc mở lại; mọi lần mở đều ghi nhật ký kèm tên người thao tác.
   */
  @Roles(...VAI_TRO_CHOT_SO)
  @HttpCode(HttpStatus.OK)
  @Post(':id/lock')
  lock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.lock(id, user, req.ip);
  }

  @Roles(...VAI_TRO_CHOT_SO)
  @HttpCode(HttpStatus.OK)
  @Post(':id/unlock')
  unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.unlock(id, user, req.ip);
  }
}
