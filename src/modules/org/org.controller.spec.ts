import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { OrgController } from './org.controller.js';
import { OrgService } from './org.service.js';

describe('OrgController', () => {
  let controller: OrgController;
  const getDepartmentTree = vi.fn();

  beforeEach(async () => {
    getDepartmentTree.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrgController],
      providers: [{ provide: OrgService, useValue: { getDepartmentTree } }],
    }).compile();

    controller = module.get<OrgController>(OrgController);
  });

  it('khai báo được', () => {
    expect(controller).toBeDefined();
  });

  it('GET /departments/tree gọi thẳng xuống service', async () => {
    const tree = [{ id: 'hmico', code: 'HMICO', name: 'Công ty HMICO', children: [] }];
    getDepartmentTree.mockResolvedValue(tree);

    await expect(controller.getTree()).resolves.toEqual(tree);
    expect(getDepartmentTree).toHaveBeenCalledOnce();
  });
});
