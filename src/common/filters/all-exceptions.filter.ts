import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface ThanLoi {
  statusCode: number;
  message: string;
  /** Đường dẫn gây lỗi — để đối chiếu với log máy chủ khi người dùng báo lỗi. */
  path: string;
  timestamp: string;
  [khac: string]: unknown;
}

/**
 * Bắt MỌI exception lọt ra khỏi controller.
 *
 * HAI VIỆC NÓ LÀM, và một việc nó cố ý KHÔNG làm:
 *
 * 1. Dịch lỗi Prisma sang mã HTTP đúng. Trước đây `P2002` (trùng khoá duy
 *    nhất) rơi ra thành 500 kèm nguyên thông điệp của Prisma — lộ tên bảng,
 *    tên cột, và làm người dùng tưởng hệ thống hỏng trong khi họ chỉ nhập
 *    trùng mã nhân viên.
 *
 * 2. Chặn chi tiết nội bộ của lỗi 5xx. Stack trace ghi vào log máy chủ,
 *    người dùng chỉ nhận một câu chung. Hệ thống sắp mở qua tên miền ra
 *    ngoài internet, thông điệp lỗi là chỗ rò rỉ thông tin dễ nhất.
 *
 * 3. KHÔNG đổi hình dạng body của `HttpException` đã có. Giao diện đang đọc
 *    `message`, và màn chấm điểm còn đọc `itemIds` để chỉ ra tiêu chí nào
 *    thiếu điểm, `code` để phân biệt loại lỗi. Bọc lại theo khuôn mới là
 *    làm hỏng chúng ngay. Filter chỉ THÊM `path` và `timestamp`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Loi');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<{ status: (ma: number) => { json: (b: unknown) => void } }>();
    const req = ctx.getRequest<{ url?: string; method?: string }>();
    const duongDan = req.url ?? '';

    const { status, than } = this.phanTich(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Chỉ 5xx mới ghi stack. 4xx là chuyện bình thường của người dùng —
      // ghi hết thì log ngập và không còn ai đọc.
      this.logger.error(
        `${req.method ?? '?'} ${duongDan} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const traVe: ThanLoi = {
      ...than,
      // `than` luôn có `message`, nhưng kiểu của nó là Record nên TypeScript
      // không thấy được. Ghi lại tường minh để không bao giờ trả body thiếu
      // `message` — giao diện đọc đúng trường đó để hiện lỗi.
      message: typeof than.message === 'string' ? than.message : 'Đã xảy ra lỗi.',
      statusCode: status,
      path: duongDan,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(traVe);
  }

  private phanTich(exception: unknown): { status: number; than: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const goc = exception.getResponse();
      // Giữ NGUYÊN body cũ. Chuỗi trần thì bọc vào `message` cho đồng nhất.
      const than =
        typeof goc === 'string'
          ? { message: goc }
          : { ...(goc as Record<string, unknown>) };
      return { status: exception.getStatus(), than };
    }

    const prisma = this.dichLoiPrisma(exception);
    if (prisma) return prisma;

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      // KHÔNG kèm `exception.message`: đó là chỗ rò rỉ tên bảng, câu SQL,
      // đường dẫn file trên máy chủ.
      than: { message: 'Hệ thống gặp lỗi, vui lòng thử lại hoặc báo quản trị viên.' },
    };
  }

  /**
   * Ba mã lỗi Prisma hay gặp nhất. Mã khác vẫn rơi vào 500 — cố ý, vì mỗi
   * mã cần một câu tiếng Việt riêng mới có ích, đoán bừa còn tệ hơn.
   *
   * Thông điệp cố tình KHÔNG nhắc tên cột: `meta.target` là tên cột trong
   * database, người dùng không biết `employeeCode` là ô nào trên màn hình.
   */
  private dichLoiPrisma(
    exception: unknown,
  ): { status: number; than: Record<string, unknown> } | null {
    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) return null;

    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          than: {
            message: 'Dữ liệu đã tồn tại. Vui lòng kiểm tra lại các trường không được trùng.',
            code: exception.code,
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          than: { message: 'Không tìm thấy dữ liệu cần thao tác.', code: exception.code },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          than: {
            message:
              'Dữ liệu đang được nơi khác tham chiếu, hoặc trỏ tới bản ghi không tồn tại.',
            code: exception.code,
          },
        };
      default:
        return null;
    }
  }
}
