import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { ExpiredState } from "@/components/download/ExpiredState";
import { DownloadView, type DownloadViewInitialData } from "@/components/download/DownloadView";
import { getActiveDropByShareId } from "@/lib/uploads/service";

export const metadata: Metadata = {
  title: "FileDrop — Shared file",
  description: "Download a file shared via FileDrop.",
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const drop = await getActiveDropByShareId(shareId);

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 pt-8">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
        {!drop ? (
          <ExpiredState />
        ) : (
          <DownloadView initial={toInitialData(drop)} />
        )}
      </main>
    </div>
  );
}

function toInitialData(
  drop: NonNullable<Awaited<ReturnType<typeof getActiveDropByShareId>>>,
): DownloadViewInitialData {
  const requiresPassword = Boolean(drop.passwordHash);
  return {
    shareId: drop.shareId,
    requiresPassword,
    expiresAt: drop.expiresAt.toISOString(),
    burnAfterRead: drop.burnAfterRead,
    maxDownloads: drop.maxDownloads,
    downloadCount: drop.downloadCount,
    files: requiresPassword
      ? null
      : drop.files
          .filter((f) => f.status === "ACTIVE")
          .map((f) => ({
            fileId: f.id,
            name: f.sanitizedFileName,
            size: f.size.toString(),
            mimeType: f.mimeType,
          })),
  };
}
