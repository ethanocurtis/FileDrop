import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { AdminDropsView } from "@/components/admin/AdminDropsView";

export const metadata: Metadata = {
  title: "FileDrop — Manage uploads",
  description: "Admin view of every upload currently on the server.",
};

export default function AdminDropsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 pt-8">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
        <AdminDropsView />
      </main>
    </div>
  );
}
