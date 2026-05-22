/**
 * OAU Transit — PWA Helper
 * Handles: SW registration, install prompt (Android), iOS install banner,
 *          update detection + reload prompt, offline/online indicator.
 *
 * Include ONCE in every HTML page, just before </body>:
 *   <script src="pwa.js"></script>
 */

(function () {
  'use strict';

  // ── Inject shared CSS for PWA UI elements ──────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* ── INSTALL BANNER (Android + iOS) ── */
    #pwa-install-banner {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 99999;
      background: #111;
      border-top: 1px solid rgba(255,255,255,.1);
      padding: 14px 18px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      transform: translateY(100%);
      transition: transform .4s cubic-bezier(.4,0,.2,1);
      /* Safe area for iPhone home bar */
      padding-bottom: max(18px, env(safe-area-inset-bottom));
    }
    #pwa-install-banner.visible { transform: translateY(0); }

    #pwa-install-banner .pwa-icon {
      width: 48px; height: 48px; border-radius: 12px;
      background: #06C167; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; font-size: 22px;
    }
    #pwa-install-banner .pwa-text { flex: 1; min-width: 0; }
    #pwa-install-banner .pwa-title {
      font-family: 'Cabinet Grotesk', sans-serif;
      font-size: 15px; font-weight: 800; color: #f0f0f0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #pwa-install-banner .pwa-sub {
      font-size: 12px; color: #888; margin-top: 2px; line-height: 1.4;
    }
    #pwa-install-banner .pwa-btns {
      display: flex; gap: 8px; flex-shrink: 0;
    }
    #pwa-install-banner .pwa-btn-install {
      padding: 10px 18px; border-radius: 100px;
      background: #06C167; color: #000;
      font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;
      border: none; cursor: pointer; white-space: nowrap;
    }
    #pwa-install-banner .pwa-btn-dismiss {
      padding: 10px 14px; border-radius: 100px;
      background: rgba(255,255,255,.08); color: #888;
      font-family: 'Outfit', sans-serif; font-size: 13px;
      border: 1px solid rgba(255,255,255,.1); cursor: pointer;
    }

    /* ── iOS INSTRUCTION TOOLTIP ── */
    #pwa-ios-tip {
      position: fixed;
      bottom: 80px; left: 50%; transform: translateX(-50%) translateY(20px);
      z-index: 99999;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      padding: 16px 20px;
      max-width: 300px; width: calc(100vw - 40px);
      text-align: center;
      opacity: 0; pointer-events: none;
      transition: all .35s cubic-bezier(.4,0,.2,1);
      box-shadow: 0 20px 60px rgba(0,0,0,.6);
    }
    #pwa-ios-tip.visible {
      opacity: 1; pointer-events: all; transform: translateX(-50%) translateY(0);
    }
    #pwa-ios-tip::after {
      content: '';
      position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid #1a1a1a;
    }
    #pwa-ios-tip .ios-title {
      font-family: 'Cabinet Grotesk', sans-serif;
      font-size: 14px; font-weight: 800; color: #f0f0f0; margin-bottom: 8px;
    }
    #pwa-ios-tip .ios-steps {
      font-size: 12px; color: #888; line-height: 1.7; text-align: left;
    }
    #pwa-ios-tip .ios-steps b { color: #f0f0f0; }
    #pwa-ios-tip .ios-close {
      margin-top: 12px;
      padding: 8px 20px; border-radius: 100px;
      background: rgba(255,255,255,.08); color: #888;
      border: 1px solid rgba(255,255,255,.1);
      font-size: 12px; cursor: pointer;
    }

    /* ── UPDATE BANNER ── */
    #pwa-update-banner {
      position: fixed;
      top: 56px; left: 0; right: 0;
      z-index: 99998;
      background: linear-gradient(135deg, #052b17, #0a3d1f);
      border-bottom: 1px solid rgba(6,193,103,.25);
      padding: 10px 16px;
      display: flex; align-items: center; gap: 10px;
      transform: translateY(-100%);
      transition: transform .35s ease;
    }
    #pwa-update-banner.visible { transform: translateY(0); }
    #pwa-update-banner .upd-text {
      flex: 1; font-size: 13px; color: #f0f0f0; font-weight: 500;
    }
    #pwa-update-banner .upd-text span { color: #06C167; font-weight: 700; }
    #pwa-update-banner .upd-reload {
      padding: 7px 16px; border-radius: 100px;
      background: #06C167; color: #000;
      font-size: 12px; font-weight: 700; border: none; cursor: pointer;
    }
    #pwa-update-banner .upd-close {
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(255,255,255,.06); border: none;
      color: #888; font-size: 14px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── OFFLINE PILL ── */
    #pwa-offline-pill {
      position: fixed;
      top: 64px; left: 50%; transform: translateX(-50%) translateY(-80px);
      z-index: 99997;
      background: #1a1a1a;
      border: 1px solid rgba(255,75,75,.3);
      border-radius: 100px;
      padding: 8px 18px;
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: #fc6464; font-weight: 600;
      transition: transform .35s cubic-bezier(.4,0,.2,1);
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
      pointer-events: none;
    }
    #pwa-offline-pill.visible { transform: translateX(-50%) translateY(0); }
    #pwa-offline-pill::before {
      content: ''; width: 7px; height: 7px; border-radius: 50%;
      background: #FF4B4B; flex-shrink: 0;
      animation: offblink 1s infinite alternate;
    }
    @keyframes offblink { from{opacity:1} to{opacity:.3} }
  `;
  document.head.appendChild(style);

  // ── State ──────────────────────────────────────────────────────────────────
  let deferredInstallPrompt = null;
  let swRegistration = null;
  const DISMISSED_KEY = 'oau_pwa_install_dismissed';
  const DISMISSED_AT_KEY = 'oau_pwa_dismissed_at';
  const DISMISS_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days

  // ── Detect environment ─────────────────────────────────────────────────────
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  function wasDismissedRecently() {
    const at = parseInt(localStorage.getItem(DISMISSED_AT_KEY) || '0');
    return Date.now() - at < DISMISS_DURATION;
  }

  // ── Create install banner (Android / desktop) ──────────────────────────────
  function createInstallBanner() {
    if (isInStandaloneMode || wasDismissedRecently()) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-icon">🚌</div>
      <div class="pwa-text">
        <div class="pwa-title">Install OAU Transit</div>
        <div class="pwa-sub">Fast, offline-ready — works like a real app</div>
      </div>
      <div class="pwa-btns">
        <button class="pwa-btn-install" id="pwa-install-btn">Install</button>
        <button class="pwa-btn-dismiss" id="pwa-dismiss-btn">✕</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', triggerInstall);
    document.getElementById('pwa-dismiss-btn').addEventListener('click', dismissBanner);

    // Show after a short delay so it doesn't pop up before the page renders
    setTimeout(() => banner.classList.add('visible'), 1800);
    return banner;
  }

  // ── Create iOS install tip ─────────────────────────────────────────────────
  function createIOSTip() {
    if (isInStandaloneMode || wasDismissedRecently()) return;

    // First show a banner (same design, but no native prompt)
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-icon">🚌</div>
      <div class="pwa-text">
        <div class="pwa-title">Add to Home Screen</div>
        <div class="pwa-sub">Install OAU Transit for the full experience</div>
      </div>
      <div class="pwa-btns">
        <button class="pwa-btn-install" id="pwa-ios-show-btn">How?</button>
        <button class="pwa-btn-dismiss" id="pwa-dismiss-btn">✕</button>
      </div>
    `;
    document.body.appendChild(banner);

    // The tooltip with step-by-step
    const tip = document.createElement('div');
    tip.id = 'pwa-ios-tip';
    tip.innerHTML = `
      <div class="ios-title">Install on iPhone / iPad</div>
      <div class="ios-steps">
        1. Tap the <b>Share button</b> <b>⎙</b> at the bottom of Safari<br>
        2. Scroll down and tap <b>"Add to Home Screen"</b><br>
        3. Tap <b>"Add"</b> in the top-right corner<br>
        <br>
        <b>Note:</b> Must be opened in <b>Safari</b> (not Chrome or Firefox) for this to work.
      </div>
      <button class="ios-close" id="pwa-ios-close">Got it</button>
    `;
    document.body.appendChild(tip);

    document.getElementById('pwa-ios-show-btn').addEventListener('click', () => {
      tip.classList.add('visible');
    });
    document.getElementById('pwa-ios-close').addEventListener('click', () => {
      tip.classList.remove('visible');
    });
    document.getElementById('pwa-dismiss-btn').addEventListener('click', dismissBanner);

    setTimeout(() => banner.classList.add('visible'), 1800);
  }

  // ── Trigger native Android install prompt ──────────────────────────────────
  async function triggerInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome === 'accepted') {
      dismissBanner(true);
      console.log('[PWA] App installed!');
    }
  }

  function dismissBanner(installed = false) {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('visible');
    if (!installed) {
      localStorage.setItem(DISMISSED_AT_KEY, Date.now().toString());
    }
  }

  // ── Update notification banner ─────────────────────────────────────────────
  function showUpdateBanner(worker) {
    let banner = document.getElementById('pwa-update-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'pwa-update-banner';
      banner.innerHTML = `
        <div class="upd-text">🆕 <span>New version available</span> — reload to update</div>
        <button class="upd-reload" id="pwa-reload-btn">Reload</button>
        <button class="upd-close" id="pwa-upd-close">✕</button>
      `;
      document.body.appendChild(banner);

      document.getElementById('pwa-reload-btn').addEventListener('click', () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      });
      document.getElementById('pwa-upd-close').addEventListener('click', () => {
        banner.classList.remove('visible');
      });
    }
    setTimeout(() => banner.classList.add('visible'), 500);
  }

  // ── Offline / Online pill ─────────────────────────────────────────────────
  function createOfflinePill() {
    const pill = document.createElement('div');
    pill.id = 'pwa-offline-pill';
    pill.textContent = 'No connection — using cached data';
    document.body.appendChild(pill);
    return pill;
  }

  function handleConnectivity() {
    let pill = document.getElementById('pwa-offline-pill');
    if (!pill) pill = createOfflinePill();

    function update() {
      if (navigator.onLine) {
        pill.classList.remove('visible');
      } else {
        pill.classList.add('visible');
      }
    }

    window.addEventListener('online', () => {
      update();
      // Trigger background sync when back online
      if (swRegistration?.sync) {
        swRegistration.sync.register('sync-ride-requests').catch(() => {});
      }
    });
    window.addEventListener('offline', update);
    update(); // run once immediately
  }

  // ── Service Worker Registration ────────────────────────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service workers not supported');
      return;
    }

    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // always check for SW updates
      });

      console.log('[PWA] Service worker registered, scope:', swRegistration.scope);

      // Check for updates on page focus
      window.addEventListener('focus', () => {
        swRegistration.update().catch(() => {});
      });

      // Detect when a new SW is waiting
      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content available
            showUpdateBanner(newWorker);
          }
        });
      });

      // Handle controller change (after skipWaiting)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) { refreshing = true; window.location.reload(); }
      });

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'SYNC_REQUESTED') {
          // App-level sync — trigger if backend.js function exists
          if (typeof syncFromSupabase === 'function') syncFromSupabase();
        }
        if (event.data?.type === 'NOTIFICATION_CLICK') {
          const url = event.data.url;
          if (url && url !== window.location.pathname) window.location.href = url;
        }
      });

    } catch(e) {
      console.warn('[PWA] SW registration failed:', e);
    }
  }

  // ── beforeinstallprompt (Android Chrome) ─────────────────────────────────
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // stop mini-infobar
    deferredInstallPrompt = e;

    if (!isInStandaloneMode && !wasDismissedRecently()) {
      createInstallBanner();
    }
  });

  // ── appinstalled ──────────────────────────────────────────────────────────
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    dismissBanner(true);
    console.log('[PWA] OAU Transit installed successfully!');
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    registerSW();
    handleConnectivity();

    // iOS Safari: show tip if not installed and using Safari
    if (isIOS && isSafari && !isInStandaloneMode) {
      setTimeout(createIOSTip, 2000);
    }
  });

  // ── Expose install trigger for custom buttons ──────────────────────────────
  window.pwaInstall = triggerInstall;
  window.pwaShowIOSTip = () => {
    const tip = document.getElementById('pwa-ios-tip');
    if (tip) tip.classList.add('visible');
  };

})();
