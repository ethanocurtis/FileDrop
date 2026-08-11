"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { PasswordGate } from "@/components/download/PasswordGate";
import { ExpiredState } from "@/components/download/ExpiredState";
import { P2pStatusPanel } from "@/components/p2p/P2pStatusPanel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileIcon } from "@/components/ui/FileIcon";
import { unlockP2pTransfer, ApiError } from "@/lib/p2p/client/api";
import {
  createBlobSink,
  pickFileSystemSink,
  supportsFileSystemAccess,
  type FileSink,
} from "@/lib/p2p/client/fileSink";
import { startP2pReceiver, type P2pSession, type P2pStatus } from "@/lib/p2p/client/webrtc";
import { useTransferSpeed } from "@/lib/p2p/client/useTransferSpeed";
import { formatBytes } from "@/lib/utils/bytes";
import type { P2pTransferMetadataResponse } from "@/types/p2p";

interface ClientFileMeta {
  name: string;
  size: number;
  mimeType: string;
}

// The API serializes file size as a string (it's a BigInt server-side —
// see P2pTransferMetadataResponse); the transfer engine and FSA sink both
// want a plain number.
function toClientFileMeta(
  file: { name: string; size: string; mimeType: string } | null,
): ClientFileMeta | null {
  return file ? { name: file.name, size: Number(file.size), mimeType: file.mimeType } : null;
}

export function P2pReceiveFlow({ shareId, initial }: { shareId: string; initial: P2pTransferMetadataResponse }) {
  const [unlocked, setUnlocked] = useState(!initial.requiresPassword);
  const [token, setToken] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<ClientFileMeta | null>(toClientFileMeta(initial.file));
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<P2pStatus>("connecting-signal");
  const [progress, setProgress] = useState<{ transferred: number; total: number } | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const speed = useTransferSpeed(progress?.transferred ?? 0, status === "transferring");

  const sessionRef = useRef<P2pSession | null>(null);

  useEffect(() => () => sessionRef.current?.cancel(), []);

  useEffect(() => {
    if (!connecting || status === "done") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [connecting, status]);

  async function handleUnlock(password: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const result = await unlockP2pTransfer(shareId, password);
      setToken(result.token);
      setFileMeta(toClientFileMeta(result.file));
      setUnlocked(true);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      return { ok: false, message };
    }
  }

  // Must be a direct click handler (not something awaited into) so the
  // File System Access picker still has the user gesture it requires —
  // pickFileSystemSink calls it as the very first thing it does.
  async function handleConnect() {
    if (!fileMeta) return;
    setConnecting(true);
    setTransferError(null);

    let sink: FileSink;
    if (supportsFileSystemAccess()) {
      const fsaSink = await pickFileSystemSink(fileMeta);
      sink = fsaSink ?? createBlobSink(fileMeta);
    } else {
      sink = createBlobSink(fileMeta);
    }

    sessionRef.current = startP2pReceiver({
      shareId,
      token,
      fileMeta,
      sink,
      onStatus: setStatus,
      onProgress: (transferred, total) => setProgress({ transferred, total }),
      onError: setTransferError,
      onComplete: () => {},
    });
  }

  function handleReset() {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setConnecting(false);
    setStatus("connecting-signal");
    setProgress(null);
    setTransferError(null);
  }

  if (!unlocked) {
    return <PasswordGate onSubmit={handleUnlock} />;
  }

  if (!fileMeta) {
    return <ExpiredState title="This transfer is no longer available." />;
  }

  return (
    <Card className="w-full max-w-md p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3">
        <FileIcon mimeType={fileMeta.mimeType} className="h-6 w-6 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileMeta.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(fileMeta.size)}</p>
        </div>
      </div>

      {!connecting ? (
        <>
          <p className="mt-5 text-sm text-muted">
            This file transfers directly from the sender&apos;s browser to yours — it was never
            stored on our server. The sender needs to have their tab open too.
          </p>
          <Button size="lg" onClick={handleConnect} className="mt-6 w-full">
            <Download className="h-4 w-4" />
            Connect &amp; Download
          </Button>
        </>
      ) : (
        <div className="mt-6">
          <P2pStatusPanel
            status={status}
            role="receiver"
            progress={progress}
            speed={speed}
            errorMessage={transferError}
          />
          {status === "done" && (
            <Button variant="secondary" onClick={handleReset} className="mt-6 w-full">
              <RotateCcw className="h-4 w-4" />
              Done
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
