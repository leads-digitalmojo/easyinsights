'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { TrendingUp } from 'lucide-react';

export default function RootPage() {
  const { user, workspaces, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/login');
    } else if (workspaces.length > 0) {
      router.push(`/${workspaces[0]!.slug}`);
    } else {
      router.push('/register');
    }
  }, [user, workspaces, loading, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
          <TrendingUp className="w-7 h-7 text-white" />
        </div>
        <span className="font-extrabold text-2xl tracking-wider">MOJOINSIGHTS</span>
      </div>
      <p className="text-slate-400 text-sm tracking-widest uppercase animate-pulse">
        Authenticating conversion streams...
      </p>
    </div>
  );
}
