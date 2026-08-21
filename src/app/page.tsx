import { Logo } from "@/components/ui/Logo";
import { ModeTabs } from "@/components/p2p/ModeTabs";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { RecentUploads } from "@/components/upload/RecentUploads";
import { AdminStatus } from "@/components/admin/AdminStatus";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-6 pt-8">
        <Logo />
        <ModeTabs active="upload" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Drop files.{" "}
            <span className="bg-gradient-to-r from-accent-strong to-accent bg-clip-text text-transparent">
              Share instantly.
            </span>
          </h1>
          <p className="mt-4 text-base text-muted sm:text-lg">
            Upload a file and get a temporary link. No account required.
          </p>
        </div>

        <UploadFlow />
        <RecentUploads />
      </main>

      <footer className="mx-auto flex w-full max-w-3xl flex-col items-center gap-1.5 px-6 pb-8 text-center text-xs text-muted-foreground">
        <span>Files are automatically deleted after expiration.</span>
        <AdminStatus />
      </footer>
    </div>
  );
}
