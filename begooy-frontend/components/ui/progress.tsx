"use client";
import * as React from "react";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** مقدار پیشرفت بین 0 تا 100 */
  value?: number;
  /** حداکثر مقدار (پیش‌فرض 100) */
  max?: number;
  /** برچسب برای دسترس‌پذیری */
  label?: string;
}

/**
 * Progress — نسخه‌ی سبک و بدون وابستگی (سازگار با shadcn API)
 * - RTL-friendly
 * - Transition نرم روی تغییر عرض
 */
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value = 0, max = 100, className = "", label = "progress", ...props }, ref) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={`relative w-full h-2 rounded-full bg-neutral-200/80 overflow-hidden ${className}`}
        {...props}
      >
        <div
          className="absolute inset-y-0 left-0 h-full rounded-full bg-orange-500 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export default Progress;
