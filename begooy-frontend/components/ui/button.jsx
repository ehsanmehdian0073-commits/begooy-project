"use client";
export function Button({ className="", variant="default", size="md", ...props }) {
  const base="inline-flex items-center justify-center rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors";
  const sizes={ sm:"h-9 px-3", md:"h-10 px-4", lg:"h-11 px-6 text-base" };
  const variants={
    default:"bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-400",
    outline:"bg-transparent border border-slate-300 text-slate-900 hover:bg-slate-50 focus:ring-slate-300",
    ghost:"bg-transparent text-slate-900 hover:bg-slate-100 focus:ring-slate-300",
  };
  return <button className={`${base} ${sizes[size]||sizes.md} ${variants[variant]||variants.default} ${className}`} {...props} />;
}
