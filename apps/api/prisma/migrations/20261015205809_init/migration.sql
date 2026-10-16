-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BRANCH_MANAGER', 'OFFICE_EMPLOYEE', 'FIELD_EMPLOYEE', 'AUDITOR');

-- CreateEnum
CREATE TYPE "WorkLocationType" AS ENUM ('OFFICE_BOUND', 'FIELD_MOBILE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ON_TIME', 'LATE', 'ALPHA', 'ON_LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('IN_OFFICE', 'OUTSIDE_FIELD');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'PERMIT', 'MATERNITY');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KanbanStage" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LetterCategory" AS ENUM ('SK_DIR', 'ST', 'SP', 'MEMO', 'EXT');

-- CreateEnum
CREATE TYPE "ArchiveStatus" AS ENUM ('RESERVED_PENDING_SCAN', 'PENDING_VERIFICATION', 'ARCHIVED_VERIFIED', 'OVERDUE_SCAN');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('GOOD_ACTIVE', 'UNDER_REPAIR', 'DAMAGED_WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "VisitPurpose" AS ENUM ('SURVEY_AGUNAN', 'PROSPEK_FUNDING', 'PENAGIHAN', 'LAINNYA');

-- CreateEnum
CREATE TYPE "PingTrigger" AS ENUM ('ADMIN_ON_DEMAND', 'PERIODIC_SYNC');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL_HOLIDAY', 'JOINT_LEAVE');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "branchCode" VARCHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 75,
    "allowedPublicIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minTellerQuota" INTEGER NOT NULL DEFAULT 2,
    "minCsQuota" INTEGER NOT NULL DEFAULT 1,
    "workStartTime" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "workEndTime" VARCHAR(5) NOT NULL DEFAULT '17:00',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "nip" VARCHAR(24) NOT NULL,
    "fullName" VARCHAR(128) NOT NULL,
    "email" VARCHAR(128) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OFFICE_EMPLOYEE',
    "jobTitle" VARCHAR(64),
    "branchId" UUID NOT NULL,
    "workLocationType" "WorkLocationType" NOT NULL DEFAULT 'OFFICE_BOUND',
    "birthDate" DATE,
    "phone" VARCHAR(24),
    "ptkpStatus" VARCHAR(8) NOT NULL DEFAULT 'TK/0',
    "fcmToken" VARCHAR(255),
    "deviceIdBound" VARCHAR(128),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "clockInAt" TIMESTAMP(3),
    "clockInLat" DECIMAL(10,7),
    "clockInLon" DECIMAL(10,7),
    "clockInAccuracyM" DECIMAL(8,2),
    "distanceInM" DECIMAL(10,2),
    "clockInPhotoUrl" VARCHAR(512),
    "clockInHash" VARCHAR(16),
    "clockOutAt" TIMESTAMP(3),
    "clockOutLat" DECIMAL(10,7),
    "clockOutLon" DECIMAL(10,7),
    "clockOutPhotoUrl" VARCHAR(512),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "isMockDetected" BOOLEAN NOT NULL DEFAULT false,
    "locationStatus" "LocationStatus",
    "status" "AttendanceStatus" NOT NULL DEFAULT 'ON_TIME',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldCheckpoint" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attendanceId" UUID,
    "checkinAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracyM" DECIMAL(8,2),
    "reverseAddress" TEXT,
    "visitPurpose" "VisitPurpose" NOT NULL,
    "clientName" VARCHAR(128),
    "visitNotes" TEXT,
    "watermarkedPhotoUrl" VARCHAR(512),
    "photoHash" VARCHAR(16),

    CONSTRAINT "FieldCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveLocationPing" (
    "id" BIGSERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "triggerType" "PingTrigger" NOT NULL,
    "requestedBy" UUID,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracyM" DECIMAL(8,2),
    "batteryPct" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveLocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHoliday" (
    "id" UUID NOT NULL,
    "holidayDate" DATE NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "type" "HolidayType" NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "workingDaysCount" INTEGER NOT NULL,
    "reason" TEXT,
    "attachmentUrl" VARCHAR(512),
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "approverNotes" TEXT,
    "quotaWarning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "branchId" UUID,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "isManagement" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanProject" (
    "id" UUID NOT NULL,
    "branchId" UUID,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "ownerId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanTask" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "assigneeId" UUID,
    "reviewerId" UUID,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "stage" "KanbanStage" NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "h1Notified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" UUID,
    "revisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanComment" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterSequence" (
    "id" UUID NOT NULL,
    "entityCode" VARCHAR(16) NOT NULL,
    "categoryCode" VARCHAR(16) NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LetterSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialLetter" (
    "id" UUID NOT NULL,
    "letterNumber" VARCHAR(64) NOT NULL,
    "categoryCode" "LetterCategory" NOT NULL,
    "entityCode" VARCHAR(16) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "recipient" VARCHAR(255),
    "requestedBy" UUID NOT NULL,
    "releaseDate" DATE,
    "signedPdfUrl" VARCHAR(512),
    "pdfSha256" VARCHAR(64),
    "archiveStatus" "ArchiveStatus" NOT NULL DEFAULT 'RESERVED_PENDING_SCAN',
    "scanDueAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAsset" (
    "id" UUID NOT NULL,
    "assetCode" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "categoryCode" VARCHAR(16) NOT NULL,
    "branchId" UUID NOT NULL,
    "serialNumber" VARCHAR(64),
    "specifications" TEXT,
    "acquisitionDate" DATE,
    "acquisitionCost" DECIMAL(15,2),
    "usefulLifeMonths" INTEGER,
    "conditionStatus" "AssetCondition" NOT NULL DEFAULT 'GOOD_ACTIVE',
    "currentPicUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetHandover" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "fromUserId" UUID,
    "toUserId" UUID NOT NULL,
    "handoverDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bastPdfUrl" VARCHAR(512),
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "AssetHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" UUID NOT NULL,
    "periodMonth" CHAR(7) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "periodMonth" CHAR(7) NOT NULL,
    "earningsJson" JSONB NOT NULL,
    "deductionsJson" JSONB NOT NULL,
    "grossPay" DECIMAL(15,2) NOT NULL,
    "pph21Amount" DECIMAL(15,2) NOT NULL,
    "netTakeHomePay" DECIMAL(15,2) NOT NULL,
    "encryptedPdfUrl" VARCHAR(512),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" VARCHAR(64) NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditTrail" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityFraudLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" UUID,
    "incidentType" VARCHAR(64) NOT NULL,
    "details" JSONB,
    "ipAddress" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityFraudLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_branchCode_key" ON "Branch"("branchCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_nip_key" ON "User"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_branchId_role_idx" ON "User"("branchId", "role");

-- CreateIndex
CREATE INDEX "AttendanceLog_branchId_attendanceDate_idx" ON "AttendanceLog"("branchId", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceLog_userId_attendanceDate_key" ON "AttendanceLog"("userId", "attendanceDate");

-- CreateIndex
CREATE INDEX "FieldCheckpoint_userId_checkinAt_idx" ON "FieldCheckpoint"("userId", "checkinAt");

-- CreateIndex
CREATE INDEX "LiveLocationPing_userId_recordedAt_idx" ON "LiveLocationPing"("userId", "recordedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHoliday_holidayDate_key" ON "CompanyHoliday"("holidayDate");

-- CreateIndex
CREATE INDEX "CompanyHoliday_year_idx" ON "CompanyHoliday"("year");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startDate_idx" ON "LeaveRequest"("userId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_approvalStatus_idx" ON "LeaveRequest"("approvalStatus");

-- CreateIndex
CREATE INDEX "CalendarEvent_branchId_startAt_idx" ON "CalendarEvent"("branchId", "startAt");

-- CreateIndex
CREATE INDEX "KanbanTask_projectId_stage_idx" ON "KanbanTask"("projectId", "stage");

-- CreateIndex
CREATE INDEX "KanbanTask_assigneeId_stage_idx" ON "KanbanTask"("assigneeId", "stage");

-- CreateIndex
CREATE INDEX "KanbanComment_taskId_createdAt_idx" ON "KanbanComment"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LetterSequence_entityCode_categoryCode_year_key" ON "LetterSequence"("entityCode", "categoryCode", "year");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialLetter_letterNumber_key" ON "OfficialLetter"("letterNumber");

-- CreateIndex
CREATE INDEX "OfficialLetter_entityCode_archiveStatus_idx" ON "OfficialLetter"("entityCode", "archiveStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAsset_assetCode_key" ON "InventoryAsset"("assetCode");

-- CreateIndex
CREATE INDEX "InventoryAsset_branchId_conditionStatus_idx" ON "InventoryAsset"("branchId", "conditionStatus");

-- CreateIndex
CREATE INDEX "AssetHandover_assetId_handoverDate_idx" ON "AssetHandover"("assetId", "handoverDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_periodMonth_key" ON "PayrollPeriod"("periodMonth");

-- CreateIndex
CREATE INDEX "Payslip_periodMonth_isPublished_idx" ON "Payslip"("periodMonth", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_userId_periodMonth_key" ON "Payslip"("userId", "periodMonth");

-- CreateIndex
CREATE INDEX "AuditTrail_entityType_entityId_idx" ON "AuditTrail"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditTrail_actorId_createdAt_idx" ON "AuditTrail"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityFraudLog_incidentType_createdAt_idx" ON "SecurityFraudLog"("incidentType", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCheckpoint" ADD CONSTRAINT "FieldCheckpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCheckpoint" ADD CONSTRAINT "FieldCheckpoint_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "AttendanceLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveLocationPing" ADD CONSTRAINT "LiveLocationPing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveLocationPing" ADD CONSTRAINT "LiveLocationPing_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanProject" ADD CONSTRAINT "KanbanProject_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "KanbanProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanComment" ADD CONSTRAINT "KanbanComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KanbanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanComment" ADD CONSTRAINT "KanbanComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialLetter" ADD CONSTRAINT "OfficialLetter_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAsset" ADD CONSTRAINT "InventoryAsset_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAsset" ADD CONSTRAINT "InventoryAsset_currentPicUserId_fkey" FOREIGN KEY ("currentPicUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHandover" ADD CONSTRAINT "AssetHandover_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "InventoryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHandover" ADD CONSTRAINT "AssetHandover_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHandover" ADD CONSTRAINT "AssetHandover_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_periodMonth_fkey" FOREIGN KEY ("periodMonth") REFERENCES "PayrollPeriod"("periodMonth") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTrail" ADD CONSTRAINT "AuditTrail_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityFraudLog" ADD CONSTRAINT "SecurityFraudLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
