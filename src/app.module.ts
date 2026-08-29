import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { OrgModule } from './modules/org/org.module';

@Module({
  imports: [PrismaModule, OrgModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}