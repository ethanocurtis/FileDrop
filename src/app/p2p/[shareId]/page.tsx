import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { ExpiredState } from "@/components/download/ExpiredState";
import { P2pReceiveFlow } from "@/components/p2p/P2pReceiveFlow";
import { getActiveP2pTransferByShareId, toMetadataResponse } from "@/lib/p2p/service";

export const metadata: Metadata = {
  title: "FileDrop — Peer-to-peer transfer",
  description: "Receive a file shared directly from another browser via FileDrop.",
};

export default async function P2pReceivePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const transfer = await getActiveP2pTransferByShareId(shareId);

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 pt-8">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
        {!transfer ? (
          <ExpiredState
            title="This transfer is no longer available."
            message="The link may have expired, been completed, or never existed."
          />
        ) : (
          <P2pReceiveFlow
            shareId={shareId}
            initial={toMetadataResponse(transfer, !transfer.passwordHash)}
          />
        )}
      </main>
    </div>
  );
}
