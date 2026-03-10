import { useEffect, useRef, useState } from "react";

type LocalStorageWriteDetail = {
  key: string;
  prevRaw: string | null;
  nextRaw: string;
};

type LocalStorageApplyDetail = {
  key: string;
  raw: string | null;
};

export function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  const previousRawRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      previousRawRef.current = window.localStorage.getItem(key);
    } catch {
      previousRawRef.current = null;
    }
  }, [key]);

  useEffect(() => {
    let nextRaw = "";
    try {
      nextRaw = JSON.stringify(value);
      const prevRaw = previousRawRef.current;
      if (prevRaw !== nextRaw) {
        window.dispatchEvent(
          new CustomEvent<LocalStorageWriteDetail>("delphi-localstorage-write", {
            detail: { key, prevRaw, nextRaw },
          })
        );
      }
      window.localStorage.setItem(key, nextRaw);
      previousRawRef.current = nextRaw;
    } catch {
      // Ignore storage write failures.
    }
  }, [key, value]);

  useEffect(() => {
    const onApply = (event: Event) => {
      const detail = (event as CustomEvent<LocalStorageApplyDetail>).detail;
      if (!detail || detail.key !== key) return;
      try {
        if (!detail.raw) {
          setValue(initialValue);
          previousRawRef.current = null;
          return;
        }
        const parsed = JSON.parse(detail.raw) as T;
        setValue(parsed);
        previousRawRef.current = detail.raw;
      } catch {
        // Ignore parse failures from external apply operations.
      }
    };

    window.addEventListener("delphi-localstorage-apply", onApply as EventListener);
    return () => window.removeEventListener("delphi-localstorage-apply", onApply as EventListener);
  }, [initialValue, key]);

  return [value, setValue] as const;
}
