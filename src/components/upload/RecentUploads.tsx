"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { deleteDrop, ApiError } from "@/lib/client/api";
import {
  getRecentUploads,
  removeRecentUpload,
  subscribeToRecentUploads,
  type RecentUpload,
} from "@/lib/client/recentUploads";
import { formatTimeRemaining, isNeverExpires } from "@/lib/utils/time";

/**
 * A small "recent uploads" panel, sourced entirely from this browser's
 * localStorage (see lib/client/recentUploads.ts) — only visible here,
 * never sent to the server. Exists mainly so Delete Now still works
 * after navigating away from the success screen, not just in the
 * moment right after uploading.
 */
export function RecentUploads() {
  const [entries, setEntries] = useState<RecentUpload[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setEntries(getRecentUploads());
    refresh();
    const unsubscribe = subscribeToRecentUploads(refresh);
    // Keeps "expires in X" labels current and prunes anything that's
    // expired since the last render, without needing a page reload.
    const interval = setInterval(refresh, 30_000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  if (entries.length === 0) return null;

  async function handleCopy(entry: RecentUpload) {
    try {
      await navigator.clipboard.writeText(entry.shareUrl);
      setCopiedId(entry.shareId);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Best-effort — no manual fallback button here, just fail quietly.
    }
  }

  async function handleDelete(entry: RecentUpload) {
    setBusyId(entry.shareId);
    setErrorId(null);
    try {
      await deleteDrop(entry.shareId, entry.deleteToken);
      removeRecentUpload(entry.shareId);
      setConfirmingId(null);
    } catch (err) {
      setErrorId(entry.shareId);
      setErrorMessage(err instanceof ApiError ? err.message : "Could not delete this drop.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mt-6 w-full p-4 sm:p-6 animate-fade-in">
      <h2 className="text-sm font-semibold text-foreground">Recent uploads</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Only visible in this browser — nothing here is tied to an account.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {entries.map((entry) => {
          const expiresAt = new Date(entry.expiresAt);
          const neverExpires = isNeverExpires(expiresAt);
          const timeRemaining = formatTimeRemaining(expiresAt);
          const isConfirming = confirmingId === entry.shareId;
          const isBusy = busyId === entry.shareId;

          return (
            <div
              key={entry.shareId}
              className="rounded-xl border border-border bg-background-elevated px-3.5 py-2.5 sm:px-4 sm:py-3"
            >
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.fileNames.length === 1
                      ? entry.fileNames[0]
                      : `${entry.fileNames[0]} +${entry.fileNames.length - 1} more`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {neverExpires ? "Never expires" : timeRemaining ? `Expires in ${timeRemaining}` : "Expired"}
                  </p>
                </div>

                {!isConfirming && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopy(entry)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground cursor-pointer"
                      aria-label="Copy link"
                    >
                      <Copy className={copiedId === entry.shareId ? "h-4 w-4 text-success" : "h-4 w-4"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(entry.shareId)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
                      aria-label="Delete now"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {isConfirming && (
                <div className="mt-3 animate-fade-in">
                  <p className="text-xs text-foreground">
                    Delete this drop now? The file and link stop working immediately — this
                    can&apos;t be undone.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(entry)}
                      disabled={isBusy}
                    >
                      {isBusy ? "Deleting…" : "Yes, Delete"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmingId(null)}
                      disabled={isBusy}
                    >
                      Cancel
                    </Button>
                  </div>
                  {errorId === entry.shareId && errorMessage && (
                    <p className="mt-2 text-xs text-danger">{errorMessage}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
