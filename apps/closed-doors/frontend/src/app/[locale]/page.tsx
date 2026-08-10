import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold mb-4">{t('headline')}</h1>
      <p className="text-lg text-slate-300 max-w-xl mb-8">{t('subheadline')}</p>
      <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors">
        {t('registerCta')}
      </button>
    </main>
  );
}
