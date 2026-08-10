"use client";

import { useEffect, useState } from "react";
import { PasswordGate } from "@/components/download/PasswordGate";
import { DownloadCard, type DownloadableFile } from "@/components/download/DownloadCard";
import { ExpiredState } from "@/components/download/ExpiredState";
import { unlockDrop, downloadFile, ApiError } from "@/lib/client/api";
import { formatTimeRemaining } from "@/lib/utils/time";
import type { PublicFileMetadata } from "@/types/drop";

export interface DownloadViewInitialData {
  shareId: string;
  requiresPassword: boolean;
  expiresAt: string;
  burnAfterRead: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  files: PublicFileMetadata[] | null;
}

export function DownloadView({ initial }: { initial: DownloadViewInitialData }) {
  const [unlocked, setUnlocked] = useState(!initial.requiresPassword);
  const [token, setToken] = useState<string | null>(null);
  const [files, setFiles] = useState<DownloadableFile[] | null>(
    initial.files ? initial.files.map((f) => ({ ...f, state: "idle" as const })) : null,
  );
  const [downloadCount, setDownloadCount] = useState(initial.downloadCount);
  const [gone, setGone] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(() =>
    formatTimeRemaining(new Date(initial.expiresAt)),
  );

  const expiresAt = new Date(initial.expiresAt);

  // Tick the "expires in" label and flip to the expired state client-side
  // the moment the deadline passes, without waiting on a server round trip.
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = formatTimeRemaining(expiresAt);
      setTimeRemaining(remaining);
      if (remaining === null) setGone(true);
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.expiresAt]);

  async function handleUnlock(password: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const result = await unlockDrop(initial.shareId, password);
      setToken(result.token);
      setFiles((result.files ?? []).map((f) => ({ ...f, state: "idle" as const })));
      setDownloadCount(result.downloadCount);
      setUnlocked(true);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      return { ok: false, message };
    }
  }

  async function handleDownload(fileId: string) {
    if (!files) return;
    setFiles((prev) => prev?.map((f) => (f.fileId === fileId ? { ...f, state: "downloading" } : f)) ?? null);

    const file = files.find((f) => f.fileId === fileId);
    try {
      await downloadFile(initial.shareId, fileId, file?.name ?? "download", token);
      setFiles((prev) => prev?.map((f) => (f.fileId === fileId ? { ...f, state: "done" } : f)) ?? null);

      const nextCount = downloadCount + 1;
      setDownloadCount(nextCount);
      const limitHit = initial.maxDownloads !== null && nextCount >= initial.maxDownloads;
      if (initial.burnAfterRead || limitHit) {
        setGone(true);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Download failed. Please try again.";
      setFiles(
        (prev) =>
          prev?.map((f) => (f.fileId === fileId ? { ...f, state: "error", errorMessage: message } : f)) ??
          null,
      );
      if (err instanceof ApiError && (err.code === "EXPIRED" || err.code === "DOWNLOAD_LIMIT_REACHED" || err.code === "NOT_FOUND")) {
        setGone(true);
      }
    }
  }

  if (gone) {
    return <ExpiredState />;
  }

  if (!unlocked) {
    return <PasswordGate onSubmit={handleUnlock} />;
  }

  if (!files || files.length === 0) {
    return <ExpiredState />;
  }

  return <DownloadCard files={files} timeRemaining={timeRemaining} onDownload={handleDownload} />;
}
