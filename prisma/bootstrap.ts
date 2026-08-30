/**
 * Khởi tạo hệ thống THẬT.
 *
 * Chỉ tạo đúng MỘT tài khoản quản trị để đăng nhập lần đầu. Phòng ban,
 * chức danh và nhân viên do chính quản trị viên tạo qua giao diện — dữ
 * liệu thật không được sinh ra từ mã nguồn.
 *
 * Khác hoàn toàn với `prisma/seed.ts` (chỉ dùng cho máy dev, tạo sẵn 16
 * phòng ban và 14 người dùng giả). Xem docs/kien-truc.md.
 *
 * Chạy:
 *   BOOTSTRAP_ADMIN_EMAIL=admin@hmico.vn \
 *   BOOTSTRAP_ADMIN_PASSWORD='...' \
 *   npm run bootstrap
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Dài hơn mức tối thiểu 8 ký tự của người dùng thường: đây là tài khoản
 * duy nhất có toàn quyền, và nó tồn tại trước khi có bất kỳ lớp bảo vệ nào
 * khác.
 */
const MIN_PASSWORD_LENGTH = 12;

function docCauHinh() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const employeeCode = (process.env.BOOTSTRAP_ADMIN_EMPLOYEE_CODE ?? 'ADMIN').trim();
  const fullName = (process.env.BOOTSTRAP_ADMIN_NAME ?? 'Quản trị hệ thống').trim();

  const loi: string[] = [];
  if (!email) {
    loi.push('BOOTSTRAP_ADMIN_EMAIL chưa được đặt');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    loi.push('BOOTSTRAP_ADMIN_EMAIL không đúng định dạng email');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    loi.push(
      `BOOTSTRAP_ADMIN_PASSWORD phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự ` +
        `(hiện có ${password.length})`,
    );
  }

  if (loi.length > 0) {
    throw new Error(
      'Thiếu hoặc sai cấu hình:\n' +
        loi.map((m) => `  - ${m}`).join('\n') +
        '\n\nVí dụ:\n' +
        "  BOOTSTRAP_ADMIN_EMAIL=admin@hmico.vn \\\n" +
        "  BOOTSTRAP_ADMIN_PASSWORD='chuoi-that-dai-va-ngau-nhien' \\\n" +
        '  npm run bootstrap',
    );
  }

  return { email, password, employeeCode, fullName };
}

async function main() {
  const { email, password, employeeCode, fullName } = docCauHinh();

  // Chặn chạy lần hai: nếu đã có quản trị viên thì hệ thống đã được khởi
  // tạo, chạy tiếp chỉ tạo ra tài khoản toàn quyền thứ hai ngoài ý muốn.
  const daCoAdmin = await prisma.user.count({ where: { role: Role.ADMIN } });
  if (daCoAdmin > 0) {
    throw new Error(
      `Database đã có ${daCoAdmin} tài khoản quản trị. Script này chỉ dùng để\n` +
        'khởi tạo hệ thống lần đầu.\n\n' +
        'Muốn thêm quản trị viên thì tạo qua giao diện quản trị.\n' +
        'Muốn đặt lại mật khẩu quản trị viên đã mất thì đổi trực tiếp trong\n' +
        'database, đừng chạy script này.',
    );
  }

  const trungEmail = await prisma.user.findUnique({ where: { email } });
  if (trungEmail) {
    throw new Error(`Email "${email}" đã được dùng cho một tài khoản khác.`);
  }
  const trungMa = await prisma.user.findUnique({ where: { employeeCode } });
  if (trungMa) {
    throw new Error(`Mã nhân viên "${employeeCode}" đã được dùng.`);
  }

  const created = await prisma.user.create({
    data: {
      employeeCode,
      email,
      fullName,
      passwordHash: await argon2.hash(password),
      role: Role.ADMIN,
      // Không gán phòng ban: cơ cấu tổ chức chưa tồn tại, và quản trị viên
      // có phạm vi toàn công ty nên không cần thuộc phòng nào.
      departmentId: null,
      mustChangePassword: true,
    },
  });

  console.log('Khởi tạo xong.');
  console.log(`  Tài khoản quản trị: ${created.email}`);
  console.log(`  Mã nhân viên:       ${created.employeeCode}`);
  console.log('  Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.');
  console.log('\nBước tiếp theo: đăng nhập rồi tạo cây phòng ban, chức danh,');
  console.log('và nhân viên qua giao diện quản trị.');
}

main()
  .catch((e: unknown) => {
    console.error('\n' + (e instanceof Error ? e.message : String(e)) + '\n');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
