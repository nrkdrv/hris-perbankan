/** Seed awal: cabang, 8 pengguna (5 peran), hari libur 2026, 1 proyek Kanban contoh. */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'password123';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const pst = await prisma.branch.upsert({
    where: { branchCode: 'KTR-PST' },
    update: {},
    create: {
      branchCode: 'KTR-PST',
      name: 'Kantor Pusat Jakarta',
      address: 'Jl. Jend. Sudirman Kav. 1, Jakarta',
      latitude: -6.2088,
      longitude: 106.8456,
      geofenceRadiusM: 100,
      minTellerQuota: 2,
      minCsQuota: 1,
    },
  });

  const sby = await prisma.branch.upsert({
    where: { branchCode: 'KTR-SBY' },
    update: {},
    create: {
      branchCode: 'KTR-SBY',
      name: 'Kantor Cabang Surabaya',
      address: 'Jl. Tunjungan No. 1, Surabaya',
      latitude: -7.2575,
      longitude: 112.7521,
      geofenceRadiusM: 75,
      minTellerQuota: 2,
      minCsQuota: 1,
    },
  });

  const users = [
    { nip: 'SA-001', fullName: 'Administrator', email: 'admin@bank.local', role: 'SUPER_ADMIN', jobTitle: 'Super Admin', branchId: pst.id, workLocationType: 'OFFICE_BOUND', ptkpStatus: 'K/1' },
    { nip: 'MGR-001', fullName: 'Budi Santoso', email: 'budi.santoso@bank.local', role: 'BRANCH_MANAGER', jobTitle: 'Pimpinan Cabang', branchId: sby.id, workLocationType: 'OFFICE_BOUND', ptkpStatus: 'K/1', birthDate: new Date('1985-06-12') },
    { nip: 'TLL-001', fullName: 'Siti Rahma', email: 'siti.rahma@bank.local', role: 'OFFICE_EMPLOYEE', jobTitle: 'Teller', branchId: sby.id, workLocationType: 'OFFICE_BOUND', ptkpStatus: 'TK/0', birthDate: new Date('1995-03-08') },
    { nip: 'TLL-002', fullName: 'Dedi Kurniawan', email: 'dedi.k@bank.local', role: 'OFFICE_EMPLOYEE', jobTitle: 'Teller', branchId: sby.id, workLocationType: 'OFFICE_BOUND', ptkpStatus: 'TK/0' },
    { nip: 'CS-001', fullName: 'Andi Pratama', email: 'andi.pratama@bank.local', role: 'OFFICE_EMPLOYEE', jobTitle: 'Customer Service', branchId: sby.id, workLocationType: 'OFFICE_BOUND', ptkpStatus: 'TK/0', birthDate: new Date('1993-11-20') },
    { nip: 'BO-001', fullName: 'Dewi Lestari', email: 'dewi.lestari@bank.local', role: 'OFFICE_EMPLOYEE', jobTitle: 'Back Office', branchId: sby.id, workLocationType: 'OFFICE_BOUND', ptkpStatus: 'TK/1' },
    { nip: 'AO-001', fullName: 'Agus Wijaya', email: 'agus.wijaya@bank.local', role: 'FIELD_EMPLOYEE', jobTitle: 'AO Kredit', branchId: sby.id, workLocationType: 'FIELD_MOBILE', ptkpStatus: 'K/0', birthDate: new Date('1990-01-25') },
    { nip: 'AO-002', fullName: 'Rina Marlina', email: 'rina.marlina@bank.local', role: 'FIELD_EMPLOYEE', jobTitle: 'Marketing Funding', branchId: sby.id, workLocationType: 'FIELD_MOBILE', ptkpStatus: 'TK/0' },
    { nip: 'AUD-001', fullName: 'Hendra Gunawan', email: 'hendra.g@bank.local', role: 'AUDITOR', jobTitle: 'Internal Auditor', branchId: pst.id, workLocationType: 'OFFICE_BOUND', ptkpStatus: 'K/2' },
  ] as const;

  for (const u of users) {
    await prisma.user.upsert({
      where: { nip: u.nip },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  const holidays = [
    ['2026-01-01', 'Tahun Baru Masehi', 'NATIONAL_HOLIDAY'],
    ['2026-05-01', 'Hari Buruh', 'NATIONAL_HOLIDAY'],
    ['2026-05-14', 'Kenaikan Isa Almasih', 'NATIONAL_HOLIDAY'],
    ['2026-08-17', 'Hari Kemerdekaan RI', 'NATIONAL_HOLIDAY'],
    ['2026-12-24', 'Cuti Bersama Natal', 'JOINT_LEAVE'],
    ['2026-12-25', 'Hari Raya Natal', 'NATIONAL_HOLIDAY'],
  ] as const;
  for (const [d, name, type] of holidays) {
    await prisma.companyHoliday.upsert({
      where: { holidayDate: new Date(d) },
      update: {},
      create: { holidayDate: new Date(d), name, type: type as 'NATIONAL_HOLIDAY', year: 2026 },
    });
  }

  await prisma.kanbanProject.upsert({
    where: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
    update: {},
    create: {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      branchId: sby.id,
      name: 'Persiapan Audit Cabang Q4',
      description: 'Checklist dokumen & rekonsiliasi menjelang audit internal.',
    },
  });

  console.log('Seed OK. Login: admin@bank.local / password123 (dan 8 akun lain, password sama).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
