import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] motion-hover motion-press",
  secondary:
    "bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] border border-[color:var(--color-border)] hover:shadow-[var(--shadow-lift)] hover:-translate-y-px motion-hover motion-press",
  ghost:
    "text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] motion-hover motion-press",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[11px] font-medium rounded-[var(--radius-sm)]",
  md: "px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)]",
  lg: "px-5 py-3 text-[14px] font-semibold rounded-[var(--radius-md)]",
};

export function Button({
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  children,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {leadingIcon ? <span className="-ml-0.5">{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className="-mr-0.5">{trailingIcon}</span> : null}
    </button>
  );
}
