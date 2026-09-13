import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { KpiTemplateService } from './kpi-template.service.js';
import {
  CreateTemplateDto,
  DuplicateTemplateDto,
  ListTemplatesQuery,
  SaveItemsDto,
  UpdateTemplateDto,
} from './dto/kpi-template.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

/** Đọc: ADMIN, HR, EXECUTIVE, MANAGER. STAFF không truy cập mẫu KPI. */
const VAI_TRO_DOC = [Role.ADMIN, Role.HR, Role.EXECUTIVE, Role.MANAGER] as const;

/**
 * Ghi: TRƯỞNG BỘ PHẬN và ADMIN — chốt 12/09/2026.
 *
 * Trước đây là ADMIN + HR. Đổi vì mẫu KPI là yêu cầu chuyên môn của từng
 * phòng: trưởng phòng Kỹ thuật mới biết kỹ sư triển khai phải đạt gì, HCNS
 * không nắm được. HCNS và ban giám đốc chỉ XEM. Trưởng phòng bị service
 * chặn trong phạm vi chức danh của phòng mình (`assertCoTheGhi`).
 */
const VAI_TRO_GHI = [Role.ADMIN, Role.MANAGER] as const;

@Controller('kpi-templates')
export class KpiTemplateController {
  constructor(private readonly service: KpiTemplateService) {}

  @Roles(...VAI_TRO_DOC)
  @Get()
  list(@Query() query: ListTemplatesQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(query, user);
  }

  @Roles(...VAI_TRO_DOC)
  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getById(id, user);
  }

  /**
   * Kiểm thử cây item mà không lưu.
   *
   * Giao diện gọi khi người dùng gõ, để hiện lỗi trọng số ngay tại chỗ thay
   * vì đợi tới lúc bấm Xuất bản mới báo.
   */
  @Roles(...VAI_TRO_DOC)
  @HttpCode(HttpStatus.OK)
  @Post(':id/validate')
  validate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveItemsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.validateItems(id, dto.items, user);
  }

  // --- Từ đây trở xuống chỉ ADMIN và HR ---

  @Roles(...VAI_TRO_GHI)
  @Post()
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.create(dto, user, req.ip);
  }

  @Roles(...VAI_TRO_GHI)
  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.duplicate(id, dto, user, req.ip);
  }

  @Roles(...VAI_TRO_GHI)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.update(id, dto, user, req.ip);
  }

  /** Lưu cả cây một lần, trong một transaction. Không kiểm trọng số. */
  @Roles(...VAI_TRO_GHI)
  @Put(':id/items')
  saveItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveItemsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.saveItems(id, dto.items, user, req.ip);
  }

  /** Chỗ DUY NHẤT kiểm trọng số. Qua hết mới được PUBLISHED. */
  // 200 chứ không phải 201: xuất bản là đổi trạng thái của mẫu đã có,
  // không tạo ra tài nguyên mới.
  @Roles(...VAI_TRO_GHI)
  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.publish(id, user, req.ip);
  }

  @Roles(...VAI_TRO_GHI)
  @Delete(':id')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.deactivate(id, user, req.ip);
  }

  /** Kích hoạt lại mẫu đã ngừng — đường thoát khi bấm nhầm "Vô hiệu hoá". */
  @Roles(...VAI_TRO_GHI)
  @HttpCode(HttpStatus.OK)
  @Post(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.activate(id, user, req.ip);
  }

  /**
   * Endpoint RIÊNG để sửa mẫu hệ thống. Chỉ ADMIN.
   *
   * Tách khỏi `PUT :id/items` để việc sửa mục "Chấp hành nội quy" — thứ áp
   * dụng cho toàn bộ nhân sự công ty — không thể xảy ra do bấm nhầm trên
   * màn hình soạn mẫu thường.
   */
  @Roles(Role.ADMIN)
  @Put(':id/system-items')
  saveSystemItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveItemsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.saveItems(id, dto.items, user, req.ip);
  }
}
