import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListUsersQuery } from '../../modules/org/dto/user.dto.js';

describe('BoolQuery qua ListUsersQuery', () => {
  it('"false" thành false — không phải Boolean("false") = true', () => {
    const q = plainToInstance(ListUsersQuery, { isActive: 'false' });
    expect(q.isActive).toBe(false);
    expect(validateSync(q)).toHaveLength(0);
  });

  it('"true" thành true', () => {
    const q = plainToInstance(ListUsersQuery, { mustChangePassword: 'true' });
    expect(q.mustChangePassword).toBe(true);
    expect(validateSync(q)).toHaveLength(0);
  });

  it('chuỗi khác bị @IsBoolean từ chối', () => {
    const q = plainToInstance(ListUsersQuery, { isActive: 'yes' });
    expect(validateSync(q).length).toBeGreaterThan(0);
  });

  it('không gửi thì undefined, không lọc', () => {
    const q = plainToInstance(ListUsersQuery, {});
    expect(q.isActive).toBeUndefined();
    expect(q.mustChangePassword).toBeUndefined();
  });
});
