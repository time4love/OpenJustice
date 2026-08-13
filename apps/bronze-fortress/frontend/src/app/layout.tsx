import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'צדק לעם - תיק דיני משפחה',
  description: 'יחד הדפוס מתגלה',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang/dir default to Hebrew (RTL). The [locale]/layout handles locale validation;
  // html attributes are overridden per-locale by the browser once JS hydrates.
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
