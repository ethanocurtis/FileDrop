"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, RotateCcw, Wifi } from "lucide-react";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { P2pReviewStep } from "@/components/p2p/P2pReviewStep";
import { P2pStatusPanel } from "@/components/p2p/P2pStatusPanel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { QrCode } from "@/components/ui/QrCode";
import { createP2pTransfer } from "@/lib/p2p/client/api";
import { ApiError } from "@/lib/client/api";
import { useAutoCopyOnMount } from "@/lib/client/clipboard";
import { startP2pSender, type P2pSession, type P2pStatus } from "@/lib/p2p/client/webrtc";
import { useTransferSpeed } from "@/lib/p2p/client/useTransferSpeed";
import { DEFAULT_EXPIRATION, formatAbsolute, type ExpirationValue } from "@/lib/utils/time";

type Phase = "idle" | "reviewing" | "active";

export function P2pSendFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [expiration, setExpiration] = useState<ExpirationValue>(DEFAULT_EXPIRATION);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<P2pStatus>("connecting-signal");
  const [progress, setProgress] = useState<{ transferred: number; total: number } | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const speed = useTransferSpeed(progress?.transferred ?? 0, status === "transferring");

  const sessionRef = useRef<P2pSession | null>(null);

  useEffect(() => () => sessionRef.current?.cancel(), []);

  // Warn before leaving the tab while a transfer is in flight — closing it
  // ends the connection outright, since the file exists only on this
  // browser's side, never on the server.
  useEffect(() => {
    if (phase !== "active" || status === "done") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase, status]);

  const handleFilesSelected = useCallback((files: File[]) => {
    setGlobalError(null);
    if (files.length > 1) {
      setGlobalError("Peer-to-peer transfers support one file at a time — the first file was kept.");
    }
    const [selected] = files;
    if (!selected) return;
    if (selected.size === 0) {
      setGlobalError(`"${selected.name}" is empty.`);
      return;
    }
    setFile(selected);
    setPhase("reviewing");
  }, []);

  const handleCancelReview = useCallback(() => {
    setFile(null);
    setGlobalError(null);
    setPhase("idle");
  }, []);

  const handleStart = useCallback(async () => {
    if (!file) return;
    setSubmitting(true);
    setGlobalError(null);

    try {
      const created = await createP2pTransfer({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        expiration,
        password: password || undefined,
      });

      setShareUrl(created.shareUrl);
      setExpiresAt(new Date(created.expiresAt));
      setStatus("connecting-signal");
      setProgress(null);
      setTransferError(null);
      setPhase("active");

      sessionRef.current = startP2pSender({
        shareId: created.shareId,
        token: created.token,
        file,
        onStatus: setStatus,
        onProgress: (transferred, total) => setProgress({ transferred, total }),
        onError: setTransferError,
      });
    } catch (err) {
      setGlobalError(err instanceof ApiError ? err.message : "Could not create the transfer link.");
    } finally {
      setSubmitting(false);
    }
  }, [file, expiration, password]);

  const handleReset = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setFile(null);
    setPassword("");
    setShareUrl(null);
    setExpiresAt(null);
    setProgress(null);
    setTransferError(null);
    setGlobalError(null);
    setPhase("idle");
  }, []);

  if (phase === "active" && shareUrl && expiresAt) {
    return (
      <P2pActiveShare
        shareUrl={shareUrl}
        expiresAt={expiresAt}
        status={status}
        progress={progress}
        speed={speed}
        transferError={transferError}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="w-full">
      {phase === "idle" && <UploadDropzone onFilesSelected={handleFilesSelected} />}

      {phase === "reviewing" && file && (
        <P2pReviewStep
          file={file}
          onRemoveFile={() => {
            setFile(null);
            setPhase("idle");
          }}
          expiration={expiration}
          onExpirationChange={setExpiration}
          password={password}
          onPasswordChange={setPassword}
          onStart={handleStart}
          onCancel={handleCancelReview}
        />
      )}

      {submitting && (
        <p className="mt-4 text-center text-sm text-muted">Creating transfer link…</p>
      )}

      {globalError && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-fade-in">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{globalError}</div>
        </div>
      )}
    </div>
  );
}

/**
 * A separate component (rather than an inline branch in P2pSendFlow) so
 * it actually mounts fresh once a real shareUrl exists — that's what lets
 * useAutoCopyOnMount fire at the right moment instead of on
 * P2pSendFlow's own initial mount, before there's a link yet.
 */
function P2pActiveShare({
  shareUrl,
  expiresAt,
  status,
  progress,
  speed,
  transferError,
  onReset,
}: {
  shareUrl: string;
  expiresAt: Date;
  status: P2pStatus;
  progress: { transferred: number; total: number } | null;
  speed: number;
  transferError: string | null;
  onReset: () => void;
}) {
  const autoCopied = useAutoCopyOnMount(shareUrl);

  return (
    <Card className="w-full p-6 sm:p-8 animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-strong">
          <Wifi className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {status === "done" ? "Transfer complete" : "Share this link with the receiver"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {status === "done"
            ? "The file was sent directly to their browser."
            : "Keep this tab open — the file transfers directly to their browser, never through our server."}
        </p>
      </div>

      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shareable link
          </p>
          <div className="mt-2 min-w-0 flex-1 truncate rounded-lg border border-border bg-background-elevated px-3 py-2.5 font-mono text-sm text-foreground">
            {shareUrl}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Expires <span className="text-muted">{formatAbsolute(expiresAt)}</span>
          </p>
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
        <P2pStatusPanel
          status={status}
          role="sender"
          progress={progress}
          speed={speed}
          errorMessage={transferError}
        />
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <Button variant="secondary" onClick={onReset} className="w-full">
          <RotateCcw className="h-4 w-4" />
          Start Another Transfer
        </Button>
      </div>
    </Card>
  );
}
