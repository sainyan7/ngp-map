import { signInAnonymously, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './config';

/**
 * Convert a string to its SHA-256 hex digest using the Web Crypto API.
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sign in with a shared group password.
 * Flow:
 *   1. Anonymous sign-in with Firebase Auth
 *   2. Fetch /settings to get groupPasswordHash / adminPasswordHash
 *   3. Compare SHA-256(input) with stored hash
 *   4. On match, write /userRoles/{uid} = { authenticated: true, admin: bool }
 *
 * Returns { success: true, isAdmin: bool } or throws an Error.
 */
export async function signInWithPassword(password, nickname) {
  // Step 1: anonymous sign-in
  const userCredential = await signInAnonymously(auth);
  const { uid } = userCredential.user;

  // Step 2: fetch stored hashes
  const settingsSnap = await getDoc(doc(db, 'settings', 'main'));
  if (!settingsSnap.exists()) {
    throw new Error('設定ドキュメントが見つかりません。Firestoreに /settings/main を作成してください。');
  }
  const { groupPasswordHash, adminPasswordHash } = settingsSnap.data();

  // Step 3: hash the input
  const inputHash = await sha256(password);

  // Normalize stored hashes to lowercase + trim to handle tools that output
  // uppercase hex or accidentally include whitespace
  const storedGroup = (groupPasswordHash ?? '').toLowerCase().trim();
  const storedAdmin = (adminPasswordHash ?? '').toLowerCase().trim();

  const isGroup = inputHash === storedGroup;
  const isAdmin = inputHash === storedAdmin;

  if (!isGroup && !isAdmin) {
    // Sign out the anonymous user so the next attempt starts fresh
    await firebaseSignOut(auth);
    throw new Error('パスワードが正しくありません。');
  }

  // Step 4: persist auth state in Firestore
  await setDoc(doc(db, 'userRoles', uid), {
    authenticated: true,
    admin: isAdmin,
    nickname: nickname || '名無し',
    updatedAt: new Date().toISOString(),
  });

  return { isAdmin };
}

/**
 * Restore a previous session without re-entering the password.
 * Uses Firebase Auth's built-in IndexedDB persistence — if the anonymous
 * user is still alive, check /userRoles/{uid} to confirm authentication.
 * Returns { user, isAdmin, nickname } or null.
 */
export function restoreSession() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub(); // one-shot
      if (!user) { resolve(null); return; }
      try {
        const snap = await getDoc(doc(db, 'userRoles', user.uid));
        if (snap.exists() && snap.data().authenticated === true) {
          resolve({
            user,
            isAdmin:  snap.data().admin    ?? false,
            nickname: snap.data().nickname ?? '',
          });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Sign out: clear Firestore auth flag then Firebase sign out.
 */
export async function signOut(uid) {
  if (uid) {
    await setDoc(
      doc(db, 'userRoles', uid),
      { authenticated: false, admin: false },
      { merge: true }
    );
  }
  await firebaseSignOut(auth);
}
