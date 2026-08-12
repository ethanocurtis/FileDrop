"use client";

import { useEffect, useState } from "react";

/**
 * Best-effort clipboard copy the moment a value becomes available (e.g. a
 * freshly created share link), so there's one less click before pasting
 * it somewhere. The Clipboard API can fail silently depending on
 * browser/permission context — this never throws, it just reports
 * whether it actually worked so the caller can show a confirmation (or
 * not, and the user still has the manual copy button as a fallback).
 */
export function useAutoCopyOnMount(text: string): boolean {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        if (!cancelled) setCopied(true);
      })
      .catch(() => {
        // Permission denied, insecure context, etc. — the manual Copy
        // Link button still works regardless.
      });
    return () => {
      cancelled = true;
    };
    // Only ever want this to fire once, when the value first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return copied;
}
