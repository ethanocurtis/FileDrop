import Link from "next/link";
import clsx from "clsx";

export function ModeTabs({ active }: { active: "upload" | "p2p" }) {
  const tabs = [
    { href: "/", label: "Upload", key: "upload" as const },
    { href: "/p2p", label: "Peer-to-Peer", key: "p2p" as const },
  ];

  return (
    <nav className="inline-flex gap-1 rounded-xl border border-border bg-card/60 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={clsx(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
            active === tab.key
              ? "bg-accent/15 text-accent-strong"
              : "text-muted hover:text-foreground",
          )}
          aria-current={active === tab.key ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
