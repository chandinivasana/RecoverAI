'use client';

import React from 'react';
import { AuditEvent } from '../types';

interface AgentActivityFeedProps {
  events: AuditEvent[];
  onSelectPayment?: (paymentId: string) => void;
}

export const AgentActivityFeed: React.FC<AgentActivityFeedProps> = ({ events, onSelectPayment }) => {
  const getActorBadge = (actor: string) => {
    if (actor.includes('PolicyEngine')) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    if (actor.includes('PaymentAnalyst')) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    if (actor.includes('RecoveryPlanner')) return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    if (actor.includes('HumanReviewer')) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    return 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-main)]';
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-4 flex flex-col h-full shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-main)]">
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">Agent Telemetry Feed</h3>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-muted)] font-semibold">Live Stream</span>
      </div>

      <div className="mt-3 space-y-2 overflow-y-auto max-h-[260px] pr-1 scrollbar-thin scrollbar-thumb-[var(--border-main)]">
        {events.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] text-xs font-mono">No telemetry events logged</div>
        ) : (
          events.map((evt, idx) => (
            <div
              key={evt.audit_id || idx}
              onClick={() => onSelectPayment && onSelectPayment(evt.payment_id)}
              className="p-2 bg-[var(--bg-subtle)] border border-[var(--border-main)] hover:border-[var(--border-subtle)] rounded-md transition-colors cursor-pointer text-xs"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center space-x-1.5">
                  <span className={`text-[10px] font-mono font-medium px-1.5 py-0.2 rounded border ${getActorBadge(evt.actor)}`}>
                    {evt.actor}
                  </span>
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-mono font-semibold">
                    {evt.payment_id}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <div className="text-[11px] text-[var(--text-main)] line-clamp-2 leading-relaxed">
                {evt.metadata?.reason || evt.metadata?.result || evt.metadata?.message || evt.event_type}
              </div>

              {evt.metadata?.amount_recovered ? (
                <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                  +₹{Number(evt.metadata.amount_recovered).toLocaleString('en-IN', { minimumFractionDigits: 2 })} settled
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
