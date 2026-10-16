'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { ApiError } from '@/lib/api';

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100';

function LoginForm() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
      </div>
    );
  }
  if (user) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal masuk. Periksa email dan kata sandi, lalu coba lagi.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-center text-2xl font-bold text-blue-800">HRIS Bank</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Masuk untuk mengakses sistem HRIS
      </p>
      {error && (
        <div className="mb-4 mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="space-y-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLS}
            placeholder="nama@bank.co.id"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Kata Sandi
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_CLS}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Memproses…' : 'Masuk'}
        </Button>
      </form>
      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    </main>
  );
}
