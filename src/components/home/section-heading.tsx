import Link from "next/link";
import { ArrowRight } from "lucide-react";

type SectionHeadingProps = {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
};

export function SectionHeading({
  title,
  description,
  href,
  linkLabel = "See all",
}: SectionHeadingProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {href ? (
        <Link
          href={href}
          className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {linkLabel}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}
