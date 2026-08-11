import { AlertCircle, CheckCircle2, Loader2, Radio } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatBytes } from "@/lib/utils/bytes";
import type { P2pStatus } from "@/lib/p2p/client/webrtc";

const STATUS_LABEL: Record<P2pStatus, { sender: string; receiver: string }> = {
  "connecting-signal": { sender: "Connecting…", receiver: "Connecting…" },
  "waiting-for-peer": {
    sender: "Waiting for the receiver to connect…",
    receiver: "Waiting for the sender to come online…",
  },
  "connecting-peer": {
    sender: "Establishing a direct connection…",
    receiver: "Establishing a direct connection…",
  },
  transferring: { sender: "Sending…", receiver: "Receiving…" },
  done: { sender: "Transfer complete", receiver: "Transfer complete" },
  closed: {
    sender: "Disconnected from the signaling server.",
    receiver: "Disconnected from the signaling server.",
  },
};

export function P2pStatusPanel({
  status,
  role,
  progress,
  errorMessage,
}: {
  status: P2pStatus;
  role: "sender" | "receiver";
  progress: { transferred: number; total: number } | null;
  errorMessage: string | null;
}) {
  const label = STATUS_LABEL[status][role];
  const showProgress = status === "transferring" || status === "done";

  return (
    <div className="w-full">
      <div className="flex items-center gap-2.5 text-sm font-medium text-foreground">
        {status === "done" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : status === "waiting-for-peer" ? (
          <Radio className="h-4 w-4 shrink-0 animate-pulse text-accent-strong" />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-strong" />
        )}
        {label}
      </div>

      {showProgress && progress && (
        <div className="mt-3">
          <ProgressBar value={(progress.transferred / Math.max(progress.total, 1)) * 100} />
          <p className="mt-2 text-xs text-muted-foreground">
            {formatBytes(progress.transferred)} of {formatBytes(progress.total)}
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}
    </div>
  );
}
