import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDMqtxQfmOgGXm85LhhXjAvFRD5BUQ90V8",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "crm1-76cc4.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crm1-76cc4",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "crm1-76cc4.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "867270353400",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:867270353400:web:ed075186de29846ae3760d"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);

// Restrict Google sign-in to the company domain (optional but recommended).
// Set NEXT_PUBLIC_ALLOWED_AUTH_DOMAIN=yourcompany.com to enable.
const googleProvider = new GoogleAuthProvider();
const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_AUTH_DOMAIN;
if (allowedDomain) {
  googleProvider.setCustomParameters({ hd: allowedDomain });
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const email = result.user.email || '';
  if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
    await fbSignOut(auth);
    throw new Error(`Only @${allowedDomain} accounts are allowed.`);
  }
  return result.user;
}

export async function signOutUser() {
  await fbSignOut(auth);
}

export default app;
