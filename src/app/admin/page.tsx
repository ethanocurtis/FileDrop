import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = {
  title: "FileDrop — Admin login",
  description: "Log in as admin to upload files that never expire.",
};

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 pt-8">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
        <AdminLoginForm />
      </main>
    </div>
  );
}
