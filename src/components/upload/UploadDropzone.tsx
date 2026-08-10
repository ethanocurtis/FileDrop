"use client";

import { useCallback, useId, useRef, useState } from "react";
import clsx from "clsx";
import { UploadCloud } from "lucide-react";

export function UploadDropzone({
  onFilesSelected,
  disabled,
}: {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      onFilesSelected(Array.from(fileList));
    },
    [onFilesSelected],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        dragCounter.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragging(false);
        if (disabled) return;
        handleFiles(e.dataTransfer.files);
      }}
      className={clsx(
        "group relative flex w-full cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-[var(--radius-lg)] border-2 border-dashed px-8 py-16 text-center transition-all duration-200 sm:py-20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "cursor-not-allowed opacity-60",
        isDragging
          ? "border-accent bg-accent/10 scale-[1.01]"
          : "border-border bg-card/40 hover:border-border-strong hover:bg-card/70",
      )}
    >
      <div
        className={clsx(
          "absolute inset-0 -z-10 bg-gradient-to-b from-accent/10 to-transparent opacity-0 transition-opacity duration-300",
          isDragging && "opacity-100",
        )}
      />
      <div
        className={clsx(
          "flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background-elevated transition-transform duration-200",
          isDragging ? "scale-110 border-accent/50" : "group-hover:scale-105",
        )}
      >
        <UploadCloud
          className={clsx("h-7 w-7 transition-colors", isDragging ? "text-accent-strong" : "text-muted")}
          strokeWidth={1.75}
        />
      </div>

      <div>
        <p className="text-base font-medium text-foreground">
          {isDragging ? "Drop it here" : "Drag & drop files here"}
        </p>
        <p className="mt-1 text-sm text-muted">
          or <span className="text-accent-strong underline underline-offset-2">browse</span> from your device
        </p>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
