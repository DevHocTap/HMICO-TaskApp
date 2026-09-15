import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OrgModule } from './modules/org/org.module.js';
import { KpiTemplateModule } from './modules/kpi-template/kpi-template.module.js';
import { PeriodModule } from './modules/period/period.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { BackupModule } from './modules/backup/backup.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ScorecardModule } from './modules/scorecard/scorecard.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    SettingsModule,
    BackupModule,
    AuthModule,
    OrgModule,
    KpiTemplateModule,
    PeriodModule,
    ScorecardModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
