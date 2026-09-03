import {
  PrismaClient,
  Role,
  KpiSection,
  PeriodType,
  TemplateStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
// Đuôi .ts (không phải .js): file này chỉ do node chạy trực tiếp bằng cơ chế
// bóc kiểu của Node 22, không đi qua tsc nên không có bản .js được sinh ra.
import { MAU_KPI_PHONG_KY_THUAT } from './kpi-templates.data.ts';

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
  { code: 'HCNS-TP', name: 'Trưởng phòng Hành chính nhân sự', dept: 'HCNS' },
  { code: 'HCNS-CV', name: 'Chuyên viên Hành chính nhân sự', dept: 'HCNS' },
  { code: 'KD-NV', name: 'Nhân viên Kinh doanh', dept: null },
];

interface SeedUser {
  employeeCode: string;
  email: string;
  fullName: string;
  role: Role;
  /**
   * `null` = KHÔNG thuộc phòng ban nào.
   *
   * Chỉ tài khoản quản trị hệ thống dùng tới: HCNS chốt 03/09/2026 (câu A4)
   * rằng đó là tài khoản kỹ thuật, không phải một vị trí nhân sự — không
   * thuộc phòng ban, không cần trưởng bộ phận, không áp KPI.
   */
  dept: string | null;
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
    dept: null,
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
    // HCNS chốt 03/09/2026 (câu B1): phòng HCNS phải có trưởng bộ phận để
    // chạy thử. Trước đây phòng này có người mà không có trưởng, nên chuyên
    // viên HCNS không sinh được phiếu KPI.
    employeeCode: 'HM015',
    email: 'truongphong.hcns@hmico.vn',
    fullName: 'Trưởng phòng Hành chính nhân sự',
    role: Role.HR,
    dept: 'HCNS',
    jobTitle: 'HCNS-TP',
    level: 'M2',
    managerOf: 'HCNS',
  },
  {
    employeeCode: 'HM003',
    email: 'hcns@hmico.vn',
    fullName: 'Chuyên viên Hành chính nhân sự',
    role: Role.HR,
    dept: 'HCNS',
    jobTitle: 'HCNS-CV',
    level: 'S3',
    manager: 'HM015',
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
        departmentId: u.dept ? dept.get(u.dept)! : null,
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
      code: '2026',
      name: 'Năm 2026',
      type: PeriodType.YEAR,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });
  const quy = await prisma.period.create({
    data: {
      code: '2026-Q3',
      name: 'Quý 3/2026',
      type: PeriodType.QUARTER,
      parentId: nam.id,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-09-30'),
    },
  });
  await prisma.period.create({
    data: {
      code: '2026-08',
      name: 'Tháng 08/2026',
      type: PeriodType.MONTH,
      parentId: quy.id,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-31'),
      submitDeadline: new Date('2026-09-02'),
    },
  });
  await prisma.period.create({
    data: {
      code: '2026-09',
      name: 'Tháng 09/2026',
      type: PeriodType.MONTH,
      parentId: quy.id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      submitDeadline: new Date('2026-10-02'),
    },
  });
}

async function seedComplianceTemplate() {
  const template = await prisma.kpiTemplate.create({
    data: {
      code: 'SYS-COMPLIANCE',
      name: 'Chấp hành nội quy (áp dụng mọi chức danh)',
      description:
        'Ba tiêu chí giống nhau ở mọi chức danh, hệ thống tự nối vào mọi phiếu.',
      isSystem: true,
      // Mẫu hệ thống xuất bản sẵn: nội dung cố định, đã đúng tổng 30
      status: TemplateStatus.PUBLISHED,
      version: 1,
    },
  });

  for (const [i, name] of COMPLIANCE_ITEMS.entries()) {
    await prisma.kpiTemplateItem.create({
      data: {
        templateId: template.id,
        section: KpiSection.COMPLIANCE,
        displayOrder: i + 1,
        name,
        weight: 10,
      },
    });
  }

  // Mẫu BSC_WORK theo chức danh chưa seed — chờ bốn file Excel thật của
  // phòng Kỹ thuật (docs mục 9.2).
}

/**
 * Bốn mẫu KPI thật của phòng Kỹ thuật, đọc từ file Excel.
 *
 * Tạo ở trạng thái PUBLISHED: nội dung lấy nguyên từ biểu mẫu công ty đang
 * dùng, đã đúng tổng 70 và mỗi nhóm con đúng 100.
 */
async function seedMauKyThuat(
  jobTitle: Map<string, string>,
  createdById: string,
): Promise<number> {
  let soMau = 0;

  for (const mau of MAU_KPI_PHONG_KY_THUAT) {
    const template = await prisma.kpiTemplate.create({
      data: {
        code: mau.code,
        name: mau.name,
        description: `Nhập từ ${mau.sourceFile}`,
        jobTitleId: jobTitle.get(mau.jobTitleCode) ?? null,
        isSystem: false,
        status: TemplateStatus.PUBLISHED,
        version: 1,
        createdById,
      },
    });

    for (const [i, tieuChi] of mau.criteria.entries()) {
      const cha = await prisma.kpiTemplateItem.create({
        data: {
          templateId: template.id,
          section: KpiSection.BSC_WORK,
          displayOrder: i + 1,
          name: tieuChi.name,
          description: tieuChi.description ?? null,
          weight: tieuChi.weight,
        },
      });

      for (const [j, con] of (tieuChi.children ?? []).entries()) {
        await prisma.kpiTemplateItem.create({
          data: {
            templateId: template.id,
            parentId: cha.id,
            section: KpiSection.BSC_WORK,
            displayOrder: j + 1,
            name: con.name,
            measurementText: con.measurementText ?? null,
            measureMethod: con.measureMethod ?? null,
            weight: con.weight,
          },
        });
      }
    }
    soMau += 1;
  }
  return soMau;
}

async function main() {
  await resetData();

  const dept = await seedDepartments();
  const jobTitle = await seedJobTitles(dept);
  const users = await seedUsers(dept, jobTitle);
  await seedPeriods();
  await seedComplianceTemplate();
  const soMauKyThuat = await seedMauKyThuat(jobTitle, users.get('HM001')!);

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
  console.log(`  ${soMauKyThuat} mẫu KPI phòng Kỹ thuật, nhập từ Excel thật`);
  console.log(`\n  Mật khẩu dev: ${SEED_PASSWORD}  (đặt lại qua SEED_PASSWORD)`);
  console.log('  Mọi tài khoản đều mustChangePassword = true');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
