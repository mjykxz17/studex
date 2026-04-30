import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  hoverLift?: boolean;
  inset?: boolean;
  className?: string;
};

export function Card({ children, hoverLift = false, inset = false, className = "" }: Props) {
  const padding = inset
    ? "px-3 py-3"
    : "px-[var(--space-card-x)] py-[var(--space-card-y)]";
  const hoverClasses = hoverLift
    ? "motion-hover hover:shadow-[var(--shadow-lift)] hover:-translate-y-px"
    : "";
  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-card)] ${padding} ${hoverClasses} ${className}`}
    >
      {children}
    </div>
  );
}
