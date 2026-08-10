import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'בדלתיים סגורות',
  description: 'יחד, הדפוס גלוי',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
