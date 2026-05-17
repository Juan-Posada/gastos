/* ══════════════════════════════════════════════════════
   PWA.JS  —  finZa
   • Registro del Service Worker
   • Banner de instalación (Android / iOS / Desktop)
   • Detección de conectividad
══════════════════════════════════════════════════════ */

let deferredPrompt = null;
let toastFn = null;

/* ══════════════════════════════════════════════════════
   0. CAPTURA TEMPRANA DE beforeinstallprompt
   Se ejecuta inmediatamente al cargar el módulo,
   ANTES de que auth/firebase estén listos.
══════════════════════════════════════════════════════ */
window.addEventListener('beforeinstallprompt', e => {
  // No llamamos e.preventDefault() → Chrome muestra su mini-infobar nativo
  deferredPrompt = e;
  console.log('[PWA] beforeinstallprompt capturado');
  // No mostramos el banner aquí — esperamos a que initPWA() lo haga
  // después de que la pantalla de carga desaparezca
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App instalada exitosamente');
  deferredPrompt = null;
  dismissBanner();
});

/* ══════════════════════════════════════════════════════
   1. REGISTRO DEL SERVICE WORKER
══════════════════════════════════════════════════════ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./service-worker.js', { scope: './' })
    .then(reg => {
      console.log('[PWA] Service Worker registrado:', reg.scope);
    })
    .catch(err => {
      console.error('[PWA] Error al registrar Service Worker:', err);
    });
}

/* ══════════════════════════════════════════════════════
   2. DETECCIÓN DE PLATAFORMA
══════════════════════════════════════════════════════ */
function getPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'desktop';
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

/* ══════════════════════════════════════════════════════
   3. BANNER DE INSTALACIÓN
   Se muestra SIEMPRE hasta que la app esté instalada.
   Solo se cierra cuando el usuario toca "Entendido".
══════════════════════════════════════════════════════ */

function closeBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 400);
  }
}

function showInstallBanner() {
  // Solo ocultar si ya está instalada como app standalone
  if (isStandalone()) return;

  const platform = getPlatform();
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;

  const titleEl    = banner.querySelector('.pwa-banner-title');
  const descEl     = banner.querySelector('.pwa-banner-desc');
  const installBtn = banner.querySelector('.pwa-banner-install');
  const iosGuide   = banner.querySelector('.pwa-ios-guide');

  if (platform === 'ios') {
    titleEl.textContent = '¡Instala finZa!';
    descEl.textContent = 'Agrégala a tu pantalla de inicio para una mejor experiencia:';
    installBtn.classList.add('hidden');
    iosGuide.classList.remove('hidden');
  } else if (deferredPrompt) {
    titleEl.textContent = platform === 'android'
      ? '¡Instala finZa!'
      : 'Instala finZa en tu computador';
    descEl.textContent = platform === 'android'
      ? 'Accede más rápido desde tu pantalla de inicio.'
      : 'Accede sin abrir el navegador.';
    installBtn.classList.remove('hidden');
    iosGuide.classList.add('hidden');
  } else {
    // No hay prompt y no es iOS → no mostrar
    return;
  }

  // Mostrar con animación (delay de 2s para no ser invasivo)
  setTimeout(() => banner.classList.add('show'), 2000);
}

function handleInstallClick() {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      console.log('[PWA] Usuario aceptó la instalación');
    } else {
      console.log('[PWA] Usuario rechazó la instalación');
    }
    deferredPrompt = null;
    closeBanner();
  });
}

/* ══════════════════════════════════════════════════════
   4. DETECCIÓN DE CONECTIVIDAD
══════════════════════════════════════════════════════ */
function setupConnectivityWatcher(toast) {
  function notifyOffline() {
    toast('Sin conexión a internet. Algunas funciones no estarán disponibles.', 'error');
  }

  function notifyOnline() {
    toast('Conexión restablecida', 'success');
  }

  if (!navigator.onLine) {
    setTimeout(notifyOffline, 3000);
  }

  window.addEventListener('offline', notifyOffline);
  window.addEventListener('online', notifyOnline);
}

/* ══════════════════════════════════════════════════════
   5. INICIALIZACIÓN
══════════════════════════════════════════════════════ */
export function initPWA(toast) {
  toastFn = toast;

  // 1. Registrar Service Worker
  registerServiceWorker();

  // 2. Para iOS, mostrar el banner después de un delay
  if (getPlatform() === 'ios' && !isStandalone()) {
    setTimeout(showInstallBanner, 3000);
  }

  // 3. Si ya capturamos el prompt antes de init, mostrar el banner
  if (deferredPrompt) {
    showInstallBanner();
  }

  // 4. Vincular botón de instalación
  const installBtn = document.querySelector('.pwa-banner-install');
  if (installBtn) {
    installBtn.addEventListener('click', handleInstallClick);
  }

  // 5. Vincular botón "Entendido" (cierra el banner para esta sesión)
  const closeBtn = document.querySelector('.pwa-banner-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeBanner);
  }

  // 6. Configurar watcher de conectividad
  if (toast) {
    setupConnectivityWatcher(toast);
  }
}

