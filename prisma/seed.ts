import { PrismaClient, Role, KpiSection, PeriodType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Mật khẩu dev. Lấy từ biến môi trường để không cố định trong mã nguồn.
// Chỉ dùng cho máy dev — mọi tài khoản đều mustChangePassword = true.
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Hmico@2026';

/** Cây phòng ban, xếp theo thứ tự cha trước con. */
const DEPARTMENTS: Array<{ code: string; name: string; parent?: string }> = [
  { code: 'HMICO', name: 'Công ty HMICO' },

  { code: 'HN', name: 'Hà Nội (trụ sở)', parent: 'HMICO' },
  { code: 'BGD', name: 'Ban giám đốc', parent: 'HN' },
  { code: 'MKT', name: 'Phòng Truyền thông Marketing', parent: 'HN' },
  { code: 'KD', name: 'Phòng Kinh doanh', parent: 'HN' },
  { code: 'DA', name: 'Phòng Dự án', parent: 'HN' },
  { code: 'MH', name: 'Phòng Mua hàng', parent: 'HN' },
  { code: 'RND', name: 'Phòng R&D', parent: 'HN' },
  { code: 'KT', name: 'Phòng Kỹ thuật', parent: 'HN' },
  { code: 'KT-BT', name: 'Tổ Bảo trì bảo hành', parent: 'KT' },
  { code: 'KT-SD', name: 'Tổ Shop Drawing', parent: 'KT' },
  { code: 'TCKT', name: 'Phòng Tài chính kế toán', parent: 'HN' },
  { code: 'HCNS', name: 'Phòng Hành chính nhân sự', parent: 'HN' },

  { code: 'HCM', name: 'Chi nhánh HCM', parent: 'HMICO' },
  { code: 'KD-HCM', name: 'Phòng Kinh doanh HCM', parent: 'HCM' },
  { code: 'KT-HCM', name: 'Phòng Kỹ thuật HCM', parent: 'HCM' },
];

/**
 * Chức danh.
 *
 * Bốn chức danh phòng Kỹ thuật lấy từ bốn file Excel KPI thật. Các chức
 * danh còn lại là tối thiểu để dựng được bộ dữ liệu kiểm phân quyền —
 * chưa đối chiếu biểu mẫu thật của các phòng đó.
 *
 * `dept: null` nghĩa là dùng chung toàn công ty.
 */
const JOB_TITLES: Array<{
  code: string;
  name: string;
  dept: string | null;
  description?: string;
}> = [
  // Bốn chức danh phòng Kỹ thuật — có biểu mẫu KPI thật
  { code: 'KT-KSTK', name: 'Kỹ sư triển khai', dept: 'KT' },
  { code: 'KT-KSCH', name: 'Kỹ sư cấu hình', dept: 'KT' },
  { code: 'KT-SD-NV', name: 'Nhân viên Shop Drawing', dept: 'KT-SD' },
  { code: 'KT-BH-NV', name: 'Nhân viên Bảo hành', dept: 'KT-BT' },

  // Chức danh dùng chung, chưa đối chiếu biểu mẫu thật
  {
    code: 'TP',
    name: 'Trưởng phòng',
    dept: null,
    description: 'Dùng chung cho mọi phòng',
  },
  { code: 'TT', name: 'Tổ trưởng', dept: null, description: 'Dùng chung cho mọi tổ' },
  { code: 'BGD-GD', name: 'Giám đốc', dept: 'BGD' },
  { code: 'HCNS-CV', name: 'Chuyên viên Hành chính nhân sự', dept: 'HCNS' },
  { code: 'KD-NV', name: 'Nhân viên Kinh doanh', dept: null },
];

interface SeedUser {
  employeeCode: string;
  email: string;
  fullName: string;
  role: Role;
  dept: string;
  jobTitle?: string;
  level?: string;
  /** employeeCode của người quản lý trực tiếp. */
  manager?: string;
  /** Đặt làm trưởng bộ phận của phòng này. */
  managerOf?: string;
}

const USERS: SeedUser[] = [
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
    level: 'E1',
  },
  {
    employeeCode: 'HM003',
    email: 'hcns@hmico.vn',
    fullName: 'Chuyên viên Hành chính nhân sự',
    role: Role.HR,
    dept: 'HCNS',
    jobTitle: 'HCNS-CV',
    level: 'S3',
  },

  // --- Trưởng bộ phận: mỗi phòng có nhân viên đều có một người ---
  {
    employeeCode: 'HM004',
    email: 'truongphong.kythuat@hmico.vn',
    fullName: 'Trưởng phòng Kỹ thuật',
    role: Role.MANAGER,
    dept: 'KT',
    jobTitle: 'TP',
    level: 'M2',
    managerOf: 'KT',
  },
  {
    employeeCode: 'HM005',
    email: 'truongphong.rnd@hmico.vn',
    fullName: 'Trưởng phòng R&D',
    role: Role.MANAGER,
    dept: 'RND',
    jobTitle: 'TP',
    level: 'M2',
    managerOf: 'RND',
  },
  {
    employeeCode: 'HM006',
    email: 'totruong.shopdrawing@hmico.vn',
    fullName: 'Tổ trưởng Shop Drawing',
    role: Role.MANAGER,
    dept: 'KT-SD',
    jobTitle: 'TT',
    level: 'M1',
    manager: 'HM004',
    managerOf: 'KT-SD',
  },
  {
    employeeCode: 'HM007',
    email: 'totruong.baotri@hmico.vn',
    fullName: 'Tổ trưởng Bảo trì bảo hành',
    role: Role.MANAGER,
    dept: 'KT-BT',
    jobTitle: 'TT',
    level: 'M1',
    manager: 'HM004',
    managerOf: 'KT-BT',
  },
  {
    employeeCode: 'HM008',
    email: 'truongphong.kythuat.hcm@hmico.vn',
    fullName: 'Trưởng phòng Kỹ thuật HCM',
    role: Role.MANAGER,
    dept: 'KT-HCM',
    jobTitle: 'TP',
    level: 'M2',
    managerOf: 'KT-HCM',
  },

  // --- Nhân viên ---
  {
    employeeCode: 'HM009',
    email: 'sd.nhanvien1@hmico.vn',
    fullName: 'Nhân viên Shop Drawing 1',
    role: Role.STAFF,
    dept: 'KT-SD',
    jobTitle: 'KT-SD-NV',
    level: 'S2',
    manager: 'HM006',
  },
  {
    employeeCode: 'HM010',
    email: 'sd.nhanvien2@hmico.vn',
    fullName: 'Nhân viên Shop Drawing 2',
    role: Role.STAFF,
    dept: 'KT-SD',
    jobTitle: 'KT-SD-NV',
    level: 'S1',
    manager: 'HM006',
  },
  {
    employeeCode: 'HM011',
    email: 'bh.nhanvien1@hmico.vn',
    fullName: 'Nhân viên Bảo hành 1',
    role: Role.STAFF,
    dept: 'KT-BT',
    jobTitle: 'KT-BH-NV',
    level: 'S2',
    manager: 'HM007',
  },
  {
    employeeCode: 'HM012',
    email: 'kt.trienkhai1@hmico.vn',
    fullName: 'Kỹ sư triển khai 1',
    role: Role.STAFF,
    dept: 'KT',
    jobTitle: 'KT-KSTK',
    level: 'S3',
    manager: 'HM004',
  },
  {
    employeeCode: 'HM013',
    email: 'kt.cauhinh1@hmico.vn',
    fullName: 'Kỹ sư cấu hình 1',
    role: Role.STAFF,
    dept: 'KT',
    jobTitle: 'KT-KSCH',
    level: 'S2',
    manager: 'HM004',
  },
  // Nhân viên chi nhánh HCM — để kiểm cách ly hai chi nhánh
  {
    employeeCode: 'HM014',
    email: 'hcm.nhanvien1@hmico.vn',
    fullName: 'Nhân viên Kỹ thuật HCM 1',
    role: Role.STAFF,
    dept: 'KT-HCM',
    jobTitle: 'KT-KSTK',
    level: 'S2',
    manager: 'HM008',
  },
];

/** Ba tiêu chí Mục 2 — giống nhau cho mọi chức danh (docs mục 2). */
const COMPLIANCE_ITEMS = [
  'Số lần đi trễ / về sớm không phép (trên 30 phút)',
  'Vi phạm bộ phận chưa xử lý kịp thời',
  'Giữ gìn văn hoá doanh nghiệp, chấp hành nội quy lao động',
];

/**
 * Xoá sạch trước khi tạo, theo thứ tự phụ thuộc.
 *
 * Department.managerId trỏ tới User còn User.departmentId trỏ ngược lại,
 * nên phải gỡ hai khoá ngoại đó trước khi xoá.
 */
async function resetData() {
  await prisma.auditLog.deleteMany();
  await prisma.scorecardEvent.deleteMany();
  await prisma.scorecardItem.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.kpiTemplateItem.deleteMany();
  await prisma.kpiTemplate.deleteMany();
  await prisma.period.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.department.updateMany({ data: { managerId: null } });
  await prisma.user.updateMany({ data: { managerId: null } });
  await prisma.user.deleteMany();
  await prisma.jobTitle.deleteMany();
  await prisma.department.deleteMany();
}

async function seedDepartments(): Promise<Map<string, string>> {
  const byCode = new Map<string, string>();
  // DEPARTMENTS xếp cha trước con nên tạo tuần tự là đủ, không cần hai vòng
  for (const d of DEPARTMENTS) {
    const created = await prisma.department.create({
      data: {
        code: d.code,
        name: d.name,
        parentId: d.parent ? byCode.get(d.parent)! : null,
      },
    });
    byCode.set(d.code, created.id);
  }
  return byCode;
}

async function seedJobTitles(dept: Map<string, string>): Promise<Map<string, string>> {
  const byCode = new Map<string, string>();
  for (const t of JOB_TITLES) {
    const created = await prisma.jobTitle.create({
      data: {
        code: t.code,
        name: t.name,
        description: t.description ?? null,
        departmentId: t.dept ? dept.get(t.dept)! : null,
      },
    });
    byCode.set(t.code, created.id);
  }
  return byCode;
}

async function seedUsers(
  dept: Map<string, string>,
  jobTitle: Map<string, string>,
): Promise<Map<string, string>> {
  const passwordHash = await argon2.hash(SEED_PASSWORD);
  const byCode = new Map<string, string>();

  // Vòng 1: tạo người. Chưa nối managerId vì người quản lý có thể chưa tồn tại.
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: {
        employeeCode: u.employeeCode,
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        role: u.role,
        departmentId: dept.get(u.dept)!,
        jobTitleId: u.jobTitle ? jobTitle.get(u.jobTitle)! : null,
        level: u.level ?? null,
        mustChangePassword: true,
      },
    });
    byCode.set(u.employeeCode, created.id);
  }

  // Vòng 2: quan hệ báo cáo
  for (const u of USERS.filter((x) => x.manager)) {
    await prisma.user.update({
      where: { id: byCode.get(u.employeeCode)! },
      data: { managerId: byCode.get(u.manager!)! },
    });
  }

  // Vòng 3: trưởng bộ phận — thứ quyết định luồng duyệt KPI
  for (const u of USERS.filter((x) => x.managerOf)) {
    await prisma.department.update({
      where: { id: dept.get(u.managerOf!)! },
      data: { managerId: byCode.get(u.employeeCode)! },
    });
  }

  return byCode;
}

async function seedPeriods() {
  // Năm 2026 -> Quý 3 -> tháng 08, 09.
  // dueDate = ngày 02 tháng kế tiếp (docs mục 5.5).
  const nam = await prisma.period.create({
    data: {
      name: 'Năm 2026',
      type: PeriodType.YEAR,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });
  const quy = await prisma.period.create({
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
      parentId: quy.id,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-31'),
      dueDate: new Date('2026-09-02'),
    },
  });
  await prisma.period.create({
    data: {
      name: 'Tháng 09/2026',
      type: PeriodType.MONTH,
      parentId: quy.id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      dueDate: new Date('2026-10-02'),
    },
  });
}

async function seedComplianceTemplate() {
  const template = await prisma.kpiTemplate.create({
    data: {
      code: 'SYS-COMPLIANCE',
      name: 'Chấp hành nội quy (áp dụng mọi chức danh)',
      isSystem: true,
      version: 1,
    },
  });

  for (const [i, name] of COMPLIANCE_ITEMS.entries()) {
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

  const soTruongBoPhan = await prisma.department.count({
    where: { managerId: { not: null } },
  });

  console.log('Seed xong:');
  console.log(`  ${dept.size} phòng ban (bốn tầng, hai chi nhánh)`);
  console.log(`  ${jobTitle.size} chức danh (4 của phòng Kỹ thuật lấy từ Excel thật)`);
  console.log(`  ${users.size} người dùng, mật khẩu băm bằng argon2`);
  console.log(`  ${soTruongBoPhan} phòng đã gán trưởng bộ phận`);
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
