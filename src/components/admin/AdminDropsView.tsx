"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Copy, Flame, Infinity as InfinityIcon, Lock, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { useAdminSession } from "@/lib/client/adminSession";
import { adminDeleteDropByShareId, adminListDrops, ApiError } from "@/lib/client/api";
import { formatBytes } from "@/lib/utils/bytes";
import { formatAbsolute, isNeverExpires } from "@/lib/utils/time";
import type { AdminDropSummary } from "@/types/drop";

/**
 * The real fix for "how do I get rid of a never-expiring drop if I've
 * lost the browser that made it" — a server-side list, gated by the
 * same admin session as the upload checkbox, completely independent of
 * any one browser's Recent Uploads / localStorage. See "Admin uploads"
 * in the README.
 */
export function AdminDropsView() {
  const { isAdmin, token } = useAdminSession();
  const [drops, setDrops] = useState<AdminDropSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !token) return;
    let cancelled = false;
    adminListDrops(token)
      .then((res) => {
        if (!cancelled) setDrops(res.drops);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Could not load uploads.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  if (!isAdmin) {
    return <AdminLoginForm redirectTo="/admin/drops" />;
  }

  async function handleCopy(drop: AdminDropSummary) {
    const url = `${window.location.origin}/f/${drop.shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(drop.shareId);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Best-effort, same as Recent Uploads.
    }
  }

  async function handleDelete(shareId: string) {
    if (!token) return;
    setBusyId(shareId);
    setRowError(null);
    try {
      await adminDeleteDropByShareId(shareId, token);
      setDrops((prev) => prev?.filter((d) => d.shareId !== shareId) ?? null);
      setConfirmingId(null);
    } catch (err) {
      setRowError({
        id: shareId,
        message: err instanceof ApiError ? err.message : "Could not delete this drop.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="w-full max-w-2xl p-6 sm:p-8 animate-fade-in">
      <h1 className="text-xl font-semibold text-foreground">Manage uploads</h1>
      <p className="mt-1 text-sm text-muted">
        Every drop currently on the server, regardless of which browser created it.
      </p>

      {loadError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {drops === null && !loadError && (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      )}

      {drops !== null && drops.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No uploads on the server right now.</p>
      )}

      {drops !== null && drops.length > 0 && (
        <div className="mt-6 grid gap-2">
          {drops.map((drop) => {
            const expiresAt = new Date(drop.expiresAt);
            const neverExpires = isNeverExpires(expiresAt);
            const isConfirming = confirmingId === drop.shareId;
            const isBusy = busyId === drop.shareId;
            const totalSize = drop.files.reduce((sum, f) => sum + BigInt(f.size), BigInt(0));

            return (
              <div
                key={drop.shareId}
                className="rounded-xl border border-border bg-background-elevated px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {drop.files.length === 1
                        ? drop.files[0].name
                        : drop.files.length === 0
                          ? "(no files)"
                          : `${drop.files[0].name} +${drop.files.length - 1} more`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(totalSize)} · Uploaded{" "}
                      {formatAbsolute(new Date(drop.createdAt))}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className={neverExpires ? "inline-flex items-center gap-1 text-accent-strong" : undefined}>
                        {neverExpires ? (
                          <>
                            <InfinityIcon className="h-3 w-3" /> Never expires
                          </>
                        ) : drop.status === "EXPIRED" ? (
                          "Expired"
                        ) : (
                          `Expires ${formatAbsolute(expiresAt)}`
                        )}
                      </span>
                      {drop.requiresPassword && (
                        <span className="inline-flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Password
                        </span>
                      )}
                      {drop.burnAfterRead && (
                        <span className="inline-flex items-center gap-1">
                          <Flame className="h-3 w-3 text-warning" /> Burn after read
                        </span>
                      )}
                      <span>
                        {drop.downloadCount}
                        {drop.maxDownloads !== null ? `/${drop.maxDownloads}` : ""} downloads
                      </span>
                    </p>
                  </div>

                  {!isConfirming && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(drop)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground cursor-pointer"
                        aria-label="Copy link"
                      >
                        <Copy className={copiedId === drop.shareId ? "h-4 w-4 text-success" : "h-4 w-4"} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(drop.shareId)}
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
                        onClick={() => handleDelete(drop.shareId)}
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
                    {rowError?.id === drop.shareId && (
                      <p className="mt-2 text-xs text-danger">{rowError.message}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
