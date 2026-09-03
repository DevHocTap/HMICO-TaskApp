import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  /**
   * Bật `PRISMA_LOG_QUERY=1` để in mọi câu SQL ra log.
   *
   * Dùng khi cần ĐẾM số truy vấn của một endpoint — cách duy nhất phát hiện
   * N+1 trước khi nó gặp 200 nhân sự thật. Mặc định tắt.
   */
  constructor() {
    super(process.env.PRISMA_LOG_QUERY ? { log: ['query'] } : {});
  }

  async onModuleInit() {
    await this.$connect();
  }
}