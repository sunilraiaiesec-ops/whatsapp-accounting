import Image from "next/image";
import Link from "next/link";

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
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-black px-3 py-2 ${className}`}
      >
        <Image
          src="/bantoobooks-logo.png"
          alt="Bantoo Books Accounting"
          width={200}
          height={300}
          className="h-28 w-auto object-contain"
          priority
        />
      </span>
    ) : (
      <span
        className={`relative inline-flex h-11 w-[148px] shrink-0 overflow-hidden rounded-lg bg-black sm:h-12 sm:w-[168px] ${className}`}
      >
        <Image
          src="/bantoobooks-logo.png"
          alt="Bantoo Books Accounting"
          fill
          sizes="168px"
          className="object-cover object-[50%_72%] scale-[2.8] sm:scale-[3]"
          priority
        />
      </span>
    );

  if (href) {
    return (
      <Link
        href={href}
        className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
