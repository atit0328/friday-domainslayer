import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Method Priority persistence logic.
 * We test the data shape, validation, and merge logic
 * without hitting the real database.
 */

// ─── Test the merge logic used by frontend ───
describe("Method Priority Merge Logic", () => {
  const DEFAULT_METHODS = [
    { id: "multipart", name: "Multipart POST", group: "standard", enabled: true, description: "Standard" },
    { id: "put_direct", name: "PUT Direct", group: "standard", enabled: true, description: "PUT" },
    { id: "gif_stego", name: "GIF Stego", group: "steganography", enabled: true, description: "GIF" },
    { id: "php_poly", name: "PHP Poly", group: "platform", enabled: true, description: "PHP" },
    { id: "asp_shell", name: "ASP Classic", group: "platform", enabled: true, description: "ASP" },
  ];

  function mergeConfig(
    defaults: typeof DEFAULT_METHODS,
    savedConfig: { id: string; enabled: boolean }[],
  ) {
    const savedMap = new Map(savedConfig.map(c => [c.id, c.enabled]));
    const savedOrder = savedConfig.map(c => c.id);
    return [...defaults].sort((a, b) => {
      const aIdx = savedOrder.indexOf(a.id);
      const bIdx = savedOrder.indexOf(b.id);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return 0;
    }).map(m => ({
      ...m,
      enabled: savedMap.has(m.id) ? savedMap.get(m.id)! : m.enabled,
    }));
  }

  it("should return defaults when no saved config", () => {
    const result = mergeConfig(DEFAULT_METHODS, []);
    expect(result).toEqual(DEFAULT_METHODS);
  });

  it("should apply saved enabled/disabled state", () => {
    const saved = [
      { id: "multipart", enabled: false },
      { id: "put_direct", enabled: true },
      { id: "gif_stego", enabled: false },
      { id: "php_poly", enabled: true },
      { id: "asp_shell", enabled: false },
    ];
    const result = mergeConfig(DEFAULT_METHODS, saved);
    expect(result.find(m => m.id === "multipart")!.enabled).toBe(false);
    expect(result.find(m => m.id === "gif_stego")!.enabled).toBe(false);
    expect(result.find(m => m.id === "asp_shell")!.enabled).toBe(false);
    expect(result.find(m => m.id === "put_direct")!.enabled).toBe(true);
  });

  it("should reorder methods based on saved order", () => {
    const saved = [
      { id: "asp_shell", enabled: true },
      { id: "gif_stego", enabled: true },
      { id: "multipart", enabled: true },
      { id: "php_poly", enabled: true },
      { id: "put_direct", enabled: true },
    ];
    const result = mergeConfig(DEFAULT_METHODS, saved);
    expect(result[0].id).toBe("asp_shell");
    expect(result[1].id).toBe("gif_stego");
    expect(result[2].id).toBe("multipart");
    expect(result[3].id).toBe("php_poly");
    expect(result[4].id).toBe("put_direct");
  });

  it("should preserve new methods not in saved config at the end", () => {
    // Saved config only has 3 of 5 methods
    const saved = [
      { id: "gif_stego", enabled: false },
      { id: "multipart", enabled: true },
      { id: "php_poly", enabled: true },
    ];
    const result = mergeConfig(DEFAULT_METHODS, saved);
    // Saved methods come first in saved order
    expect(result[0].id).toBe("gif_stego");
    expect(result[0].enabled).toBe(false);
    expect(result[1].id).toBe("multipart");
    expect(result[2].id).toBe("php_poly");
    // New methods (not in saved) come after, keeping their default enabled state
    const newMethods = result.slice(3);
    expect(newMethods.map(m => m.id)).toContain("put_direct");
    expect(newMethods.map(m => m.id)).toContain("asp_shell");
    // They should keep default enabled=true
    expect(newMethods.every(m => m.enabled)).toBe(true);
  });

  it("should handle partial saved config with disabled new methods", () => {
    const saved = [
      { id: "asp_shell", enabled: true },
    ];
    const result = mergeConfig(DEFAULT_METHODS, saved);
    expect(result[0].id).toBe("asp_shell");
    expect(result[0].enabled).toBe(true);
    // All other methods keep defaults
    expect(result.length).toBe(5);
  });
});

// ─── Test the data shape for save/load ───
describe("Method Priority Data Shape", () => {
  it("should produce correct enabledMethods from full config", () => {
    const config = [
      { id: "multipart", enabled: true },
      { id: "put_direct", enabled: false },
      { id: "gif_stego", enabled: true },
      { id: "php_poly", enabled: false },
    ];
    const enabledMethods = config.filter(m => m.enabled).map(m => m.id);
    expect(enabledMethods).toEqual(["multipart", "gif_stego"]);
  });

  it("should produce correct fullConfig from method priority state", () => {
    const methods = [
      { id: "multipart", name: "Multipart", group: "standard", enabled: true, description: "test" },
      { id: "put_direct", name: "PUT", group: "standard", enabled: false, description: "test" },
    ];
    const fullConfig = methods.map(m => ({ id: m.id, enabled: m.enabled }));
    expect(fullConfig).toEqual([
      { id: "multipart", enabled: true },
      { id: "put_direct", enabled: false },
    ]);
  });

  it("should handle empty config gracefully", () => {
    const config: { id: string; enabled: boolean }[] = [];
    const enabledMethods = config.filter(m => m.enabled).map(m => m.id);
    expect(enabledMethods).toEqual([]);
  });
});

// ─── Test the debounce behavior ───
describe("Method Priority Debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should debounce multiple rapid changes into one save", () => {
    const saveFn = vi.fn();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debouncedSave = (config: { id: string; enabled: boolean }[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveFn(config);
      }, 1500);
    };

    // Simulate rapid changes
    debouncedSave([{ id: "a", enabled: true }]);
    debouncedSave([{ id: "a", enabled: false }]);
    debouncedSave([{ id: "a", enabled: true }, { id: "b", enabled: true }]);

    // Before debounce timeout
    expect(saveFn).not.toHaveBeenCalled();

    // After debounce timeout
    vi.advanceTimersByTime(1500);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith([
      { id: "a", enabled: true },
      { id: "b", enabled: true },
    ]);

    vi.useRealTimers();
  });

  it("should not save if no changes happen after load", () => {
    const saveFn = vi.fn();
    // No debouncedSave calls
    vi.advanceTimersByTime(5000);
    expect(saveFn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
