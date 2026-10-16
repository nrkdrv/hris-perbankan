import { Role } from '@hris/shared';

/**
 * Bentuk pengguna terautentikasi yang dipakai modul-modul ini.
 *
 * Dinormalisasi lewat requestUser() agar tahan terhadap dua konvensi umum
 * implementasi @CurrentUser() oleh agen auth:
 *  - objek user penuh: { id, role, branchId, nip, fullName, ... }
 *  - JwtPayload:       { sub, nip, role, branchId }
 */
export interface RequestUser {
  id: string;
  role: Role;
  branchId?: string;
  nip?: string;
  fullName?: string;
}

export function requestUser(raw: unknown): RequestUser {
  const r = raw as Record<string, unknown> | null | undefined;
  const id = r?.['id'] ?? r?.['sub'] ?? r?.['userId'];
  if (!r || id == null || String(id).trim() === '') {
    throw new Error(
      'RequestUser kosong: decorator @CurrentUser() tidak mengembalikan user terautentikasi',
    );
  }
  return {
    id: String(id),
    role: r['role'] as Role,
    branchId: r['branchId'] != null ? String(r['branchId']) : undefined,
    nip: r['nip'] != null ? String(r['nip']) : undefined,
    fullName: r['fullName'] != null ? String(r['fullName']) : undefined,
  };
}

/** SUPER_ADMIN & BRANCH_MANAGER — peran manajerial untuk gate maker-checker. */
export function isPrivileged(role: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.BRANCH_MANAGER;
}
