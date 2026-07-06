'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Workspace } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspace: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);

  // Subscribe to real Firebase Auth state (Google sign-in)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setWorkspaces([]);
        setActiveWorkspace(null);
        setLoading(false);
        return;
      }
      // Run sync BEFORE setting user so the workspace query starts only after
      // the user has been added to all workspace members arrays.
      try {
        const token = await firebaseUser.getIdToken();
        await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.warn('[Auth] sync call failed (non-fatal):', e);
      }
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // Listen to workspaces the user is a member of
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const q = query(
      collection(db, 'workspaces'),
      where('members', 'array-contains', user.uid)
    );

    const unsubscribeWorkspaces = onSnapshot(
      q,
      (snapshot) => {
        const list: Workspace[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Workspace);
        });
        setWorkspaces(list);

        // Keep active workspace or select first one if not set
        if (list.length > 0) {
          setActiveWorkspace((prev) => {
            if (prev) {
              const updated = list.find((w) => w.id === prev.id);
              if (updated) return updated;
            }
            return list[0]!;
          });
        } else {
          setActiveWorkspace(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to workspaces:', error);
        setLoading(false);
      }
    );

    return () => unsubscribeWorkspaces();
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
