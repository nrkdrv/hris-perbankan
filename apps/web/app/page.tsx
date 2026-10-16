import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-10 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-2xl font-bold text-white">
          B
        </div>
        <h1 className="text-2xl font-bold">HRIS &amp; Operasional Perbankan</h1>
        <p className="mt-2 text-sm text-slate-500">
          Absensi geofencing, field force monitoring, kalender &amp; cuti, Kanban,
          nomor surat OJK, inventaris aset, dan e-payslip dalam satu sistem terpadu.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-blue-700 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Masuk ke Sistem
        </Link>
        <p className="mt-4 text-xs text-slate-400">
          Akun demo: admin@bank.local / password123
        </p>
      </div>
    </main>
  );
}
