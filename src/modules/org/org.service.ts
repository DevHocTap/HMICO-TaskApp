import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  async getDepartmentTree() {
    const all = await this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, parentId: true },
    });

    // Dựng cây từ danh sách phẳng
    const map = new Map<string, any>();
    all.forEach((d) => map.set(d.id, { ...d, children: [] }));

    const roots: any[] = [];
    all.forEach((d) => {
      const node = map.get(d.id);
      if (d.parentId) {
        map.get(d.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }
}