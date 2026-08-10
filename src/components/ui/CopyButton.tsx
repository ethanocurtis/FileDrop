"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for browsers/contexts without Clipboard API permission.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      type="button"
      variant={copied ? "secondary" : "primary"}
      onClick={handleCopy}
      className={clsx("relative overflow-hidden", className)}
    >
      <span
        className={clsx(
          "inline-flex items-center gap-2 transition-all duration-200",
          copied ? "scale-95 opacity-0" : "scale-100 opacity-100",
        )}
      >
        <Copy className="h-4 w-4" />
        Copy Link
      </span>
      <span
        className={clsx(
          "absolute inset-0 inline-flex items-center justify-center gap-2 text-success transition-all duration-200",
          copied ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <Check className="h-4 w-4 animate-pop" />
        Copied!
      </span>
    </Button>
  );
}
