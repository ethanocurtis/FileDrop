"use client";

import { useState } from "react";
import { AlertCircle, Check, Info, Infinity as InfinityIcon, RotateCcw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { QrCode } from "@/components/ui/QrCode";
import { FileIcon } from "@/components/ui/FileIcon";
import { deleteDrop, ApiError } from "@/lib/client/api";
import { useAutoCopyOnMount } from "@/lib/client/clipboard";
import { removeRecentUpload } from "@/lib/client/recentUploads";
import { formatBytes } from "@/lib/utils/bytes";
import { formatAbsolute, isNeverExpires } from "@/lib/utils/time";

export interface UploadedFileSummary {
  name: string;
  size: number;
  mimeType: string;
}

export function UploadSuccess({
  files,
  expiresAt,
  shareUrl,
  shareId,
  deleteToken,
  expirationClamped,
  onReset,
}: {
  files: UploadedFileSummary[];
  expiresAt: Date;
  shareUrl: string;
  shareId: string;
  deleteToken: string;
  expirationClamped: boolean;
  onReset: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const autoCopied = useAutoCopyOnMount(shareUrl);
  const neverExpires = isNeverExpires(expiresAt);

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDrop(shareId, deleteToken);
      removeRecentUpload(shareId);
      setDeleted(true);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete this drop.");
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <Card className="w-full p-6 sm:p-8 text-center animate-fade-in">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/15 text-danger">
          <Trash2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Drop deleted</h2>
        <p className="mt-1 text-sm text-muted">The file and link are no longer available.</p>
        <Button variant="secondary" onClick={onReset} className="mt-6 w-full">
          <RotateCcw className="h-4 w-4" />
          Upload Another File
        </Button>
      </Card>
    );
  }

  return (
    <Card className="w-full p-6 sm:p-8 animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success animate-pop">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
            <path
              d="M20 6L9 17l-5-5"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Your drop is ready</h2>
        <p className="mt-1 text-sm text-muted">Share this link — it expires automatically.</p>
      </div>

      <div className="mt-6 grid gap-2">
        {files.map((file, i) => (
          <div
            key={`${file.name}-${i}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3"
          >
            <FileIcon mimeType={file.mimeType} className="h-6 w-6 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shareable link
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background-elevated px-3 py-2.5 font-mono text-sm text-foreground">
              {shareUrl}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {neverExpires ? (
              <span className="inline-flex items-center gap-1 text-accent-strong">
                <InfinityIcon className="h-3.5 w-3.5" /> Never expires
              </span>
            ) : (
              <>
                Expires <span className="text-muted">{formatAbsolute(expiresAt)}</span>
              </>
            )}
          </p>
          {expirationClamped && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Large files get a shorter expiration automatically, so this link expires sooner
              than what you picked.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <CopyButton value={shareUrl} className="flex-1 sm:flex-none" />
          </div>
          {autoCopied && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-success animate-fade-in">
              <Check className="h-3.5 w-3.5" /> Already copied to your clipboard
            </p>
          )}
        </div>

        <QrCode value={shareUrl} size={132} />
      </div>

      <div className="mt-8 border-t border-border pt-6">
        {confirmingDelete ? (
          <div className="animate-fade-in">
            <p className="text-sm text-foreground">
              Delete this drop now? The file and link stop working immediately — this can&apos;t
              be undone.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row-reverse">
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1"
              >
                {deleting ? "Deleting…" : "Yes, Delete It"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
            {deleteError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {deleteError}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button variant="secondary" onClick={onReset} className="flex-1">
              <RotateCcw className="h-4 w-4" />
              Upload Another File
            </Button>
            <Button variant="danger" onClick={() => setConfirmingDelete(true)} className="flex-1">
              <Trash2 className="h-4 w-4" />
              Delete Now
            </Button>
          </div>
        )}
      </div>

      {!neverExpires && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Files are automatically deleted after expiration.
        </p>
      )}
    </Card>
  );
}
