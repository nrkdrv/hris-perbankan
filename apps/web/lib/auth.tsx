'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAccessToken } from './api';

export interface Me {
  id: string;
  nip: string;
  fullName: string;
  email: string;
  role: string;
  jobTitle: string | null;
  branchId: string;
  branch?: { branchCode: string; name: string };
  workLocationType: string;
}

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api<Me>('/auth/me')
      .then((me) => setUser(me))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ accessToken: string; user: Me }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch { /* abaikan */ }
    setAccessToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin / HRD',
  BRANCH_MANAGER: 'Pimpinan Cabang',
  OFFICE_EMPLOYEE: 'Karyawan Kantor',
  FIELD_EMPLOYEE: 'Karyawan Lapangan',
  AUDITOR: 'Auditor',
};
