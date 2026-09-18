'use client';

import { useCallback, useEffect, useState } from 'react';

export type InstallPlatform =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'android-other'
  | 'desktop-chromium'
  | 'desktop-other'
  | 'unknown';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'slipsy.install-prompt.dismissed-at';
const DISMISS_DAYS = 14;

export function detectPlatform(userAgent: string): InstallPlatform {
  const ua = userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);

  if (isIos) {
    // Every iOS browser uses WebKit, but only Safari's share sheet offers
    // "Add to Home Screen"; Chrome and Firefox on iOS hide it behind their own
    // menus. Those browsers identify themselves in the user agent, so absence
    // of their tokens means Safari — `navigator.vendor` is not relied on,
    // since it is spoofed or blank often enough to misroute real Safari users.
    const isOtherIosBrowser = /crios|fxios|edgios|opr\/|opt\/|yabrowser|duckduckgo/.test(ua);
    return isOtherIosBrowser ? 'ios-other' : 'ios-safari';
  }

  if (/android/.test(ua)) {
    return /chrome|chromium|samsungbrowser|edg/.test(ua) ? 'android-chrome' : 'android-other';
  }

  if (/chrome|chromium|edg/.test(ua) && !/opr\//.test(ua)) return 'desktop-chromium';
  if (/mozilla/.test(ua)) return 'desktop-other';
  return 'unknown';
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
}

export interface PwaInstallState {
  /** Null until the browser environment has been inspected on the client. */
  ready: boolean;
  platform: InstallPlatform;
  isInstalled: boolean;
  /** True when the browser exposed a real install prompt we can trigger. */
  canPrompt: boolean;
  /** True when we must show manual instructions instead (iOS and friends). */
  needsManualSteps: boolean;
  dismissed: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
  resetDismissal: () => void;
}

/**
 * Everything the UI needs to offer installation honestly:
 * a genuine browser prompt where one exists, and accurate per-platform
 * instructions where it does not.
 */
export function usePwaInstall(): PwaInstallState {
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>('unknown');
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent));
    setIsInstalled(isStandaloneDisplay());
    setReady(true);

    try {
      const raw = window.localStorage.getItem(DISMISSED_KEY);
      if (raw) {
        const at = Number(raw);
        setDismissed(Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86_400_000);
      }
    } catch {
      // Private browsing with storage blocked: treat as not dismissed.
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => setIsInstalled(isStandaloneDisplay());
    standaloneQuery.addEventListener('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standaloneQuery.removeEventListener('change', onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable' as const;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Ignored: dismissal simply will not persist.
    }
  }, []);

  const resetDismissal = useCallback(() => {
    setDismissed(false);
    try {
      window.localStorage.removeItem(DISMISSED_KEY);
    } catch {
      // Ignored.
    }
  }, []);

  const canPrompt = Boolean(deferredPrompt) && !isInstalled;
  const needsManualSteps = !isInstalled && !canPrompt && platform !== 'unknown';

  return { ready, platform, isInstalled, canPrompt, needsManualSteps, dismissed, promptInstall, dismiss, resetDismissal };
}
