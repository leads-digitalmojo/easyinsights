'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signInWithGoogle } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { user, workspaces, loading } = useAuth();

  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (workspaces.length > 0) {
        router.push(`/${workspaces[0]!.slug}`);
      } else {
        router.push('/register');
      }
    }
  }, [user, workspaces, loading, router]);

  const handleGoogleLogin = async () => {
    setError('');
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      // Auth listener in AuthContext handles redirect
    } catch (err: any) {
      console.error('Google login error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled.');
      } else {
        setError(err.message || 'Google sign-in failed.');
      }
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-md border border-slate-800 p-8 rounded-2xl shadow-2xl relative">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <Image src="/logo.png" alt="MOJOINSIGHTS Logo" width={56} height={56} style={{ objectFit: 'contain' }} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wider">MOJOINSIGHTS</h1>
          <p className="text-slate-300 text-xs uppercase tracking-widest mt-1">Multi-Tenant Conversion Portal</p>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-950/40 border border-red-800/60 text-red-300 text-xs rounded-xl flex items-center space-x-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={authLoading}
          className="w-full py-3 bg-white text-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-100 active:scale-95 transition-all duration-150 flex items-center justify-center space-x-3 disabled:opacity-50 disabled:pointer-events-none shadow-lg"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span>{authLoading ? 'Signing In…' : 'Sign in with Google'}</span>
        </button>

        <p className="mt-6 text-center text-xs text-slate-500">
          Internal access only. Sign in with your company Google account.
        </p>
      </div>
    </div>
  );
}
