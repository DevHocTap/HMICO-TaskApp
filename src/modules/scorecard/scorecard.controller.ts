import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ScorecardService } from './scorecard.service.js';
import { ScorecardQueryService } from './scorecard-query.service.js';
import { ScorecardAssignService } from './scorecard-assign.service.js';
import {
  BatchCreateScorecardDto,
  BatchProposeDto,
  CopyFromPeriodDto,
  CreateScorecardDto,
  DisputeDto,
  ListScorecardsQuery,
  ProposeDto,
  ReadinessQuery,
  SaveScorecardItemsDto,
} from './dto/scorecard.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

/** Ai được sinh phiếu và gửi ký: quản trị, HR, và trưởng bộ phận. */
const VAI_TRO_GIAO_KPI = [Role.ADMIN, Role.HR, Role.MANAGER] as const;

@Controller('scorecards')
export class ScorecardController {
  constructor(
    private readonly scorecards: ScorecardService,
    private readonly queries: ScorecardQueryService,
    private readonly assign: ScorecardAssignService,
  ) {}

  // ------------------------------------------------------------------ đọc

  /** Phiếu của chính mình. Mọi vai trò đều gọi được. */
  @Get('my')
  my(@Query('periodId') periodId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.queries.myScorecards(periodId, user);
  }

  /** Nguồn dữ liệu cho trang "Việc của tôi". */
  @Get('pending-my-action')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.queries.pendingMyAction(user);
  }

  /** Ba thứ chặn việc giao KPI, kiểm trước khi vào kỳ mới. */
  @Roles(...VAI_TRO_GIAO_KPI, Role.EXECUTIVE)
  @Get('readiness')
  readiness(@Query() query: ReadinessQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.queries.readiness(query.departmentId, user);
  }

  @Get()
  list(@Query() query: ListScorecardsQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.queries.list(query, user);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queries.getById(id, user);
  }

  // ------------------------------------------------------------ sinh phiếu

  @Roles(...VAI_TRO_GIAO_KPI)
  @Post()
  create(
    @Body() dto: CreateScorecardDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.scorecards.create(dto.userId, dto.periodId, user, dto.evaluatorId, req.ip);
  }

  @Roles(...VAI_TRO_GIAO_KPI)
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  batch(
    @Body() dto: BatchCreateScorecardDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.scorecards.createBatch(
      dto.departmentId,
      dto.periodId,
      user,
      dto.userIds,
      dto.evaluatorId,
      req.ip,
    );
  }

  /** Tính năng quyết định hệ thống có được dùng thật hay không. */
  @Roles(...VAI_TRO_GIAO_KPI)
  @Post('copy-from-period')
  @HttpCode(HttpStatus.OK)
  copy(
    @Body() dto: CopyFromPeriodDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.scorecards.copyFromPeriod(
      dto.departmentId,
      dto.sourcePeriodId,
      dto.targetPeriodId,
      user,
      req.ip,
    );
  }

  // -------------------------------------------------------------- ký nhận

  @Roles(...VAI_TRO_GIAO_KPI)
  @Post(':id/propose')
  @HttpCode(HttpStatus.OK)
  propose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.assign.propose(id, user, dto.note, req.ip);
  }

  @Roles(...VAI_TRO_GIAO_KPI)
  @Post('batch-propose')
  @HttpCode(HttpStatus.OK)
  batchPropose(
    @Body() dto: BatchProposeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.assign.batchPropose(dto.departmentId, dto.periodId, user, req.ip);
  }

  /** Chỉ chủ sở hữu phiếu. Không gắn @Roles: STAFF cũng phải gọi được. */
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.assign.accept(id, user, req.ip);
  }

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  dispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisputeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.assign.dispute(id, dto.reason, user, req.ip);
  }

  /** Lưu cả cây item một lần: thêm, sửa, xoá dòng trong một transaction. */
  @Roles(...VAI_TRO_GIAO_KPI)
  @Put(':id/items')
  saveItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveScorecardItemsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.assign.saveItems(id, dto.items, user, req.ip);
  }
}
