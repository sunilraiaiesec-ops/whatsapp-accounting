import Image from "next/image";
import Link from "next/link";

function Wordmark({ showTagline = true }: { showTagline?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col leading-none">
      <span className="truncate text-[15px] font-bold tracking-tight sm:text-base">
        <span className="text-[#3d6b32]">BANTOO</span>
        <span className="text-[#c9972e]">BOOKS</span>
      </span>
      {showTagline ? (
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400 sm:text-[10px]">
          Accounting
        </span>
      ) : null}
    </span>
  );
}

function Emblem({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-24 w-24" : "h-11 w-11 sm:h-12 sm:w-12";
  const scale = size === "lg" ? "scale-[1.55]" : "scale-[1.85] sm:scale-[2]";

  return (
    <span
      className={`relative ${box} shrink-0 overflow-hidden rounded-full bg-black shadow-sm ring-1 ring-black/10`}
    >
      <Image
        src="/bantoobooks-logo.png"
        alt=""
        fill
        sizes={size === "lg" ? "96px" : "48px"}
        className={`object-cover object-[50%_20%] ${scale}`}
        priority={size === "md"}
        aria-hidden
      />
    </span>
  );
}

export function BrandLogo({
  href = "/dashboard",
  size = "header",
  className = "",
}: {
  href?: string;
  size?: "header" | "auth";
  className?: string;
}) {
  const inner =
    size === "auth" ? (
      <span className={`flex flex-col items-center gap-3 ${className}`}>
        <Emblem size="lg" />
        <Wordmark />
      </span>
    ) : (
      <span className={`inline-flex items-center gap-2.5 sm:gap-3 ${className}`}>
        <Emblem />
        <Wordmark />
      </span>
    );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="Bantoo Books Accounting home"
        className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
