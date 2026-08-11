import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { ModeTabs } from "@/components/p2p/ModeTabs";
import { P2pSendFlow } from "@/components/p2p/P2pSendFlow";

export const metadata: Metadata = {
  title: "FileDrop — Peer-to-peer transfer",
  description: "Send a file directly to another browser, with no server storage involved.",
};

export default function P2pPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-6 pt-8">
        <Logo />
        <ModeTabs active="p2p" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Send it{" "}
            <span className="bg-gradient-to-r from-accent-strong to-accent bg-clip-text text-transparent">
              browser to browser.
            </span>
          </h1>
          <p className="mt-4 text-base text-muted sm:text-lg">
            No file size limits from server storage — the file goes straight from your
            browser to theirs. Both tabs need to stay open during the transfer.
          </p>
        </div>

        <P2pSendFlow />
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-8 text-center text-xs text-muted-foreground">
        Nothing is uploaded to our server — only a small link record, until it expires.
      </footer>
    </div>
  );
}
