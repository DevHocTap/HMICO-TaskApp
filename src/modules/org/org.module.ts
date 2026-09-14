import { Module } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentScopeService } from './department-scope.service.js';
import { JobTitlesService } from './job-titles.service.js';
import { JobTitlesController } from './job-titles.controller.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { ProfileService } from './profile.service.js';
import { ProfileController } from './profile.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  // UsersService cần TokenService để thu hồi refresh token khi đặt lại
  // mật khẩu hoặc vô hiệu hoá tài khoản
  imports: [AuthModule],
  providers: [
    DepartmentsService,
    JobTitlesService,
    UsersService,
    ProfileService,
    DepartmentScopeService,
  ],
  // ProfileController TRƯỚC UsersController: cả hai ở /users, `me/profile`
  // phải khớp trước `:id`.
  controllers: [DepartmentsController, JobTitlesController, ProfileController, UsersController],
  // DepartmentScopeService là hàm phân quyền dùng chung — mọi module cần
  // lọc dữ liệu theo phòng ban đều import OrgModule để lấy nó.
  exports: [DepartmentScopeService],
})
export class OrgModule {}
