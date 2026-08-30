import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'vai_tro_duoc_phep';

/** Giới hạn endpoint cho một số vai trò. Không gắn = mọi vai trò đã đăng nhập. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
