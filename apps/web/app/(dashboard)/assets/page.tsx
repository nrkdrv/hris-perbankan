'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, apiBlob, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, PageHeader, Button, Badge, Empty, formatDate, formatDateTime, formatRp } from '@/components/ui';

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100';

type ConditionStatus = 'GOOD_ACTIVE' | 'UNDER_REPAIR' | 'DAMAGED_WRITTEN_OFF';

interface AssetItem {
  id: string;
  assetCode: string;
  name: string;
  categoryCode: string;
  branchId: string;
  branch?: { name: string } | null;
  serialNumber?: string | null;
  specifications?: string | null;
  acquisitionDate?: string | null;
  acquisitionCost?: string | number | null;
  usefulLifeMonths?: number | null;
  conditionStatus: ConditionStatus;
  currentPicUserId?: string | null;
  currentPic?: { fullName: string } | null;
}

interface HandoverItem {
  id: string;
  handoverDate: string;
  fromUser?: { fullName: string } | null;
  toUser?: { fullName: string } | null;
  notes?: string | null;
  bastPdfUrl?: string | null;
}

interface AssetDetail extends AssetItem {
  handovers: HandoverItem[];
}

interface SimpleUser {
  id: string;
  fullName: string;
  nip: string;
}

interface Branch {
  id: string;
  branchCode: string;
  name: string;
}

const CONDITION_META: Record<ConditionStatus, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  GOOD_ACTIVE: { label: 'Baik / Aktif', tone: 'green' },
  UNDER_REPAIR: { label: 'Dalam Perbaikan', tone: 'amber' },
  DAMAGED_WRITTEN_OFF: { label: 'Rusak / Dihapuskan', tone: 'red' },
};

const MANAGER_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER'];

function unwrap<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { data?: unknown }).data)) {
    return (res as { data: T[] }).data;
  }
  return [];
}

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Terjadi kesalahan jaringan.';
}

export default function AssetsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canManage = user ? MANAGER_ROLES.includes(user.role) : false;

  /* ---------- Filter & list ---------- */
  const [q, setQ] = useState('');
  const [condition, setCondition] = useState('');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  const loadBranches = useCallback(async () => {
    try {
      const res = await api<unknown>('/branches');
      setBranches(unwrap<Branch>(res));
    } catch {
      /* biarkan kosong, anti-crash */
    }
  }, []);

  const loadAssets = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const qs = new URLSearchParams();
      if (branchId) qs.set('branchId', branchId);
      if (condition) qs.set('condition', condition);
      if (q.trim()) qs.set('q', q.trim());
      const path = `/assets${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await api<unknown>(path);
      setAssets(unwrap<AssetItem>(res));
    } catch (e) {
      setListError(errMsg(e));
    } finally {
      setListLoading(false);
    }
  }, [branchId, condition, q]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  /* ---------- Detail ---------- */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const res = await api<AssetDetail>(`/assets/${id}`);
      setDetail(res);
    } catch (e) {
      setDetailError(errMsg(e));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function selectAsset(id: string) {
    setSelectedId(id);
    setQrUrl(null);
    loadDetail(id);
  }

  /* ---------- QR ---------- */
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
  }, [qrUrl]);

  async function showQr(id: string) {
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    setQrUrl(null);
    setQrError('');
    setQrLoading(true);
    try {
      const blob = await apiBlob(`/assets/${id}/qr`);
      setQrUrl(URL.createObjectURL(blob));
    } catch (e) {
      setQrError(errMsg(e));
    } finally {
      setQrLoading(false);
    }
  }

  /* ---------- Handover ---------- */
  const [users, setUsers] = useState<SimpleUser[] | null>(null);
  const [usersError, setUsersError] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverMsg, setHandoverMsg] = useState('');

  useEffect(() => {
    if (!canManage) return;
    api<unknown>('/users')
      .then((res) => setUsers(unwrap<SimpleUser>(res)))
      .catch((e: unknown) => {
        setUsers([]);
        if (e instanceof ApiError && e.status === 403) {
          setUsersError('Daftar pengguna tidak dapat dimuat');
        } else {
          setUsersError(errMsg(e));
        }
      });
  }, [canManage]);

  async function handleHandover() {
    if (!selectedId) return;
    setHandoverMsg('');
    if (!toUserId) {
      setHandoverMsg('Pilih pengguna penerima terlebih dahulu.');
      return;
    }
    setHandoverLoading(true);
    try {
      await api(`/assets/${selectedId}/handover`, {
        method: 'POST',
        body: JSON.stringify({ toUserId, notes: notes.trim() || undefined }),
      });
      setToUserId('');
      setNotes('');
      await loadDetail(selectedId);
      await loadAssets();
    } catch (e) {
      setHandoverMsg(errMsg(e));
    } finally {
      setHandoverLoading(false);
    }
  }

  /* ---------- Kondisi ---------- */
  const [newCondition, setNewCondition] = useState<ConditionStatus>('GOOD_ACTIVE');
  const [condLoading, setCondLoading] = useState(false);
  const [condMsg, setCondMsg] = useState('');

  useEffect(() => {
    if (detail) setNewCondition(detail.conditionStatus);
  }, [detail]);

  async function handleCondition() {
    if (!selectedId) return;
    setCondMsg('');
    setCondLoading(true);
    try {
      await api(`/assets/${selectedId}/condition`, {
        method: 'PATCH',
        body: JSON.stringify({ conditionStatus: newCondition }),
      });
      await loadDetail(selectedId);
      await loadAssets();
    } catch (e) {
      setCondMsg(errMsg(e));
    } finally {
      setCondLoading(false);
    }
  }

  /* ---------- Registrasi aset ---------- */
  const [rName, setRName] = useState('');
  const [rCategory, setRCategory] = useState('');
  const [rBranchId, setRBranchId] = useState('');
  const [rSerial, setRSerial] = useState('');
  const [rSpecs, setRSpecs] = useState('');
  const [rDate, setRDate] = useState('');
  const [rCost, setRCost] = useState('');
  const [rLife, setRLife] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');
    setRegLoading(true);
    try {
      await api('/assets', {
        method: 'POST',
        body: JSON.stringify({
          name: rName.trim(),
          categoryCode: rCategory.trim(),
          branchId: rBranchId,
          serialNumber: rSerial.trim() || undefined,
          specifications: rSpecs.trim() || undefined,
          acquisitionDate: rDate || undefined,
          acquisitionCost: rCost ? Number(rCost) : undefined,
          usefulLifeMonths: rLife ? Number(rLife) : undefined,
        }),
      });
      setRegSuccess('Aset berhasil didaftarkan.');
      setRName('');
      setRCategory('');
      setRSerial('');
      setRSpecs('');
      setRDate('');
      setRCost('');
      setRLife('');
      await loadAssets();
    } catch (e) {
      setRegError(errMsg(e));
    } finally {
      setRegLoading(false);
    }
  }

  const detailCond = detail ? CONDITION_META[detail.conditionStatus] : null;

  return (
    <div>
      <PageHeader
        title="Manajemen Aset"
        subtitle="Daftar aset, serah terima, kondisi, dan registrasi aset baru"
      />

      {/* ---------- Filter + tabel ---------- */}
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Pencarian</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={INPUT_CLS}
              placeholder="Kode / nama / serial"
            />
          </div>
          <div className="space-y-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Kondisi</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={INPUT_CLS}>
              <option value="">Semua</option>
              {Object.entries(CONDITION_META).map(([code, meta]) => (
                <option key={code} value={code}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Cabang</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={INPUT_CLS}>
              <option value="">Semua</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.branchCode})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={loadAssets} disabled={listLoading}>
              {listLoading ? 'Memuat...' : 'Cari'}
            </Button>
          </div>
        </div>

        {listError && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{listError}</div>
        )}

        {listLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
          </div>
        ) : assets.length === 0 ? (
          <Empty text="Tidak ada aset ditemukan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Kode</th>
                  <th className="px-3 py-2 font-semibold">Nama</th>
                  <th className="px-3 py-2 font-semibold">Kategori</th>
                  <th className="px-3 py-2 font-semibold">Cabang</th>
                  <th className="px-3 py-2 font-semibold">Kondisi</th>
                  <th className="px-3 py-2 font-semibold">PIC</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const cm = CONDITION_META[a.conditionStatus];
                  return (
                    <tr
                      key={a.id}
                      onClick={() => selectAsset(a.id)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                        selectedId === a.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{a.assetCode}</td>
                      <td className="px-3 py-2.5 font-medium">{a.name}</td>
                      <td className="px-3 py-2.5">{a.categoryCode}</td>
                      <td className="px-3 py-2.5">{a.branch?.name ?? '-'}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={cm.tone}>{cm.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5">{a.currentPic?.fullName ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------- Detail ---------- */}
      {selectedId && (
        <Card className="mt-5">
          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
            </div>
          ) : detailError ? (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{detailError}</div>
          ) : detail ? (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-800">
                  {detail.name}{' '}
                  <span className="font-mono text-sm font-semibold text-slate-500">
                    {detail.assetCode}
                  </span>
                </h2>
                <Button variant="secondary" onClick={() => showQr(detail.id)} disabled={qrLoading}>
                  {qrLoading ? 'Memuat...' : 'Tampilkan QR Code'}
                </Button>
              </div>

              {qrError && (
                <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{qrError}</div>
              )}
              {qrUrl && (
                <div className="mb-4">
                  <img src={qrUrl} alt={`QR code ${detail.assetCode}`} className="h-48 w-48 rounded-xl border p-2" />
                </div>
              )}

              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-medium text-slate-500">Kategori</dt><dd>{detail.categoryCode}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Cabang</dt><dd>{detail.branch?.name ?? '-'}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Nomor Seri</dt><dd>{detail.serialNumber || '-'}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Tanggal Perolehan</dt><dd>{formatDate(detail.acquisitionDate)}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Harga Perolehan</dt><dd>{formatRp(detail.acquisitionCost)}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Masa Manfaat</dt><dd>{detail.usefulLifeMonths != null ? `${detail.usefulLifeMonths} bulan` : '-'}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Kondisi</dt><dd>{detailCond && <Badge tone={detailCond.tone}>{detailCond.label}</Badge>}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">PIC Saat Ini</dt><dd>{detail.currentPic?.fullName ?? '-'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Spesifikasi</dt><dd className="whitespace-pre-wrap">{detail.specifications || '-'}</dd></div>
              </dl>

              {/* Riwayat handover */}
              <h3 className="mb-2 mt-6 text-sm font-bold text-slate-800">Riwayat Serah Terima</h3>
              {!detail.handovers || detail.handovers.length === 0 ? (
                <Empty text="Belum ada riwayat serah terima." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-semibold">Tanggal</th>
                        <th className="px-3 py-2 font-semibold">Dari</th>
                        <th className="px-3 py-2 font-semibold">Ke</th>
                        <th className="px-3 py-2 font-semibold">Catatan</th>
                        <th className="px-3 py-2 font-semibold">BAST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.handovers.map((h) => (
                        <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2.5">{formatDateTime(h.handoverDate)}</td>
                          <td className="px-3 py-2.5">{h.fromUser?.fullName ?? '-'}</td>
                          <td className="px-3 py-2.5">{h.toUser?.fullName ?? '-'}</td>
                          <td className="px-3 py-2.5">{h.notes || '-'}</td>
                          <td className="px-3 py-2.5">
                            {h.bastPdfUrl ? (
                              <a href={h.bastPdfUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                                Unduh BAST
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Serah terima */}
              {canManage && (
                <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-800">Serah Terima Aset</h3>
                  {handoverMsg && (
                    <div
                      className={`mb-4 rounded-xl px-4 py-3 text-sm ${
                        handoverMsg.startsWith('Pilih') || handoverMsg.includes('gagal') || handoverMsg.includes('kesalahan')
                          ? 'bg-red-50 text-red-700'
                          : 'bg-green-50 text-green-700'
                      }`}
                    >
                      {handoverMsg}
                    </div>
                  )}
                  {usersError && (
                    <div className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-700">
                      {usersError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className="mb-1 block text-sm font-medium text-slate-700">Penerima</label>
                      <select
                        value={toUserId}
                        onChange={(e) => setToUserId(e.target.value)}
                        className={INPUT_CLS}
                        disabled={!users}
                      >
                        <option value="">-- Pilih pengguna --</option>
                        {(users ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} ({u.nip})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={INPUT_CLS}
                        placeholder="Catatan serah terima"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleHandover} disabled={handoverLoading}>
                        {handoverLoading ? 'Memproses...' : 'Serahkan Aset'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Ubah kondisi */}
              {canManage && (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-800">Ubah Kondisi</h3>
                  {condMsg && (
                    <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{condMsg}</div>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <label className="mb-1 block text-sm font-medium text-slate-700">Kondisi Baru</label>
                      <select
                        value={newCondition}
                        onChange={(e) => setNewCondition(e.target.value as ConditionStatus)}
                        className={INPUT_CLS}
                      >
                        {Object.entries(CONDITION_META).map(([code, meta]) => (
                          <option key={code} value={code}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={handleCondition} disabled={condLoading}>
                      {condLoading ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Empty text="Pilih aset dari tabel untuk melihat detail." />
          )}
        </Card>
      )}

      {/* ---------- Registrasi ---------- */}
      {isSuperAdmin && (
        <Card className="mt-5">
          <form onSubmit={handleRegister} className="space-y-4">
            <h2 className="text-base font-bold text-slate-800">Registrasi Aset Baru</h2>
            {regError && (
              <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{regError}</div>
            )}
            {regSuccess && (
              <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{regSuccess}</div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama Aset</label>
                <input value={rName} onChange={(e) => setRName(e.target.value)} className={INPUT_CLS} required />
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Kode Kategori</label>
                <input
                  value={rCategory}
                  onChange={(e) => setRCategory(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="mis. IT / KENDARAAN"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Cabang</label>
                <select value={rBranchId} onChange={(e) => setRBranchId(e.target.value)} className={INPUT_CLS} required>
                  <option value="">-- Pilih cabang --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.branchCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nomor Seri <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input value={rSerial} onChange={(e) => setRSerial(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tanggal Perolehan <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Harga Perolehan <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={rCost}
                  onChange={(e) => setRCost(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Rp"
                />
              </div>
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Masa Manfaat (bulan) <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={rLife}
                  onChange={(e) => setRLife(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Spesifikasi <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <textarea
                  value={rSpecs}
                  onChange={(e) => setRSpecs(e.target.value)}
                  className={INPUT_CLS}
                  rows={3}
                />
              </div>
            </div>
            <Button type="submit" disabled={regLoading}>
              {regLoading ? 'Menyimpan...' : 'Daftarkan Aset'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
