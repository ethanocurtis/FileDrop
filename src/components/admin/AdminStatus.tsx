"use client";

import Link from "next/link";
import { useAdminSession, clearAdminSession } from "@/lib/client/adminSession";

/** Tiny footer indicator: a login link when logged out, or a logout
 * control when this browser is currently holding a valid admin session.
 * Deliberately unobtrusive — most visitors will never see anything here
 * that looks like a real account system, because it isn't one. */
export function AdminStatus() {
  const { isAdmin } = useAdminSession();

  if (!isAdmin) {
    return (
      <Link href="/admin" className="hover:text-foreground hover:underline">
        Admin login
      </Link>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>Admin ✓</span>
      <span aria-hidden>·</span>
      <Link href="/admin/drops" className="hover:text-foreground hover:underline">
        Manage uploads
      </Link>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={() => clearAdminSession()}
        className="hover:text-foreground hover:underline cursor-pointer"
      >
        Log out
      </button>
    </span>
  );
}
