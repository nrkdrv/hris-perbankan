import { describe, expect, it } from 'vitest';
import { countWorkingDays } from '@hris/shared';
import {
  buildQuotaWarnings,
  formatQuotaWarning,
  isCs,
  isTeller,
} from './utils/quota.util';

describe('countWorkingDays (shared)', () => {
  it('Senin-Jumat penuh = 5 hari kerja', () => {
    // 2026-10-19 adalah Senin, 2026-10-23 Jumat
    expect(
      countWorkingDays(
        new Date('2026-10-19T00:00:00Z'),
        new Date('2026-10-23T00:00:00Z'),
        new Set(),
      ),
    ).toBe(5);
  });

  it('melewati weekend: Jumat-Senin = 2 hari kerja', () => {
    expect(
      countWorkingDays(
        new Date('2026-10-23T00:00:00Z'),
        new Date('2026-10-26T00:00:00Z'),
        new Set(),
      ),
    ).toBe(2);
  });

  it('mengurangi tanggal libur perusahaan', () => {
    expect(
      countWorkingDays(
        new Date('2026-10-19T00:00:00Z'),
        new Date('2026-10-23T00:00:00Z'),
        new Set(['2026-10-20']),
      ),
    ).toBe(4);
  });

  it('rentang hanya weekend = 0', () => {
    expect(
      countWorkingDays(
        new Date('2026-10-24T00:00:00Z'),
        new Date('2026-10-25T00:00:00Z'),
        new Set(),
      ),
    ).toBe(0);
  });
});

describe('job title matcher', () => {
  it('mengenali Teller & CS', () => {
    expect(isTeller('Teller')).toBe(true);
    expect(isTeller('Senior Teller')).toBe(true);
    expect(isTeller('Back Office')).toBe(false);
    expect(isCs('Customer Service')).toBe(true);
    expect(isCs('CS Senior')).toBe(true);
    expect(isCs('Back Office')).toBe(false);
  });
});

const STAFF = [
  { id: 't1', jobTitle: 'Teller' },
  { id: 't2', jobTitle: 'Teller' },
  { id: 't3', jobTitle: 'Teller' },
  { id: 'c1', jobTitle: 'Customer Service' },
  { id: 'b1', jobTitle: 'Back Office' },
];

function quotaBase(overrides: Record<string, unknown> = {}) {
  return {
    requesterId: 't1',
    requesterJobTitle: 'Teller',
    branch: { minTellerQuota: 2, minCsQuota: 1 },
    startDate: '2026-10-19', // Senin
    endDate: '2026-10-19',
    holidays: new Set<string>(),
    staff: STAFF,
    approvedLeaves: [],
    ...overrides,
  } as Parameters<typeof buildQuotaWarnings>[0];
}

describe('buildQuotaWarnings', () => {
  it('peringatan bila sisa Teller jatuh di bawah minimum', () => {
    // 3 teller, 1 sudah cuti approved + requester ikut cuti -> sisa 1 < min 2
    const warnings = buildQuotaWarnings(
      quotaBase({
        approvedLeaves: [
          { userId: 't2', startDate: '2026-10-19', endDate: '2026-10-19' },
        ],
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      date: '2026-10-19',
      role: 'TELLER',
      remaining: 1,
      minimum: 2,
    });
    const text = formatQuotaWarning(warnings);
    expect(text).toContain('2026-10-19');
    expect(text).toContain('Teller');
    expect(text).toContain('tersisa 1 dari minimum 2');
  });

  it('tanpa peringatan bila kuota masih aman', () => {
    const warnings = buildQuotaWarnings(quotaBase());
    expect(warnings).toHaveLength(0);
    expect(formatQuotaWarning(warnings)).toBeNull();
  });

  it('melewati weekend & hari libur', () => {
    const warnings = buildQuotaWarnings(
      quotaBase({
        startDate: '2026-10-24', // Sabtu
        endDate: '2026-10-25', // Minggu
        approvedLeaves: [
          { userId: 't2', startDate: '2026-10-24', endDate: '2026-10-25' },
          { userId: 't3', startDate: '2026-10-24', endDate: '2026-10-25' },
        ],
      }),
    );
    expect(warnings).toHaveLength(0);
  });

  it('peringatan CS bila satu-satunya CS cuti', () => {
    const warnings = buildQuotaWarnings(
      quotaBase({
        requesterId: 'c1',
        requesterJobTitle: 'Customer Service',
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ role: 'CS', remaining: 0, minimum: 1 });
  });

  it('cuti requester di luar rentang approved lain tetap dihitung', () => {
    // 2 teller saja, requester cuti -> sisa 1 < min 2
    const warnings = buildQuotaWarnings(
      quotaBase({
        staff: STAFF.filter((s) => s.id !== 't3'),
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].remaining).toBe(1);
  });
});
