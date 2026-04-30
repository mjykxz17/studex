import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const SHARED =
  "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] text-[var(--font-size-body)] px-3 py-[var(--space-row-y)] focus:outline-none focus:shadow-[var(--shadow-focus)] motion-hover disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    const { className = "", ...rest } = props;
    return <input ref={ref} {...rest} className={`${SHARED} ${className}`} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    const { className = "", children, ...rest } = props;
    return (
      <select ref={ref} {...rest} className={`${SHARED} ${className}`}>
        {children}
      </select>
    );
  },
);
