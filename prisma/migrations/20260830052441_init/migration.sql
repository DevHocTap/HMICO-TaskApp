-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EXECUTIVE', 'HR', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "KpiSection" AS ENUM ('BSC_WORK', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- CreateEnum
CREATE TYPE "ScoringMode" AS ENUM ('MANUAL', 'CALCULATED');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('COMPANY', 'DEPARTMENT', 'USER');

-- CreateEnum
CREATE TYPE "AssignStatus" AS ENUM ('DRAFT', 'PROPOSED', 'ACCEPTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PENDING', 'SELF_SCORED', 'MANAGER_SCORED', 'REJECTED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('NOT_MET', 'NEEDS_IMPROVEMENT', 'COMPLETED', 'EXCEEDED');

-- CreateEnum
CREATE TYPE "ScorecardAction" AS ENUM ('PROPOSE', 'ACCEPT', 'DISPUTE', 'SELF_SCORE', 'MANAGER_SCORE', 'REJECT', 'RECEIVE', 'REOPEN');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "departmentId" TEXT,
    "jobTitleId" TEXT,
    "level" TEXT,
    "managerId" TEXT,
    "azureAdObjectId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "passwordChangedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PeriodType" NOT NULL,
    "parentId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dueDate" DATE,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitleId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "parentId" TEXT,
    "section" "KpiSection" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "measurementUnit" TEXT,
    "targetValue" DECIMAL(18,4),
    "minValue" DECIMAL(18,4),
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_BETTER',
    "scoringMode" "ScoringMode" NOT NULL DEFAULT 'MANUAL',
    "weight" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL,
    "ownerType" "OwnerType" NOT NULL DEFAULT 'USER',
    "userId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "jobTitleName" TEXT NOT NULL,
    "level" TEXT,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "evaluatorId" TEXT,
    "assignStatus" "AssignStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "resultStatus" "ResultStatus" NOT NULL DEFAULT 'PENDING',
    "selfScoredAt" TIMESTAMP(3),
    "managerScoredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "noSelfScoreReason" TEXT,
    "totalSelfScore" DECIMAL(6,2),
    "totalManagerScore" DECIMAL(6,2),
    "grade" "Grade",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardItem" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "parentId" TEXT,
    "sourceTemplateItemId" TEXT,
    "section" "KpiSection" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "measurementUnit" TEXT,
    "targetValue" DECIMAL(18,4),
    "minValue" DECIMAL(18,4),
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_BETTER',
    "scoringMode" "ScoringMode" NOT NULL DEFAULT 'MANUAL',
    "maxScale" INTEGER NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "selfScore" DECIMAL(6,2),
    "selfComment" TEXT,
    "managerScore" DECIMAL(6,2),
    "managerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorecardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardEvent" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "action" "ScorecardAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScorecardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "JobTitle_code_key" ON "JobTitle"("code");

-- CreateIndex
CREATE INDEX "JobTitle_departmentId_idx" ON "JobTitle"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_azureAdObjectId_key" ON "User"("azureAdObjectId");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_jobTitleId_idx" ON "User"("jobTitleId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Period_name_key" ON "Period"("name");

-- CreateIndex
CREATE INDEX "Period_startDate_endDate_idx" ON "Period"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Period_parentId_idx" ON "Period"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTemplate_code_key" ON "KpiTemplate"("code");

-- CreateIndex
CREATE INDEX "KpiTemplate_jobTitleId_idx" ON "KpiTemplate"("jobTitleId");

-- CreateIndex
CREATE INDEX "KpiTemplateItem_templateId_section_orderIndex_idx" ON "KpiTemplateItem"("templateId", "section", "orderIndex");

-- CreateIndex
CREATE INDEX "KpiTemplateItem_parentId_idx" ON "KpiTemplateItem"("parentId");

-- CreateIndex
CREATE INDEX "Scorecard_departmentId_periodId_idx" ON "Scorecard"("departmentId", "periodId");

-- CreateIndex
CREATE INDEX "Scorecard_periodId_resultStatus_idx" ON "Scorecard"("periodId", "resultStatus");

-- CreateIndex
CREATE INDEX "Scorecard_evaluatorId_resultStatus_idx" ON "Scorecard"("evaluatorId", "resultStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_userId_periodId_key" ON "Scorecard"("userId", "periodId");

-- CreateIndex
CREATE INDEX "ScorecardItem_scorecardId_section_orderIndex_idx" ON "ScorecardItem"("scorecardId", "section", "orderIndex");

-- CreateIndex
CREATE INDEX "ScorecardItem_parentId_idx" ON "ScorecardItem"("parentId");

-- CreateIndex
CREATE INDEX "ScorecardEvent_scorecardId_createdAt_idx" ON "ScorecardEvent"("scorecardId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTitle" ADD CONSTRAINT "JobTitle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTemplate" ADD CONSTRAINT "KpiTemplate_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTemplateItem" ADD CONSTRAINT "KpiTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTemplateItem" ADD CONSTRAINT "KpiTemplateItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KpiTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardItem" ADD CONSTRAINT "ScorecardItem_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardItem" ADD CONSTRAINT "ScorecardItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ScorecardItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardEvent" ADD CONSTRAINT "ScorecardEvent_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardEvent" ADD CONSTRAINT "ScorecardEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
