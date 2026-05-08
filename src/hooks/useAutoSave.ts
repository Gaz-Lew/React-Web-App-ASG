/**
 * useAutoSave — Generic auto-save hook with debounce
 *
 * Usage:
 *   const { value, setValue, status, triggerSave } = useAutoSave(
 *     initialValue,
 *     async (val) => { await saveToFirestore(val); },
 *     { debounceMs: 1500 }
 *   );
 *
 * Status: "idle" | "saving" | "saved" | "error"
 */

import { useState, useRef, useCallback, useEffect } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseAutoSaveOptions {
  /** Milliseconds to wait after last change before saving (default: 1500) */
  debounceMs?: number;
  /** Called on successful save */
  onSuccess?: () => void;
  /** Called on save error */
  onError?: (err: unknown) => void;
}

export interface UseAutoSaveReturn<T> {
  /** Current value — bind to your input */
  value: T;
  /** Update value — triggers auto-save debounce */
  setValue: (v: T) => void;
  /** Current save status for UI indicator */
  status: AutoSaveStatus;
  /** Force an immediate save */
  triggerSave: () => Promise<boolean>;
  /** Clear the debounce timer (e.g. on unmount or discard) */
  cancel: () => void;
}

export function useAutoSave<T>(
  initialValue: T,
  onSave: (value: T) => Promise<void>,
  options: UseAutoSaveOptions = {},
): UseAutoSaveReturn<T> {
  const { debounceMs = 1500, onSuccess, onError } = options;

  const [value, setValueState] = useState<T>(initialValue);
  const [status, setStatus] = useState<AutoSaveStatus>("idle");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  const onSaveRef = useRef(onSave);

  // Keep refs current
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const doSave = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus("saving");
    try {
      await onSaveRef.current(valueRef.current);
      setStatus("saved");
      onSuccess?.();
      // Reset to idle after a brief "Saved" flash
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      return true;
    } catch (err) {
      setStatus("error");
      onError?.(err);
      setTimeout(() => setStatus("idle"), 3000);
      return false;
    }
  }, [onSuccess, onError]);

  const setValue = useCallback(
    (v: T) => {
      setValueState(v);
      setStatus("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void doSave();
      }, debounceMs);
    },
    [debounceMs, doSave],
  );

  const triggerSave = useCallback(async (): Promise<boolean> => {
    return doSave();
  }, [doSave]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus("idle");
  }, []);

  return { value, setValue, status, triggerSave, cancel };
}
