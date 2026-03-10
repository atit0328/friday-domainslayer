import { lazy, ComponentType } from "react";

/**
 * Wraps React.lazy() with automatic retry logic for failed dynamic imports.
 * 
 * When a new version is deployed, old chunk hashes become invalid.
 * This utility catches the "Failed to fetch dynamically imported module" error
 * and retries by forcing a page reload (once) to get fresh chunk references.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 2,
  interval = 1000
): React.LazyExoticComponent<T> {
  return lazy(() => retryImport(importFn, retries, interval));
}

async function retryImport<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries: number,
  interval: number
): Promise<{ default: T }> {
  try {
    return await importFn();
  } catch (error: any) {
    const isChunkError = 
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("Loading CSS chunk") ||
      error?.name === "ChunkLoadError";

    if (isChunkError && retries > 0) {
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, interval));
      
      // On last retry, force a full page reload to get fresh asset manifest
      if (retries === 1) {
        const hasReloaded = sessionStorage.getItem("chunk_reload");
        if (!hasReloaded) {
          sessionStorage.setItem("chunk_reload", "1");
          window.location.reload();
          // Return a never-resolving promise since we're reloading
          return new Promise(() => {});
        }
        // Already reloaded once, clear flag and let error propagate
        sessionStorage.removeItem("chunk_reload");
      }

      return retryImport(importFn, retries - 1, interval);
    }

    // Clear the reload flag on non-chunk errors
    sessionStorage.removeItem("chunk_reload");
    throw error;
  }
}
