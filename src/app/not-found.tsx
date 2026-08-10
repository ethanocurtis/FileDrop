import { Logo } from "@/components/ui/Logo";
import { ExpiredState } from "@/components/download/ExpiredState";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 pt-8">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
        <ExpiredState title="Page not found." message="This page doesn't exist." />
      </main>
    </div>
  );
}
