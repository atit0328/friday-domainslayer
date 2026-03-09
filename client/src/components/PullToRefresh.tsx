/**
 * Pull-to-Refresh Component
 * Touch gesture: pull down from top to trigger refresh
 * Shows spinner animation during refresh
 * Only activates when page is scrolled to top
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  /** Minimum pull distance in px to trigger refresh */
  threshold?: number;
  /** Maximum pull distance in px */
  maxPull?: number;
}

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  maxPull = 140,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const canPull = useCallback(() => {
    // Only allow pull when scrolled to top
    return window.scrollY <= 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing) return;
      if (!canPull()) return;
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = e.touches[0].clientY;
      setIsPulling(true);
    },
    [isRefreshing, canPull]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;
      currentYRef.current = e.touches[0].clientY;
      const diff = currentYRef.current - startYRef.current;

      if (diff > 0 && canPull()) {
        // Apply resistance — the further you pull, the harder it gets
        const resistance = Math.min(diff * 0.5, maxPull);
        setPullDistance(resistance);

        // Prevent default scroll when pulling
        if (diff > 10) {
          e.preventDefault();
        }
      } else {
        setPullDistance(0);
      }
    },
    [isPulling, isRefreshing, canPull, maxPull]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    setIsPulling(false);

    if (pullDistance >= threshold && !isRefreshing) {
      // Trigger refresh
      setIsRefreshing(true);
      setPullDistance(60); // Hold at spinner position
      try {
        await onRefresh();
      } catch {
        // silently handle
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      // Snap back
      setPullDistance(0);
    }
  }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use passive: false for touchmove to allow preventDefault
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = pullDistance * 3; // Spin the icon as user pulls

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 lg:hidden"
        style={{
          height: pullDistance > 0 ? `${pullDistance}px` : "0px",
          opacity: pullDistance > 10 ? 1 : 0,
          transition: isPulling ? "none" : "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className={`
            flex items-center justify-center
            w-10 h-10 rounded-full
            ${isRefreshing
              ? "bg-emerald/20 border-2 border-emerald/40"
              : progress >= 1
                ? "bg-emerald/15 border-2 border-emerald/30"
                : "bg-muted/30 border-2 border-border/50"
            }
            transition-colors duration-200
          `}
        >
          <RefreshCw
            className={`w-5 h-5 transition-colors duration-200 ${
              isRefreshing
                ? "text-emerald animate-spin"
                : progress >= 1
                  ? "text-emerald"
                  : "text-muted-foreground"
            }`}
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
            }}
          />
        </div>
      </div>

      {/* Pull hint text */}
      {pullDistance > 20 && !isRefreshing && (
        <div
          className="text-center text-xs text-muted-foreground pb-1 lg:hidden transition-opacity"
          style={{ opacity: Math.min((pullDistance - 20) / 30, 1) }}
        >
          {progress >= 1 ? "ปล่อยเพื่อรีเฟรช" : "ดึงลงเพื่อรีเฟรช"}
        </div>
      )}

      {isRefreshing && (
        <div className="text-center text-xs text-emerald pb-2 lg:hidden">
          กำลังรีเฟรช...
        </div>
      )}

      {/* Content */}
      {children}
    </div>
  );
}
