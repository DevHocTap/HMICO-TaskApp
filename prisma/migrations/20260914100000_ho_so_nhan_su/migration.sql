-- Hồ sơ nhân sự (14/09/2026): tách khỏi User, chuẩn bị cho chấm công giai đoạn 2.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

CREATE TABLE "EmployeeProfile" (
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "personalEmail" TEXT,
    "address" TEXT,
    "dateOfBirth" DATE,
    "gender" "Gender",
    "emergencyContact" TEXT,
    "hireDate" DATE,
    "terminationDate" DATE,
    "nationalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lịch sử phòng ban / chức danh, ghi tự động khi HR đổi.
CREATE TABLE "EmployeeAssignmentHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT,
    "jobTitleId" TEXT,
    "level" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAssignmentHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeAssignmentHistory_userId_validFrom_idx"
  ON "EmployeeAssignmentHistory"("userId", "validFrom");

ALTER TABLE "EmployeeAssignmentHistory" ADD CONSTRAINT "EmployeeAssignmentHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dòng hiệu lực ban đầu cho người đang có: phòng/chức danh hiện tại, từ ngày tạo tài khoản.
INSERT INTO "EmployeeAssignmentHistory" ("id", "userId", "departmentId", "jobTitleId", "level", "validFrom")
SELECT gen_random_uuid()::text, id, "departmentId", "jobTitleId", level, "createdAt"::date
FROM "User";
