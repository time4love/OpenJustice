'use client';

import { useTranslations } from 'next-intl';

interface Props {
  /** When given, renders the AI-review status pill inside the disclaimer
   * instead of as a separate element elsewhere on the page — the status and
   * the "this is AI analysis" disclaimer are the same fact, said once. */
  status?: 'COMPLETE' | 'PENDING_AI';
}

// Required on every thesis page, call page, and key figures dossier.
// See COMPLIANCE.md for the legal rationale.
export function LegalDisclaimer({ status }: Props) {
  const t = useTranslations('theses');
  return (
    <div className="border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 space-y-1" dir="rtl">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide" dir="ltr">
          ניתוח AI — אינו מהווה קביעה שיפוטית
        </p>
        {status && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              status === 'COMPLETE'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-amber-100 text-amber-700 border-amber-300'
            }`}
          >
            {status === 'COMPLETE' ? t('aiReviewedStatus') : t('pendingAiStatus')}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        כל הטענות המוצגות מבוססות על ראיות מתועדות ומהוות ניתוח משפטי בתום לב בעניין ציבורי.
        אין בהן קביעה שיפוטית. הפלטפורמה מציגה חומר לצורך חקירה ציבורית בלבד.
      </p>
    </div>
  );
}
