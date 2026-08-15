import React, { type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  highlightedText?: string;
  icon: ComponentType<{ className?: string }>; // Lucide icon
  watermarkIcon?: ComponentType<{ className?: string }>; // Lucide icon
  theme?: "crimson" | "indigo" | "emerald" | "amber" | "blue";
  badgeText?: string;
  rightAction?: ReactNode;
}

const THEME_MAP = {
  crimson: {
    gradient: "from-red-950 via-red-900 to-red-950 border-red-500/30 shadow-red-950/25",
    watermark: "text-red-400",
    highlight: "text-red-400",
    badge: "bg-white/10 border-white/20 text-red-200"
  },
  indigo: {
    gradient: "from-indigo-950 via-indigo-900 to-indigo-950 border-indigo-500/30 shadow-indigo-950/25",
    watermark: "text-indigo-400",
    highlight: "text-indigo-400",
    badge: "bg-white/10 border-white/20 text-indigo-200"
  },
  emerald: {
    gradient: "from-emerald-950 via-emerald-900 to-emerald-950 border-emerald-500/30 shadow-emerald-950/25",
    watermark: "text-emerald-400",
    highlight: "text-emerald-400",
    badge: "bg-white/10 border-white/20 text-emerald-200"
  },
  amber: {
    gradient: "from-amber-950 via-amber-900 to-amber-950 border-amber-500/30 shadow-amber-950/25",
    watermark: "text-amber-400",
    highlight: "text-amber-400",
    badge: "bg-white/10 border-white/20 text-amber-200"
  },
  blue: {
    gradient: "from-blue-950 via-blue-900 to-blue-950 border-blue-500/30 shadow-blue-950/25",
    watermark: "text-blue-400",
    highlight: "text-blue-400",
    badge: "bg-white/10 border-white/20 text-blue-200"
  }
};

export function DashboardHeader({
  title,
  subtitle,
  highlightedText,
  icon: Icon,
  watermarkIcon: WatermarkIcon,
  theme = "indigo", // Default to indigo for Welfare
  badgeText,
  rightAction,
}: DashboardHeaderProps) {
  const activeTheme = THEME_MAP[theme] || THEME_MAP.indigo;
  const FinalWatermark = WatermarkIcon || Icon;

  return (
    <header className={cn(
      "relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-5 md:py-4 md:px-6 bg-gradient-to-r text-white border rounded-[2rem] shadow-xl overflow-hidden group shrink-0 backdrop-blur-xl transition-all duration-300",
      activeTheme.gradient
    )}>
      {/* Animated Background Watermark Icon */}
      <div className="absolute top-0 right-0 p-4 opacity-5 scale-125 rotate-12 transition-transform duration-1000 group-hover:rotate-0 pointer-events-none text-white">
        <FinalWatermark className={cn("w-48 h-48", activeTheme.watermark)} />
      </div>
      
      <div className="z-10 flex items-center gap-4 min-w-0">
        <div className="p-3 bg-white/10 rounded-2xl border border-white/20 shadow-inner shrink-0 transition-transform duration-500 group-hover:scale-105">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0 flex flex-col">
          {badgeText && (
            <div className="flex items-center gap-3 mb-1">
              <div className={cn("px-2.5 py-0.5 border rounded-full text-[8px] font-black uppercase tracking-widest", activeTheme.badge)}>
                {badgeText}
              </div>
            </div>
          )}
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase leading-none">
            {title} {highlightedText && <span className={activeTheme.highlight}>{highlightedText}</span>}
          </h1>
          {subtitle && (
            <p className="text-white/70 mt-1 font-medium text-[9px] uppercase tracking-widest max-w-lg opacity-85 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {rightAction && (
        <div className="z-10 shrink-0 w-full md:w-auto [&_button]:bg-white [&_button]:text-slate-950 [&_button:hover]:bg-white/90 [&_button]:border-transparent [&_button]:shadow-sm [&_button_svg]:text-slate-950">
          {rightAction}
        </div>
      )}
    </header>
  );
}
