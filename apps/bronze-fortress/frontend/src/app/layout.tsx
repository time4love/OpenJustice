import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'מבצר הנחושת',
  description: 'יחד הדפוס מתגלה',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
