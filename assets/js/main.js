/* ══════════════════════════════════════════════════════
   MAIN.JS  —  Punto de entrada
   Orquesta: Auth → carga de datos → render de la app
══════════════════════════════════════════════════════ */

import { onAuthReady, signInWithGoogle, signOut } from "./auth.js";
import { loadFromFirestore, render, toast, initVanta } from "./app.js";

/* ── Elementos de UI ──────────────────────────────── */
const loginScreen = document.getElementById('login-screen');
const appScreen   = document.getElementById('app');
const btnGoogle   = document.getElementById('btn-google-login');
const btnSignOut  = document.getElementById('btn-signout');
const userAvatar  = document.getElementById('user-avatar');
const userName    = document.getElementById('user-name');
const loadingOverlay = document.getElementById('loading-overlay');

/* ── Mostrar / ocultar pantallas ──────────────────── */
function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
  document.querySelector('.fab')?.classList.add('hidden');
}

function showApp(user) {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  document.querySelector('.fab')?.classList.remove('hidden');

  // Actualizar avatar y nombre
  if (userAvatar) {
    if (user.photoURL) {
      userAvatar.innerHTML = `<img src="${user.photoURL}" alt="avatar" />`;
    } else {
      userAvatar.textContent = user.displayName?.[0] || '?';
    }
  }
  if (userName) {
    const firstName = user.displayName?.split(' ')[0] || user.email;
    userName.textContent = firstName;
  }
}

function setLoading(on) {
  loadingOverlay.classList.toggle('hidden', !on);
}

/* ── Observer principal ───────────────────────────── */
onAuthReady(async (user) => {
  if (user) {
    setLoading(true);
    try {
      await loadFromFirestore();
      showApp(user);
      render();
      // Inicializar Vanta solo una vez
      if (typeof VANTA !== 'undefined' && !window._vantaInit) {
        initVanta();
        window._vantaInit = true;
      }
    } catch (err) {
      console.error("[Main] Error al inicializar:", err);
      toast("Error al cargar la app", "error");
    } finally {
      setLoading(false);
    }
  } else {
    showLogin();
    setLoading(false);
  }
});

/* ── Botón: Iniciar sesión ────────────────────────── */
btnGoogle?.addEventListener('click', async () => {
  btnGoogle.disabled = true;
  btnGoogle.classList.add('loading');
  try {
    const user = await signInWithGoogle();
    if (!user) {
      btnGoogle.disabled = false;
      btnGoogle.classList.remove('loading');
    }
    // El observer onAuthReady maneja el resto
  } catch (err) {
    toast("No se pudo iniciar sesión", "error");
    btnGoogle.disabled = false;
    btnGoogle.classList.remove('loading');
  }
});

/* ── Botón: Cerrar sesión ─────────────────────────── */
btnSignOut?.addEventListener('click', async () => {
  await signOut();
  // El observer onAuthReady detecta el logout y muestra login
});