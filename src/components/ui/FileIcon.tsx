import {
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileGeneric,
} from "lucide-react";
import clsx from "clsx";

function iconFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.startsWith("text/") || mimeType === "application/pdf") return FileText;
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("csv") ||
    mimeType.includes("excel")
  )
    return FileSpreadsheet;
  if (
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("compressed") ||
    mimeType.includes("archive")
  )
    return FileArchive;
  if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("xml") ||
    mimeType.includes("html")
  )
    return FileCode;
  return FileGeneric;
}

export function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  // iconFor always returns one of the fixed, module-level lucide icon
  // components above — never a component defined during render — so this
  // is safe despite looking like the "component created during render"
  // anti-pattern.
  const Icon = iconFor(mimeType);
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className={clsx("shrink-0", className)} strokeWidth={1.75} />;
}
