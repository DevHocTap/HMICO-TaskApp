import { PrismaClient, Role, KpiSection, PeriodType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Mật khẩu dev. Lấy từ biến môi trường để không cố định trong mã nguồn.
// Chỉ dùng cho máy dev — mọi tài khoản đều mustChangePassword = true.
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Hmico@2026';

async function resetData() {
  // Xoá theo thứ tự phụ thuộc để chạy lại seed được mà không cần reset
  await prisma.auditLog.deleteMany();
  await prisma.scorecardEvent.deleteMany();
  await prisma.scorecardItem.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.kpiTemplateItem.deleteMany();
  await prisma.kpiTemplate.deleteMany();
  await prisma.period.deleteMany();
  await prisma.refreshToken.deleteMany();
  // Gỡ trưởng bộ phận trước khi xoá user (Department.managerId trỏ tới User)
  await prisma.department.updateMany({ data: { managerId: null } });
  await prisma.user.updateMany({ data: { managerId: null } });
  await prisma.user.deleteMany();
  await prisma.jobTitle.deleteMany();
  await prisma.department.deleteMany();
}

async function seedDepartments() {
  // Bốn tầng: Công ty -> Chi nhánh -> Phòng -> Tổ
  const hmico = await prisma.department.create({
    data: { code: 'HMICO', name: 'Công ty HMICO' },
  });

  const hn = await prisma.department.create({
    data: { code: 'HN', name: 'Hà Nội (trụ sở)', parentId: hmico.id },
  });

  const hcm = await prisma.department.create({
    data: { code: 'HCM', name: 'Chi nhánh HCM', parentId: hmico.id },
  });

  const phongHaNoi = [
    { code: 'BGD', name: 'Ban giám đốc' },
    { code: 'MKT', name: 'Phòng Truyền thông Marketing' },
    { code: 'KD', name: 'Phòng Kinh doanh' },
    { code: 'DA', name: 'Phòng Dự án' },
    { code: 'MH', name: 'Phòng Mua hàng' },
    { code: 'RND', name: 'Phòng R&D' },
    { code: 'KT', name: 'Phòng Kỹ thuật' },
    { code: 'TCKT', name: 'Phòng Tài chính kế toán' },
    { code: 'HCNS', name: 'Phòng Hành chính nhân sự' },
  ];

  const byCode = new Map<string, string>();
  byCode.set('HMICO', hmico.id);
  byCode.set('HN', hn.id);
  byCode.set('HCM', hcm.id);

  for (const p of phongHaNoi) {
    const dept = await prisma.department.create({
      data: { code: p.code, name: p.name, parentId: hn.id },
    });
    byCode.set(p.code, dept.id);
  }

  // Hai tổ thuộc phòng Kỹ thuật — tầng thứ tư
  for (const to of [
    { code: 'KT-BT', name: 'Tổ Bảo trì bảo hành' },
    { code: 'KT-SD', name: 'Tổ Shop Drawing' },
  ]) {
    const dept = await prisma.department.create({
      data: { code: to.code, name: to.name, parentId: byCode.get('KT')! },
    });
    byCode.set(to.code, dept.id);
  }

  return byCode;
}

async function seedJobTitles(dept: Map<string, string>) {
  // TẠM: tên chức danh phòng Kỹ thuật cần đối chiếu với BM.01-KPI.KYTHUAT.
  // Sửa lại khi có bốn file Excel thật.
  const titles = [
    { code: 'KT-TP', name: 'Trưởng phòng Kỹ thuật', dept: 'KT' },
    { code: 'KT-GS', name: 'Giám sát kỹ thuật', dept: 'KT' },
    { code: 'KT-SD-NV', name: 'Nhân viên Shop Drawing', dept: 'KT-SD' },
    { code: 'KT-BT-NV', name: 'Nhân viên Bảo trì bảo hành', dept: 'KT-BT' },
    { code: 'RND-TP', name: 'Trưởng phòng R&D', dept: 'RND' },
    { code: 'HCNS-NV', name: 'Chuyên viên Hành chính nhân sự', dept: 'HCNS' },
    { code: 'BGD-GD', name: 'Giám đốc', dept: 'BGD' },
  ];

  const byCode = new Map<string, string>();
  for (const t of titles) {
    const jt = await prisma.jobTitle.create({
      data: { code: t.code, name: t.name, departmentId: dept.get(t.dept)! },
    });
    byCode.set(t.code, jt.id);
  }
  return byCode;
}

async function seedUsers(dept: Map<string, string>, jobTitle: Map<string, string>) {
  const passwordHash = await argon2.hash(SEED_PASSWORD);

  const people = [
    {
      employeeCode: 'HM001',
      email: 'admin@hmico.vn',
      fullName: 'Quản trị hệ thống',
      role: Role.ADMIN,
      dept: 'HMICO',
    },
    {
      employeeCode: 'HM002',
      email: 'giamdoc@hmico.vn',
      fullName: 'Giám đốc điều hành',
      role: Role.EXECUTIVE,
      dept: 'BGD',
      jobTitle: 'BGD-GD',
    },
    {
      employeeCode: 'HM003',
      email: 'hcns@hmico.vn',
      fullName: 'Chuyên viên HCNS',
      role: Role.HR,
      dept: 'HCNS',
      jobTitle: 'HCNS-NV',
    },
    {
      employeeCode: 'HM004',
      email: 'truongphong.kythuat@hmico.vn',
      fullName: 'Trưởng phòng Kỹ thuật',
      role: Role.MANAGER,
      dept: 'KT',
      jobTitle: 'KT-TP',
      level: 'M2',
    },
    {
      employeeCode: 'HM005',
      email: 'to.shopdrawing@hmico.vn',
      fullName: 'Tổ trưởng Shop Drawing',
      role: Role.MANAGER,
      dept: 'KT-SD',
      jobTitle: 'KT-GS',
      level: 'M1',
      manager: 'HM004',
    },
    {
      employeeCode: 'HM006',
      email: 'sd.nhanvien1@hmico.vn',
      fullName: 'Nhân viên Shop Drawing 1',
      role: Role.STAFF,
      dept: 'KT-SD',
      jobTitle: 'KT-SD-NV',
      level: 'S2',
      manager: 'HM005',
    },
    {
      employeeCode: 'HM007',
      email: 'sd.nhanvien2@hmico.vn',
      fullName: 'Nhân viên Shop Drawing 2',
      role: Role.STAFF,
      dept: 'KT-SD',
      jobTitle: 'KT-SD-NV',
      level: 'S1',
      manager: 'HM005',
    },
    {
      employeeCode: 'HM009',
      email: 'truongphong.rnd@hmico.vn',
      fullName: 'Trưởng phòng R&D',
      role: Role.MANAGER,
      dept: 'RND',
      jobTitle: 'RND-TP',
      level: 'M2',
    },
    {
      employeeCode: 'HM008',
      email: 'bt.nhanvien1@hmico.vn',
      fullName: 'Nhân viên Bảo trì 1',
      role: Role.STAFF,
      dept: 'KT-BT',
      jobTitle: 'KT-BT-NV',
      level: 'S1',
      manager: 'HM004',
    },
  ];

  const byCode = new Map<string, string>();

  // Vòng 1: tạo người, chưa nối managerId (người quản lý có thể chưa tồn tại)
  for (const p of people) {
    const user = await prisma.user.create({
      data: {
        employeeCode: p.employeeCode,
        email: p.email,
        fullName: p.fullName,
        passwordHash,
        role: p.role,
        departmentId: dept.get(p.dept)!,
        jobTitleId: p.jobTitle ? jobTitle.get(p.jobTitle)! : null,
        level: p.level ?? null,
      },
    });
    byCode.set(p.employeeCode, user.id);
  }

  // Vòng 2: nối quan hệ báo cáo
  for (const p of people) {
    if (!p.manager) continue;
    await prisma.user.update({
      where: { id: byCode.get(p.employeeCode)! },
      data: { managerId: byCode.get(p.manager)! },
    });
  }

  // Vòng 3: chốt trưởng bộ phận — đây mới là thứ quyết định luồng duyệt
  const truongBoPhan: Array<[string, string]> = [
    ['KT', 'HM004'],
    ['KT-SD', 'HM005'],
    ['KT-BT', 'HM004'],
    ['RND', 'HM009'],
    ['HCNS', 'HM003'],
  ];
  for (const [deptCode, empCode] of truongBoPhan) {
    await prisma.department.update({
      where: { id: dept.get(deptCode)! },
      data: { managerId: byCode.get(empCode)! },
    });
  }

  return byCode;
}

async function seedPeriods() {
  // Kỳ năm 2026 -> quý 3 -> tháng 08, 09.
  // dueDate = ngày 02 tháng kế tiếp (docs mục 5.5).
  const nam = await prisma.period.create({
    data: {
      name: 'Năm 2026',
      type: PeriodType.YEAR,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });

  const quy3 = await prisma.period.create({
    data: {
      name: 'Quý 3/2026',
      type: PeriodType.QUARTER,
      parentId: nam.id,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-09-30'),
    },
  });

  await prisma.period.create({
    data: {
      name: 'Tháng 08/2026',
      type: PeriodType.MONTH,
      parentId: quy3.id,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-31'),
      dueDate: new Date('2026-09-02'),
    },
  });

  await prisma.period.create({
    data: {
      name: 'Tháng 09/2026',
      type: PeriodType.MONTH,
      parentId: quy3.id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      dueDate: new Date('2026-10-02'),
    },
  });
}

async function seedComplianceTemplate() {
  // Mục 2 "Chấp hành nội quy" — giống nhau cho mọi chức danh, hệ thống tự
  // nối vào mọi phiếu. Ba tiêu chí lá, mỗi cái 10%, tổng 30 (docs mục 2).
  const template = await prisma.kpiTemplate.create({
    data: {
      code: 'SYS-COMPLIANCE',
      name: 'Chấp hành nội quy (áp dụng mọi chức danh)',
      isSystem: true,
      version: 1,
    },
  });

  const tieuChi = [
    'Số lần đi trễ / về sớm không phép (trên 30 phút)',
    'Vi phạm bộ phận chưa xử lý kịp thời',
    'Giữ gìn văn hoá doanh nghiệp, chấp hành nội quy lao động',
  ];

  for (const [i, name] of tieuChi.entries()) {
    await prisma.kpiTemplateItem.create({
      data: {
        templateId: template.id,
        section: KpiSection.COMPLIANCE,
        orderIndex: i + 1,
        name,
        weight: 10,
      },
    });
  }

  // Mẫu BSC_WORK theo chức danh chưa seed — chờ bốn file Excel thật của
  // phòng Kỹ thuật (docs mục 9.2).
}

async function main() {
  await resetData();

  const dept = await seedDepartments();
  const jobTitle = await seedJobTitles(dept);
  const users = await seedUsers(dept, jobTitle);
  await seedPeriods();
  await seedComplianceTemplate();

  console.log('Seed xong:');
  console.log(`  ${dept.size} phòng ban (bốn tầng)`);
  console.log(`  ${jobTitle.size} chức danh`);
  console.log(`  ${users.size} người dùng, mật khẩu băm bằng argon2`);
  console.log('  4 kỳ (năm -> quý -> 2 tháng)');
  console.log('  1 mẫu hệ thống COMPLIANCE (3 tiêu chí, tổng 30)');
  console.log(`\n  Mật khẩu dev: ${SEED_PASSWORD}  (đặt lại qua SEED_PASSWORD)`);
  console.log('  Mọi tài khoản đều mustChangePassword = true');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
