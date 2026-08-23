'use client';

import React, { useState, useEffect } from 'react';
import { GitCompare, TrendingUp, CheckCircle2 } from 'lucide-react';

interface ABExperimentWidgetProps {
  // Can fetch from /api/analytics/experiments
}

export const ABExperimentWidget: React.FC<ABExperimentWidgetProps> = () => {
  const [experiments, setExperiments] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/api/analytics/experiments')
      .then((res) => res.json())
      .then((data) => setExperiments(data))
      .catch((err) => console.error(err));
  }, []);

  if (experiments.length === 0) return null;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <GitCompare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Live A/B Strategy Performance Experiments (Section 8 / Strategy Optimization)
          </h3>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
          Active Experimentation
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {experiments.map((exp) => (
          <div
            key={exp.experiment_id}
            className="p-3.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">{exp.experiment_id}</span>
                <div className="text-xs font-semibold text-[var(--text-main)] mt-0.5">{exp.title}</div>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                +{exp.lift_percent}% Lift
              </span>
            </div>

            {/* Variants Side-by-Side */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 bg-[var(--bg-card)] rounded border border-[var(--border-main)] space-y-1">
                <div className="text-[10px] text-[var(--text-muted)] truncate">{exp.variant_a.name}</div>
                <div className="text-sm font-bold text-[var(--text-main)]">{exp.variant_a.recovery_rate_percent}%</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {exp.variant_a.recovered}/{exp.variant_a.attempts} txns • ₹{Number(exp.variant_a.revenue_recovered).toLocaleString('en-IN')}
                </div>
              </div>

              <div className="p-2.5 bg-blue-500/5 rounded border border-blue-500/30 space-y-1">
                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold truncate">{exp.variant_b.name}</div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{exp.variant_b.recovery_rate_percent}%</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {exp.variant_b.recovered}/{exp.variant_b.attempts} txns • ₹{Number(exp.variant_b.revenue_recovered).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-muted)] font-sans flex items-start space-x-1.5 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span>{exp.conclusion}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
