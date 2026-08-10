import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

function Step({ num, title, body }: { num: number; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-sm">
        {num}
      </div>
      <div>
        <p className="font-semibold text-slate-100 mb-1">{title}</p>
        <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">

      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-5 leading-tight">{t('headline')}</h1>
        <p className="text-lg text-slate-300 leading-relaxed mb-8">{t('subheadline')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-7 py-3 rounded-lg transition-colors"
          >
            {t('registerCta')}
          </Link>
          <Link
            href="/login"
            className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-semibold px-7 py-3 rounded-lg transition-colors"
          >
            {t('loginCta')}
          </Link>
        </div>
      </div>

      {/* How it works */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold text-slate-200 mb-6">{t('howTitle')}</h2>
        <div className="flex flex-col gap-7">
          <Step num={1} title={t('step1Title')} body={t('step1Body')} />
          <Step num={2} title={t('step2Title')} body={t('step2Body')} />
          <Step num={3} title={t('step3Title')} body={t('step3Body')} />
        </div>
      </section>

      {/* Legal framing + privacy */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="font-semibold text-slate-200 mb-2">{t('privacyTitle')}</p>
          <p className="text-slate-400 text-sm leading-relaxed">{t('privacyBody')}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="font-semibold text-slate-200 mb-2">{t('legalTitle')}</p>
          <p className="text-slate-400 text-sm leading-relaxed">{t('legalBody')}</p>
        </div>
      </div>
    </div>
  );
}
