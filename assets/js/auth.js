/* ══════════════════════════════════════════════════════
   AUTH.JS  —  Google Sign-In + Firebase Auth
   Exporta: currentUser, signInWithGoogle, signOut, onAuthReady
══════════════════════════════════════════════════════ */

import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth,
         GoogleAuthProvider,
         signInWithPopup,
         signOut as fbSignOut,
         onAuthStateChanged }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import FIREBASE_CONFIG          from "./firebase-config.js";

/* ── Init ─────────────────────────────────────────── */
const app      = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db   = getFirestore(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/* ── Estado público ───────────────────────────────── */
export let currentUser = null;

/* ── Acciones ─────────────────────────────────────── */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user") return null;
    console.error("[Auth] Error en login:", err);
    throw err;
  }
}

export async function signOut() {
  await fbSignOut(auth);
  currentUser = null;
}

/* ── Observer: llama cb cuando el estado de sesión cambia ─ */
export function onAuthReady(cb) {
  onAuthStateChanged(auth, user => {
    currentUser = user || null;
    cb(user);
  });
}