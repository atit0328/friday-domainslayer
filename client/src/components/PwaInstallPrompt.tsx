/**
 * PWA Install Prompt
 * Shows a native-like install banner on mobile when the app is installable
 * Remembers dismissal for 7 days
 */
import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 7;

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    // On iOS, show the manual guide after a delay
    if (isIosDevice && !(navigator as any).standalone) {
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    // On Android/Chrome, listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration failed silently
      });
    }
  }, []);

  const handleInstall = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIosGuide(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Install Banner */}
      <div
        className="
          fixed bottom-16 lg:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm
          z-50 animate-slide-up
        "
      >
        <div className="bg-card/95 backdrop-blur-xl border border-emerald/20 rounded-2xl p-4 shadow-2xl shadow-emerald/5">
          <div className="flex items-start gap-3">
            {/* App icon */}
            <div className="w-12 h-12 rounded-xl bg-emerald/15 border border-emerald/30 flex items-center justify-center shrink-0">
              <span className="font-mono font-bold text-emerald text-lg">F</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">ติดตั้ง FridayAI</h3>
                <button
                  onClick={handleDismiss}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors -mr-1 -mt-1"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                เพิ่มลงหน้าจอหลักเพื่อเข้าถึงได้เร็วขึ้น
              </p>
              <button
                onClick={handleInstall}
                className="
                  mt-2.5 w-full flex items-center justify-center gap-2
                  bg-emerald hover:bg-emerald/90 active:bg-emerald/80
                  text-white font-medium text-sm
                  rounded-xl py-2.5 px-4
                  transition-all duration-200
                "
              >
                <Download className="w-4 h-4" />
                {isIos ? "วิธีติดตั้ง" : "ติดตั้งแอป"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Installation Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDismiss} />
          <div className="relative bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-sm mx-0 sm:mx-4 animate-slide-up">
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted/50"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-bold text-lg mb-4">ติดตั้งบน iPhone/iPad</h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald/15 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-emerald font-bold text-xs">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium">กดปุ่ม Share</p>
                  <p className="text-xs text-muted-foreground">กดไอคอน <span className="inline-block w-4 h-4 align-text-bottom">⬆️</span> ที่แถบด้านล่าง Safari</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald/15 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-emerald font-bold text-xs">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium">เลือก "Add to Home Screen"</p>
                  <p className="text-xs text-muted-foreground">เลื่อนลงในเมนู Share แล้วกด "เพิ่มไปยังหน้าจอโฮม"</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald/15 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-emerald font-bold text-xs">3</span>
                </div>
                <div>
                  <p className="text-sm font-medium">กด "Add"</p>
                  <p className="text-xs text-muted-foreground">ยืนยันการเพิ่มแอปลงหน้าจอหลัก</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="mt-5 w-full py-2.5 bg-muted hover:bg-muted/80 rounded-xl text-sm font-medium transition-colors"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </>
  );
}
