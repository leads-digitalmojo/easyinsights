import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MOJOINSIGHTS — Multi-Tenant Conversion & CRM Lead Tracker',
  description: 'AdSync platform mapping Zoho, Salesforce, and LeadSquared leads to Meta Conversions API and Google Ads API in real-time.',
};

export default function RootLayout({
  children,
  }: Readonly<{
    children: React.ReactNode;
  }>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased text-slate-800 bg-slate-50`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
