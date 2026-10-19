import React from 'react';
import { cn } from '../../lib/utils';
import { Activity, Clock, CheckCircle, AlertTriangle, PlayCircle } from 'lucide-react';

/**
 * BHIV Design System Foundation
 * Reusable Dashboard Primitives for Government-Grade UI Maturity
 */

// 1. KPI Card
export const KPICard: React.FC<{
  title: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, value, trend, trendUp, icon, className }) => {
  return (
    <div className={cn("bg-surface-raised border border-border p-4 rounded-xl flex flex-col gap-2", className)}>
      <div className="flex justify-between items-center text-text-muted">
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        {icon && <span className="text-brand-light opacity-80">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-text-main">{value}</div>
      {trend && (
        <div className={cn("text-xs font-medium", trendUp ? "text-green-400" : "text-red-400")}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
    </div>
  );
};

// 2. Runtime Status Card
export const RuntimeCard: React.FC<{
  status: 'active' | 'thinking' | 'running' | 'error';
  traceId?: string;
  latency?: string;
  className?: string;
}> = ({ status, traceId, latency, className }) => {
  const statusColors = {
    active: 'text-green-400',
    thinking: 'text-amber-400',
    running: 'text-blue-400',
    error: 'text-red-400',
  };

  return (
    <div className={cn("bg-surface-raised border border-border p-4 rounded-xl flex items-center justify-between", className)}>
      <div className="flex items-center gap-3">
        <div className={cn("w-2 h-2 rounded-full", status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-amber-500 animate-pulse')} />
        <div>
          <div className="text-sm font-semibold text-text-main">TANTRA Runtime</div>
          <div className={cn("text-xs font-medium uppercase tracking-wider", statusColors[status])}>
            {status}
          </div>
        </div>
      </div>
      <div className="text-right">
        {traceId && <div className="text-[10px] text-text-muted font-mono opacity-80">{traceId}</div>}
        {latency && <div className="text-xs text-text-muted">{latency}</div>}
      </div>
    </div>
  );
};

// 3. Health / Telemetry Card
export const HealthCard: React.FC<{
  services: Array<{ name: string; status: 'ok' | 'degraded' | 'down' }>;
  className?: string;
}> = ({ services, className }) => {
  return (
    <div className={cn("bg-surface-raised border border-border p-4 rounded-xl", className)}>
      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
        <Activity size={14} /> System Telemetry
      </div>
      <div className="flex flex-col gap-2">
        {services.map((svc, i) => (
          <div key={i} className="flex justify-between items-center text-sm">
            <span className="text-text-main">{svc.name}</span>
            <span className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
              svc.status === 'ok' ? "bg-green-500/10 text-green-400 border border-green-500/20" :
              svc.status === 'degraded' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
              "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
              {svc.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// 4. Activity Feed / Trace Card
export const ActivityFeed: React.FC<{
  logs: Array<{ time: string; event: string; type: 'info' | 'warn' | 'error' | 'success' }>;
  className?: string;
}> = ({ logs, className }) => {
  return (
    <div className={cn("bg-surface-raised border border-border p-4 rounded-xl", className)}>
      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
        <Clock size={14} /> Execution Provenance
      </div>
      <div className="flex flex-col gap-3">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 text-sm">
            <div className="text-xs text-text-muted font-mono pt-0.5 w-12 shrink-0">{log.time}</div>
            <div className="flex gap-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                log.type === 'success' ? 'bg-green-500' :
                log.type === 'error' ? 'bg-red-500' :
                log.type === 'warn' ? 'bg-amber-500' : 'bg-brand-light'
              )} />
              <span className="text-text-main text-xs">{log.event}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
