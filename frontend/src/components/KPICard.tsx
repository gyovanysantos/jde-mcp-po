import type { ReactNode } from "react";
import { clsx } from "clsx";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: KPICardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p
              className={clsx("text-xs font-medium", {
                "text-success": trend === "up",
                "text-danger": trend === "down",
                "text-gray-500": trend === "neutral" || !trend,
              })}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}
