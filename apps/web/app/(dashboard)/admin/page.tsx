'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { Badge, Button, Card, Empty, PageHeader, formatDate } from '@/components/ui';

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100';

interface UserItem {
  id: string;
  nip: string;
  fullName: string;
  email: string;
  role: string;
  jobTitle?: string | null;
  branchId: string;
  branch?: { name: string } | null;
  workLocationType: string;
  isActive: boolean;
}

interface Branch {
  id: string;
  branchCode: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusM?: number | null;
  minTellerQuota?: number | null;
  minCsQuota?: number | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
}

interface HolidayItem {
  id: string;
  holidayDate: string;
  name: string;
  type: 'NATIONAL_HOLIDAY' | 'JOINT_LEAVE';
}

type Tab = 'pengguna' | 'cabang' | 'libur';

const ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'OFFICE_EMPLOYEE', 'FIELD_EMPLOYEE', 'AUDITOR'];
const WORK_LOCATION_TYPES = [
  { value: 'OFFICE_BOUND', label: 'Kantor' },
  { value: 'FIELD_MOBILE', label: 'Lapangan' },
];
const HOLIDAY_TYPES = [
  { value: 'NATIONAL_HOLIDAY', label: 'Libur Nasional' },
  { value: 'JOINT_LEAVE', label: 'Cuti Bersama' },
];

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function roleTone(role: string): 'slate' | 'green' | 'red' | 'amber' | 'blue' {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'red';
    case 'BRANCH_MANAGER':
      return 'blue';
    case 'AUDITOR':
      return 'amber';
    default:
      return 'slate';
  }
}

const emptyUserForm = {
  nip: '',
  fullName: '',
  email: '',
  password: '',
  role: 'OFFICE_EMPLOYEE',
  jobTitle: '',
  branchId: '',
  workLocationType: 'OFFICE_BOUND',
  birthDate: '',
  phone: '',
  ptkpStatus: '',
};

const emptyBranchForm = {
  branchCode: '',
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  geofenceRadiusM: '',
  minTellerQuota: '',
  minCsQuota: '',
  workStartTime: '',
  workEndTime: '',
};

const numOrUndefined = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
const strOrUndefined = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());

export default function AdminPage() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [tab, setTab] = useState<Tab>('pengguna');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [userForm, setUserForm] = useState({ ...emptyUserForm });

  const [showBranchForm, setShowBranchForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ ...emptyBranchForm });

  const [holidayForm, setHolidayForm] = useState({ holidayDate: todayLocal(), name: '', type: 'NATIONAL_HOLIDAY' });

  const clearMsg = () => {
    setError(null);
    setSuccess(null);
  };

  const loadBranches = useCallback(async () => {
    setLoadingBranches(true);
    try {
      const data = await api<Branch[]>('/branches');
      setBranches(Array.isArray(data) ? data : []);
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await api<UserItem[]>('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setUsers([]);
      setError(e instanceof ApiError ? e.message : 'Gagal memuat pengguna.');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadHolidays = useCallback(async (y: number) => {
    setLoadingHolidays(true);
    try {
      const data = await api<HolidayItem[]>(`/calendar/holidays?year=${y}`);
      setHolidays(Array.isArray(data) ? data : []);
    } catch (e) {
      setHolidays([]);
      setError(e instanceof ApiError ? e.message : 'Gagal memuat hari libur.');
    } finally {
      setLoadingHolidays(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadBranches();
      loadUsers();
    }
  }, [isAdmin, loadBranches, loadUsers]);

  useEffect(() => {
    if (isAdmin) loadHolidays(year);
  }, [isAdmin, year, loadHolidays]);

  // ---------------- Pengguna ----------------

  const openAddUser = () => {
    clearMsg();
    setEditingUser(null);
    setUserForm({ ...emptyUserForm });
    setShowUserForm(true);
  };

  const openEditUser = (u: UserItem) => {
    clearMsg();
    setEditingUser(u);
    setUserForm({
      nip: u.nip ?? '',
      fullName: u.fullName ?? '',
      email: u.email ?? '',
      password: '',
      role: u.role ?? 'OFFICE_EMPLOYEE',
      jobTitle: u.jobTitle ?? '',
      branchId: u.branchId ?? '',
      workLocationType: u.workLocationType ?? 'OFFICE_BOUND',
      birthDate: '',
      phone: '',
      ptkpStatus: '',
    });
    setShowUserForm(true);
  };

  const submitUser = async () => {
    clearMsg();
    if (!userForm.nip.trim() || !userForm.fullName.trim() || !userForm.email.trim()) {
      setError('NIP, nama lengkap, dan email wajib diisi.');
      return;
    }
    if (!editingUser && !userForm.password) {
      setError('Password wajib diisi untuk pengguna baru.');
      return;
    }
    try {
      if (editingUser) {
        // PATCH: kirim hanya field terisi; password hanya jika diisi.
        const payload: Record<string, unknown> = {
          nip: userForm.nip.trim(),
          fullName: userForm.fullName.trim(),
          email: userForm.email.trim(),
          role: userForm.role,
          branchId: userForm.branchId,
          workLocationType: userForm.workLocationType,
        };
        const jobTitle = strOrUndefined(userForm.jobTitle);
        if (jobTitle !== undefined) payload.jobTitle = jobTitle;
        const birthDate = strOrUndefined(userForm.birthDate);
        if (birthDate !== undefined) payload.birthDate = birthDate;
        const phone = strOrUndefined(userForm.phone);
        if (phone !== undefined) payload.phone = phone;
        const ptkpStatus = strOrUndefined(userForm.ptkpStatus);
        if (ptkpStatus !== undefined) payload.ptkpStatus = ptkpStatus;
        if (userForm.password) payload.password = userForm.password;
        await api(`/users/${editingUser.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setSuccess('Pengguna berhasil diperbarui.');
      } else {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            nip: userForm.nip.trim(),
            fullName: userForm.fullName.trim(),
            email: userForm.email.trim(),
            password: userForm.password,
            role: userForm.role,
            jobTitle: strOrUndefined(userForm.jobTitle),
            branchId: userForm.branchId,
            workLocationType: userForm.workLocationType,
            birthDate: strOrUndefined(userForm.birthDate),
            phone: strOrUndefined(userForm.phone),
            ptkpStatus: strOrUndefined(userForm.ptkpStatus),
          }),
        });
        setSuccess('Pengguna berhasil ditambahkan.');
      }
      setShowUserForm(false);
      loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan pengguna.');
    }
  };

  const toggleActive = async (u: UserItem) => {
    clearMsg();
    const action = u.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`${u.isActive ? 'Nonaktifkan' : 'Aktifkan'} pengguna ${u.fullName}?`)) return;
    try {
      await api(`/users/${u.id}/${action}`, { method: 'POST' });
      setSuccess(`Pengguna ${u.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`);
      loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengubah status pengguna.');
    }
  };

  // ---------------- Cabang ----------------

  const openAddBranch = () => {
    clearMsg();
    setEditingBranch(null);
    setBranchForm({ ...emptyBranchForm });
    setShowBranchForm(true);
  };

  const openEditBranch = (b: Branch) => {
    clearMsg();
    setEditingBranch(b);
    setBranchForm({
      branchCode: b.branchCode ?? '',
      name: b.name ?? '',
      address: b.address ?? '',
      latitude: String(b.latitude ?? ''),
      longitude: String(b.longitude ?? ''),
      geofenceRadiusM: b.geofenceRadiusM != null ? String(b.geofenceRadiusM) : '',
      minTellerQuota: b.minTellerQuota != null ? String(b.minTellerQuota) : '',
      minCsQuota: b.minCsQuota != null ? String(b.minCsQuota) : '',
      workStartTime: b.workStartTime ?? '',
      workEndTime: b.workEndTime ?? '',
    });
    setShowBranchForm(true);
  };

  const submitBranch = async () => {
    clearMsg();
    if (!branchForm.branchCode.trim() || !branchForm.name.trim()) {
      setError('Kode cabang dan nama cabang wajib diisi.');
      return;
    }
    const payload: Record<string, unknown> = {
      branchCode: branchForm.branchCode.trim(),
      name: branchForm.name.trim(),
    };
    const address = strOrUndefined(branchForm.address);
    if (address !== undefined) payload.address = address;
    const lat = numOrUndefined(branchForm.latitude);
    if (lat !== undefined) payload.latitude = lat;
    const lng = numOrUndefined(branchForm.longitude);
    if (lng !== undefined) payload.longitude = lng;
    const radius = numOrUndefined(branchForm.geofenceRadiusM);
    if (radius !== undefined) payload.geofenceRadiusM = radius;
    const teller = numOrUndefined(branchForm.minTellerQuota);
    if (teller !== undefined) payload.minTellerQuota = teller;
    const cs = numOrUndefined(branchForm.minCsQuota);
    if (cs !== undefined) payload.minCsQuota = cs;
    const start = strOrUndefined(branchForm.workStartTime);
    if (start !== undefined) payload.workStartTime = start;
    const end = strOrUndefined(branchForm.workEndTime);
    if (end !== undefined) payload.workEndTime = end;

    try {
      if (editingBranch) {
        await api(`/branches/${editingBranch.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setSuccess('Cabang berhasil diperbarui.');
      } else {
        await api('/branches', { method: 'POST', body: JSON.stringify(payload) });
        setSuccess('Cabang berhasil ditambahkan.');
      }
      setShowBranchForm(false);
      loadBranches();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan cabang.');
    }
  };

  // ---------------- Hari libur ----------------

  const submitHoliday = async () => {
    clearMsg();
    if (!holidayForm.holidayDate || !holidayForm.name.trim()) {
      setError('Tanggal dan nama hari libur wajib diisi.');
      return;
    }
    try {
      await api('/calendar/holidays', {
        method: 'POST',
        body: JSON.stringify({
          holidayDate: holidayForm.holidayDate,
          name: holidayForm.name.trim(),
          type: holidayForm.type,
        }),
      });
      setSuccess('Hari libur berhasil ditambahkan.');
      setHolidayForm({ holidayDate: todayLocal(), name: '', type: 'NATIONAL_HOLIDAY' });
      loadHolidays(year);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menambah hari libur.');
    }
  };

  const deleteHoliday = async (h: HolidayItem) => {
    clearMsg();
    if (!window.confirm(`Hapus hari libur "${h.name}" (${formatDate(h.holidayDate)})?`)) return;
    try {
      await api(`/calendar/holidays/${h.id}`, { method: 'DELETE' });
      setSuccess('Hari libur berhasil dihapus.');
      loadHolidays(year);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus hari libur.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Admin" subtitle="Pengaturan master sistem." />
        <Card>
          <Empty text="Halaman ini khusus Super Admin." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Admin" subtitle="Kelola pengguna, cabang, dan kalender hari libur." />

      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant={tab === 'pengguna' ? 'primary' : 'secondary'} onClick={() => { clearMsg(); setTab('pengguna'); }}>
          Pengguna
        </Button>
        <Button variant={tab === 'cabang' ? 'primary' : 'secondary'} onClick={() => { clearMsg(); setTab('cabang'); }}>
          Cabang
        </Button>
        <Button variant={tab === 'libur' ? 'primary' : 'secondary'} onClick={() => { clearMsg(); setTab('libur'); }}>
          Hari Libur
        </Button>
      </div>

      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      {tab === 'pengguna' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <Button onClick={openAddUser}>+ Tambah Pengguna</Button>
          </div>

          {showUserForm && (
            <Card>
              <h2 className="mb-4 text-base font-bold">{editingUser ? 'Edit Pengguna' : 'Tambah Pengguna'}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">NIP</label>
                  <input className={INPUT_CLS} value={userForm.nip} onChange={(e) => setUserForm({ ...userForm, nip: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nama Lengkap</label>
                  <input className={INPUT_CLS} value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input type="email" className={INPUT_CLS} value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Password {editingUser ? '(kosongkan = tidak diubah)' : ''}
                  </label>
                  <input
                    type="password"
                    className={INPUT_CLS}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder={editingUser ? 'Kosongkan jika tidak diubah' : ''}
                  />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
                  <select className={INPUT_CLS} value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r] ?? r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Jabatan</label>
                  <input className={INPUT_CLS} value={userForm.jobTitle} onChange={(e) => setUserForm({ ...userForm, jobTitle: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Cabang</label>
                  <select className={INPUT_CLS} value={userForm.branchId} onChange={(e) => setUserForm({ ...userForm, branchId: e.target.value })}>
                    <option value="">-- Pilih cabang --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branchCode} - {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tipe Lokasi Kerja</label>
                  <select className={INPUT_CLS} value={userForm.workLocationType} onChange={(e) => setUserForm({ ...userForm, workLocationType: e.target.value })}>
                    {WORK_LOCATION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Lahir</label>
                  <input type="date" className={INPUT_CLS} value={userForm.birthDate} onChange={(e) => setUserForm({ ...userForm, birthDate: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">No. Telepon</label>
                  <input className={INPUT_CLS} value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Status PTKP (contoh: TK/0)</label>
                  <input className={INPUT_CLS} value={userForm.ptkpStatus} onChange={(e) => setUserForm({ ...userForm, ptkpStatus: e.target.value })} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={submitUser}>{editingUser ? 'Simpan Perubahan' : 'Tambah'}</Button>
                <Button variant="secondary" onClick={() => setShowUserForm(false)}>Batal</Button>
              </div>
            </Card>
          )}

          <Card>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
              </div>
            ) : users.length === 0 ? (
              <Empty text="Belum ada pengguna." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Nama</th>
                      <th className="px-3 py-2 font-semibold">NIP</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                      <th className="px-3 py-2 font-semibold">Role</th>
                      <th className="px-3 py-2 font-semibold">Cabang</th>
                      <th className="px-3 py-2 font-semibold">Tipe Lokasi</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-medium">{u.fullName}</td>
                        <td className="px-3 py-2.5">{u.nip}</td>
                        <td className="px-3 py-2.5">{u.email}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={roleTone(u.role)}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
                        </td>
                        <td className="px-3 py-2.5">{u.branch?.name ?? '-'}</td>
                        <td className="px-3 py-2.5">
                          {u.workLocationType === 'OFFICE_BOUND' ? 'Kantor' : u.workLocationType === 'FIELD_MOBILE' ? 'Lapangan' : u.workLocationType}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => openEditUser(u)}>Edit</Button>
                            <Button variant={u.isActive ? 'danger' : 'primary'} onClick={() => toggleActive(u)}>
                              {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'cabang' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <Button onClick={openAddBranch}>+ Tambah Cabang</Button>
          </div>

          {showBranchForm && (
            <Card>
              <h2 className="mb-4 text-base font-bold">{editingBranch ? 'Edit Cabang' : 'Tambah Cabang'}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kode Cabang</label>
                  <input className={INPUT_CLS} value={branchForm.branchCode} onChange={(e) => setBranchForm({ ...branchForm, branchCode: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nama Cabang</label>
                  <input className={INPUT_CLS} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Alamat</label>
                  <input className={INPUT_CLS} value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Latitude</label>
                  <input type="number" step="any" className={INPUT_CLS} value={branchForm.latitude} onChange={(e) => setBranchForm({ ...branchForm, latitude: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Longitude</label>
                  <input type="number" step="any" className={INPUT_CLS} value={branchForm.longitude} onChange={(e) => setBranchForm({ ...branchForm, longitude: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Radius Geofence (meter)</label>
                  <input type="number" className={INPUT_CLS} value={branchForm.geofenceRadiusM} onChange={(e) => setBranchForm({ ...branchForm, geofenceRadiusM: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kuota Teller</label>
                  <input type="number" className={INPUT_CLS} value={branchForm.minTellerQuota} onChange={(e) => setBranchForm({ ...branchForm, minTellerQuota: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kuota CS</label>
                  <input type="number" className={INPUT_CLS} value={branchForm.minCsQuota} onChange={(e) => setBranchForm({ ...branchForm, minCsQuota: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Jam Masuk (contoh 08:00)</label>
                  <input type="time" className={INPUT_CLS} value={branchForm.workStartTime} onChange={(e) => setBranchForm({ ...branchForm, workStartTime: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Jam Pulang (contoh 17:00)</label>
                  <input type="time" className={INPUT_CLS} value={branchForm.workEndTime} onChange={(e) => setBranchForm({ ...branchForm, workEndTime: e.target.value })} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={submitBranch}>{editingBranch ? 'Simpan Perubahan' : 'Tambah'}</Button>
                <Button variant="secondary" onClick={() => setShowBranchForm(false)}>Batal</Button>
              </div>
            </Card>
          )}

          <Card>
            {loadingBranches ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
              </div>
            ) : branches.length === 0 ? (
              <Empty text="Belum ada cabang." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Kode</th>
                      <th className="px-3 py-2 font-semibold">Nama</th>
                      <th className="px-3 py-2 font-semibold">Alamat</th>
                      <th className="px-3 py-2 font-semibold">Radius</th>
                      <th className="px-3 py-2 font-semibold">Kuota Teller/CS</th>
                      <th className="px-3 py-2 font-semibold">Jam Kerja</th>
                      <th className="px-3 py-2 font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-medium">{b.branchCode}</td>
                        <td className="px-3 py-2.5">{b.name}</td>
                        <td className="px-3 py-2.5">{b.address ?? '-'}</td>
                        <td className="px-3 py-2.5">{b.geofenceRadiusM != null ? `${b.geofenceRadiusM} m` : '-'}</td>
                        <td className="px-3 py-2.5">
                          {b.minTellerQuota ?? '-'} / {b.minCsQuota ?? '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          {b.workStartTime && b.workEndTime ? `${b.workStartTime} - ${b.workEndTime}` : '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          <Button variant="secondary" onClick={() => openEditBranch(b)}>Edit</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'libur' && (
        <div className="space-y-5">
          <Card>
            <h2 className="mb-4 text-base font-bold">Tambah Hari Libur</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal</label>
                <input
                  type="date"
                  className={INPUT_CLS}
                  value={holidayForm.holidayDate}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holidayDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama</label>
                <input
                  className={INPUT_CLS}
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  placeholder="Contoh: Hari Kemerdekaan"
                />
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Tipe</label>
                <select
                  className={INPUT_CLS}
                  value={holidayForm.type}
                  onChange={(e) => setHolidayForm({ ...holidayForm, type: e.target.value })}
                >
                  {HOLIDAY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={submitHoliday}>Tambah</Button>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-base font-bold">Daftar Hari Libur</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500">Tahun</label>
                <input
                  type="number"
                  className={INPUT_CLS + ' w-28'}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
                />
              </div>
            </div>
            {loadingHolidays ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
              </div>
            ) : holidays.length === 0 ? (
              <Empty text="Belum ada hari libur untuk tahun ini." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Tanggal</th>
                      <th className="px-3 py-2 font-semibold">Nama</th>
                      <th className="px-3 py-2 font-semibold">Tipe</th>
                      <th className="px-3 py-2 font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.map((h) => (
                      <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2.5">{formatDate(h.holidayDate)}</td>
                        <td className="px-3 py-2.5 font-medium">{h.name}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={h.type === 'NATIONAL_HOLIDAY' ? 'blue' : 'amber'}>
                            {h.type === 'NATIONAL_HOLIDAY' ? 'Libur Nasional' : 'Cuti Bersama'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Button variant="danger" onClick={() => deleteHoliday(h)}>Hapus</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
