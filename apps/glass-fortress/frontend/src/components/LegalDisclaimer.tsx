'use client';

// Required on every thesis page, call page, and key figures dossier.
// See COMPLIANCE.md for the legal rationale.
export function LegalDisclaimer() {
  return (
    <div className="border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 space-y-1" dir="rtl">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide" dir="ltr">
        ניתוח AI — אינו מהווה קביעה שיפוטית
      </p>
      <p className="text-xs text-slate-500 leading-relaxed">
        כל הטענות המוצגות מבוססות על ראיות מתועדות ומהוות ניתוח משפטי בתום לב בעניין ציבורי.
        אין בהן קביעה שיפוטית. הפלטפורמה מציגה חומר לצורך חקירה ציבורית בלבד.
      </p>
      <p className="text-xs text-slate-400 leading-relaxed" dir="ltr">
        All claims are based on documented evidence and constitute good-faith legal analysis on a matter
        of public interest. They do not constitute a judicial finding.
      </p>
    </div>
  );
}
