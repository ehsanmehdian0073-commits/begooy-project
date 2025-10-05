"use client";
import * as React from "react";

type Variant = "default" | "secondary" | "outline";
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const base =
  "inline-flex items-center gap-1 rounded-full text-[11px] px-2 py-1 whitespace-nowrap";

const variants: Record<Variant, string> = {
  default: "bg-orange-500 text-white",
  secondary: "bg-neutral-100 text-neutral-700",
  outline: "border border-neutral-300 text-neutral-700 bg-white",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export default Badge;
