/**
 * Lightweight zustand-like store using useSyncExternalStore
 */
import { useSyncExternalStore } from "react";

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
type StoreCreator<T> = (set: SetState<T>) => T;

export function create<T>(creator: StoreCreator<T>): () => T {
  let state: T;
  const listeners = new Set<() => void>();

  const set: SetState<T> = (partial) => {
    const nextPartial = typeof partial === "function" ? (partial as (s: T) => Partial<T>)(state) : partial;
    state = { ...state, ...nextPartial };
    listeners.forEach((l) => l());
  };

  state = creator(set);

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getSnapshot = () => state;

  return () => useSyncExternalStore(subscribe, getSnapshot);
}
