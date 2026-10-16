import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children, onClick, type = 'button', variant = 'primary', disabled, className = '',
}: {
  children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; className?: string;
}) {
  const styles = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800',
    secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-slate-400">{text}</p>;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatRp(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}
