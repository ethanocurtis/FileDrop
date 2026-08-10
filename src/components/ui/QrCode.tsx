"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#08090b", light: "#f4f5f7" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className="flex items-center justify-center rounded-xl border border-border bg-foreground/95 p-3 shadow-inner"
      style={{ width: size + 24, height: size + 24 }}
      aria-label="QR code for the share link"
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="QR code linking to this drop" width={size} height={size} />
      ) : (
        <div className="animate-pulse rounded-lg bg-border" style={{ width: size, height: size }} />
      )}
    </div>
  );
}
