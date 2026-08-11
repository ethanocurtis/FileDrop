"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { ReviewStep } from "@/components/upload/ReviewStep";
import { type DropOptions } from "@/components/upload/OptionsPanel";
import { FileQueueItem, type FileQueueEntry } from "@/components/upload/FileQueueItem";
import { UploadSuccess, type UploadedFileSummary } from "@/components/upload/UploadSuccess";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createDrop, uploadFileContent, cancelUploadSession, ApiError } from "@/lib/client/api";
import { DEFAULT_EXPIRATION, type ExpirationValue } from "@/lib/utils/time";
import { formatBytes } from "@/lib/utils/bytes";
import type { CreateDropResponseFile } from "@/types/drop";

const MAX_FILE_COUNT = 10;
// Keep in sync with the server default (MAX_UPLOAD_SIZE_BYTES); this is
// only a fast client-side check for a friendlier error message — the
// server enforces the real limit regardless.
const CLIENT_SIZE_HINT_BYTES = 5 * 1024 * 1024 * 1024;

type Phase = "idle" | "reviewing" | "uploading" | "success";

interface ActiveUpload {
  key: string;
  uploadUrl: string;
  cancel: () => void;
}

export function UploadFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [entries, setEntries] = useState<FileQueueEntry[]>([]);
  const [expiration, setExpiration] = useState<ExpirationValue>(DEFAULT_EXPIRATION);
  const [options, setOptions] = useState<DropOptions>({
    password: "",
    maxDownloads: null,
    burnAfterRead: false,
  });
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    files: UploadedFileSummary[];
    expiresAt: Date;
    shareUrl: string;
    shareId: string;
    deleteToken: string;
    expirationClamped: boolean;
  } | null>(null);

  const activeUploads = useRef<Map<string, ActiveUpload>>(new Map());

  const updateEntry = useCallback((key: string, patch: Partial<FileQueueEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }, []);

  // Selecting files just stages them for review — nothing is created or
  // uploaded until the user confirms, so expiration/password/download
  // limit/burn-after-read can still be set (or changed) at this point.
  const handleFilesSelected = useCallback((files: File[]) => {
    setGlobalError(null);

    if (files.length > MAX_FILE_COUNT) {
      setGlobalError(`You can upload up to ${MAX_FILE_COUNT} files at once.`);
      return;
    }
    const oversized = files.find((f) => f.size > CLIENT_SIZE_HINT_BYTES);
    if (oversized) {
      setGlobalError(`"${oversized.name}" is too large (${formatBytes(oversized.size)}).`);
      return;
    }
    const empty = files.find((f) => f.size === 0);
    if (empty) {
      setGlobalError(`"${empty.name}" is empty.`);
      return;
    }

    setPendingFiles(files);
    setPhase("reviewing");
  }, []);

  const handleRemovePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setPhase("idle");
      return next;
    });
  }, []);

  const handleCancelReview = useCallback(() => {
    setPendingFiles([]);
    setGlobalError(null);
    setPhase("idle");
  }, []);

  const handleStartUpload = useCallback(async () => {
    const files = pendingFiles;
    if (files.length === 0) return;

    setGlobalError(null);

    const newEntries: FileQueueEntry[] = files.map((file) => ({
      key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      progress: 0,
      status: "queued",
    }));
    setEntries(newEntries);
    setPhase("uploading");

    let created;
    try {
      created = await createDrop({
        files: files.map((f) => ({ name: f.name, size: f.size, mimeType: f.type })),
        expiration,
        password: options.password || undefined,
        maxDownloads: options.maxDownloads,
        burnAfterRead: options.burnAfterRead,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not start the upload.";
      setGlobalError(message);
      setPhase("idle");
      setEntries([]);
      setPendingFiles([]);
      return;
    }

    const results = await Promise.allSettled(
      newEntries.map((entry, i) => {
        const target = created.files[i];
        updateEntry(entry.key, { status: "uploading" });
        const { promise, cancel } = uploadFileContent(target.uploadUrl, entry.file, {
          onProgress: (p) => {
            updateEntry(entry.key, { progress: Math.round((p.loaded / p.total) * 100) });
          },
        });
        activeUploads.current.set(entry.key, { key: entry.key, uploadUrl: target.uploadUrl, cancel });
        return promise
          .then((res) => {
            updateEntry(entry.key, { status: "done", progress: 100 });
            return { entry, target, ...res };
          })
          .catch((err) => {
            const cancelled = err instanceof ApiError && err.code === "CANCELLED";
            updateEntry(entry.key, {
              status: cancelled ? "cancelled" : "error",
              error: cancelled ? undefined : err instanceof ApiError ? err.message : "Upload failed.",
            });
            throw err;
          })
          .finally(() => {
            activeUploads.current.delete(entry.key);
          });
      }),
    );

    const succeeded = results.filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        entry: FileQueueEntry;
        target: CreateDropResponseFile;
        size: number;
        mimeType: string;
      }> => r.status === "fulfilled",
    );

    if (succeeded.length === 0) {
      setGlobalError("All uploads failed. You can retry below.");
      return;
    }

    setPendingFiles([]);
    setSuccessData({
      shareUrl: created.shareUrl,
      shareId: created.shareId,
      deleteToken: created.deleteToken,
      expirationClamped: created.expirationClamped,
      expiresAt: new Date(created.expiresAt),
      files: succeeded.map((r) => ({
        name: r.value.target.name,
        size: r.value.size,
        mimeType: r.value.mimeType,
      })),
    });
    setPhase("success");
  }, [pendingFiles, expiration, options, updateEntry]);

  const handleCancel = useCallback(
    (key: string) => {
      const active = activeUploads.current.get(key);
      active?.cancel();
      updateEntry(key, { status: "cancelled" });
      if (active) void cancelUploadSession(active.uploadUrl);
    },
    [updateEntry],
  );

  const handleReset = useCallback(() => {
    for (const upload of activeUploads.current.values()) upload.cancel();
    activeUploads.current.clear();
    setPendingFiles([]);
    setEntries([]);
    setSuccessData(null);
    setGlobalError(null);
    setPhase("idle");
  }, []);

  const handleRetry = useCallback(() => {
    setEntries([]);
    setGlobalError(null);
    setPhase("idle");
  }, []);

  if (phase === "success" && successData) {
    return (
      <UploadSuccess
        files={successData.files}
        expiresAt={successData.expiresAt}
        shareUrl={successData.shareUrl}
        shareId={successData.shareId}
        deleteToken={successData.deleteToken}
        expirationClamped={successData.expirationClamped}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="w-full">
      {phase === "idle" && <UploadDropzone onFilesSelected={handleFilesSelected} />}

      {phase === "reviewing" && (
        <ReviewStep
          files={pendingFiles}
          onRemoveFile={handleRemovePendingFile}
          expiration={expiration}
          onExpirationChange={setExpiration}
          options={options}
          onOptionsChange={setOptions}
          onUpload={handleStartUpload}
          onCancel={handleCancelReview}
        />
      )}

      {phase === "uploading" && (
        <Card className="w-full p-6 sm:p-8 animate-fade-in">
          <h2 className="text-base font-semibold text-foreground">Uploading…</h2>
          <div className="mt-4 grid gap-2">
            {entries.map((entry) => (
              <FileQueueItem key={entry.key} entry={entry} onCancel={handleCancel} />
            ))}
          </div>
        </Card>
      )}

      {globalError && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-fade-in">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{globalError}</div>
          {phase !== "idle" && (
            <Button variant="secondary" size="sm" onClick={handleRetry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
