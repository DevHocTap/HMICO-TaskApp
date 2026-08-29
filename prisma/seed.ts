import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Cây phòng ban: Công ty -> các phòng
  const company = await prisma.department.create({
    data: { code: 'HM', name: 'Công ty Hoàng Minh' },
  });

  const rnd = await prisma.department.create({
    data: { code: 'RND', name: 'Phòng R&D', parentId: company.id },
  });

  const hr = await prisma.department.create({
    data: { code: 'HR', name: 'Phòng Nhân sự', parentId: company.id },
  });

  // Người dùng mẫu (mật khẩu tạm, sẽ băm ở bước làm auth)
  const admin = await prisma.user.create({
    data: {
      employeeCode: 'HM001',
      email: 'admin@hoangminh.vn',
      fullName: 'Quản trị hệ thống',
      passwordHash: 'TAM_THOI_CHUA_HASH',
      role: Role.ADMIN,
      departmentId: company.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      employeeCode: 'HM002',
      email: 'truongphong.rnd@hoangminh.vn',
      fullName: 'Trưởng phòng R&D',
      passwordHash: 'TAM_THOI_CHUA_HASH',
      role: Role.MANAGER,
      departmentId: rnd.id,
      managerId: admin.id,
    },
  });

  await prisma.user.create({
    data: {
      employeeCode: 'HM003',
      email: 'nhanvien1@hoangminh.vn',
      fullName: 'Nhân viên R&D 1',
      passwordHash: 'TAM_THOI_CHUA_HASH',
      role: Role.STAFF,
      departmentId: rnd.id,
      managerId: manager.id,
    },
  });

  console.log('Seed xong:', { company: company.name, rnd: rnd.name, hr: hr.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());