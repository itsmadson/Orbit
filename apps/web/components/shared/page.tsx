"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  icon,
  breadcrumb,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {breadcrumb?.length ? (
          <nav className="mb-1.5 flex items-center gap-1 text-[11px] text-muted">
            {breadcrumb.map((crumb, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3 w-3 text-faint rtl:rotate-180" /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="transition-colors hover:text-text">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-2.5">
          {icon}
          <h1 className="truncate text-[19px] font-semibold tracking-tight">{title}</h1>
        </div>
        {subtitle ? <div className="mt-1 text-[13px] text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone,
  icon,
  href,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "warning" | "danger" | "accent";
  icon?: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
}) {
  const toneClass = {
    default: "text-text",
    positive: "text-positive",
    warning: "text-warning",
    danger: "text-danger",
    accent: "text-accent",
  }[tone ?? "default"];

  const body = (
    <div className="panel group h-full p-3.5 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-2.5">
        {icon ? (
          <span className="tile mt-0.5 h-[30px] w-[30px] transition-transform duration-200 group-hover:-translate-y-px">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
            {label}
          </span>
          <div
            className={cn(
              "mt-1 truncate text-[23px] font-semibold leading-none tracking-[-0.02em] tnum",
              toneClass,
            )}
          >
            {value}
          </div>
          {hint ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">{hint}</div>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-2.5">{children}</div> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
