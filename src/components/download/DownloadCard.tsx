"use client";

import { AlertCircle, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileIcon } from "@/components/ui/FileIcon";
import { formatBytes } from "@/lib/utils/bytes";
import type { PublicFileMetadata } from "@/types/drop";

export interface DownloadableFile extends PublicFileMetadata {
  state: "idle" | "downloading" | "done" | "error";
  errorMessage?: string;
}

export function DownloadCard({
  files,
  timeRemaining,
  onDownload,
}: {
  files: DownloadableFile[];
  timeRemaining: string | null;
  onDownload: (fileId: string) => void;
}) {
  const single = files.length === 1;

  return (
    <Card className="w-full max-w-md p-6 sm:p-8 animate-fade-in">
      {single ? (
        <SingleFile file={files[0]} timeRemaining={timeRemaining} onDownload={onDownload} />
      ) : (
        <>
          <h1 className="text-center text-lg font-semibold text-foreground">
            {files.length} files shared with you
          </h1>
          {timeRemaining && (
            <p className="mt-1 text-center text-sm text-muted">Expires in {timeRemaining}</p>
          )}
          <div className="mt-6 grid gap-2">
            {files.map((file) => (
              <FileRow key={file.fileId} file={file} onDownload={onDownload} />
            ))}
          </div>
        </>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Files are automatically deleted after expiration.
      </p>
    </Card>
  );
}

function SingleFile({
  file,
  timeRemaining,
  onDownload,
}: {
  file: DownloadableFile;
  timeRemaining: string | null;
  onDownload: (fileId: string) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background-elevated">
        <FileIcon mimeType={file.mimeType} className="h-8 w-8 text-muted" />
      </div>
      <h1 className="mt-4 truncate text-lg font-semibold text-foreground max-w-full">{file.name}</h1>
      <p className="mt-1 text-sm text-muted">{formatBytes(BigInt(file.size))}</p>
      {timeRemaining && (
        <p className="mt-1 text-sm text-muted-foreground">Expires in {timeRemaining}</p>
      )}

      <Button
        onClick={() => onDownload(file.fileId)}
        disabled={file.state === "downloading"}
        size="lg"
        className="mt-6 w-full"
      >
        {file.state === "downloading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Downloading…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" /> Download File
          </>
        )}
      </Button>

      {file.state === "error" && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {file.errorMessage ?? "Download failed. Please try again."}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  onDownload,
}: {
  file: DownloadableFile;
  onDownload: (fileId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3">
      <FileIcon mimeType={file.mimeType} className="h-6 w-6 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(BigInt(file.size))}</p>
        {file.state === "error" && (
          <p className="mt-0.5 text-xs text-danger">{file.errorMessage ?? "Download failed."}</p>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onDownload(file.fileId)}
        disabled={file.state === "downloading"}
      >
        {file.state === "downloading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
