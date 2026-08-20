'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Link } from '@/i18n/navigation';

function ProfileContent() {
  const t = useTranslations('auth');
  const { researcher, logout } = useAuth();

  if (!researcher) return null;

  const roleBadgeClass =
    researcher.role === 'ADMIN'
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : 'bg-blue-100 text-blue-800 border-blue-200';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto px-4 py-12 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">← {t('backToHome')}</Link>
          <div className="flex items-center gap-3">
            {researcher.role === 'ADMIN' && (
              <Link href="/admin" className="text-xs text-purple-600 hover:text-purple-800 font-medium">
                Admin
              </Link>
            )}
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-red-600 transition-colors"
            >
              {t('logout')}
            </button>
          </div>
        </div>

        {/* Identity card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">{t('handle')}</p>
              <p className="text-xl font-mono font-semibold text-slate-900 mt-0.5">{researcher.handle}</p>
            </div>
            <span className={`px-2.5 py-1 text-xs font-medium rounded border ${roleBadgeClass}`}>
              {researcher.role}
            </span>
          </div>

          {!researcher.approved && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium">{t('pendingApproval')}</p>
              <p className="text-xs text-amber-600 mt-0.5">{t('pendingApprovalHint')}</p>
            </div>
          )}

          {researcher.approved && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-sm text-emerald-800 font-medium">{t('approved')}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
