'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import {
  LogOut,
  ChevronDown,
  Building,
  User,
} from 'lucide-react';

interface TopBarProps {
  workspaceName: string;
  workspaceSlug: string;
  userEmail?: string | null;
}

export default function TopBar({ workspaceName, workspaceSlug, userEmail }: TopBarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0 shadow-sm">
      {/* Workspace Display */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
          <Building className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-800 text-sm tracking-wide leading-tight">
            {workspaceName || 'Loading Workspace...'}
          </h2>
          <span className="text-xs font-mono text-slate-500">
            slug: {workspaceSlug}
          </span>
        </div>
      </div>

      {/* Action Center & Profile */}
      <div className="flex items-center space-x-6">
        {/* Search Input Bar */}
        
        {/* Notifications Icon Button */}
      
        {/* Profile Dropdown */}
        <div className="flex items-center space-x-3 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-100 to-blue-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm shadow-sm select-none uppercase">
            {userEmail ? userEmail.charAt(0) : <User className="w-4 h-4" />}
          </div>
          <div className="hidden md:block">
            <span className="block text-xs font-semibold text-slate-700 truncate max-w-[120px]">
              {userEmail || 'Client Account'}
            </span>
            <span className="block text-xs text-slate-500 font-medium tracking-wide">
              Administrator
            </span>
          </div>
          
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Log Out"
            className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-500 flex items-center justify-center transition-all duration-200 border border-transparent hover:border-red-100"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
