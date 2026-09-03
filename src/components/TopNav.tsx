"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/components/AppStore";
import { Spinner } from "@/components/ui";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload Data" },
  { href: "/alerts", label: "Alerts" },
  { href: "/settings", label: "Connected Systems" },
];

export function TopNav() {
  const pathname = usePathname();
  const { data, working } = useStore();
  const buyerCount = data?.summary.totalBuyers ?? 0;
  const alertCount = data?.alerts.length ?? 0;

  return (
    <header className="no-print sticky top-0 z-40 border-b border-navy-800/60 bg-navy-900 text-white">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brandteal text-[13px] font-black tracking-tight">
            C
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">Coface Connect</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-navy-100/60">
              Portfolio Visibility
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-navy-100/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
                {link.href === "/alerts" && alertCount > 0 ? (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brandamber px-1 text-[10px] font-bold text-navy-950">
                    {alertCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {working ? (
            <span className="flex items-center gap-2 text-[12px] text-navy-100/80">
              <Spinner className="h-3.5 w-3.5" />
              Working…
            </span>
          ) : null}
          <span className="hidden text-[11px] text-navy-100/60 lg:inline">
            Designed and built by{" "}
            <span className="font-medium text-navy-100/85">Alexandre Lee</span>
          </span>
          <span className="hidden h-3.5 w-px bg-white/15 lg:block" />
          <div className="hidden items-center gap-2 text-[11px] text-navy-100/60 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brandteal" />
            {buyerCount > 0
              ? `${buyerCount} buyers · ${data?.summary.monthsMonitored ?? 0} months monitored`
              : "No portfolio loaded"}
          </div>
        </div>
      </div>
    </header>
  );
}
