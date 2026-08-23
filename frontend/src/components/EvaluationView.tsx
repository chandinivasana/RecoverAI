'use client';

import React, { useState, useEffect } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { EvaluationBenchmark } from '../types';
import { runEvaluation } from '../lib/api';

export const EvaluationView: React.FC = () => {
  const [evalData, setEvalData] = useState<EvaluationBenchmark | null>(null);
  const [loading, setLoading] = useState(false);
  const [split, setSplit] = useState<'eval' | 'dev'>('eval');

  const handleRunEval = async (targetSplit: 'eval' | 'dev' = split) => {
    setLoading(true);
    try {
      const res = await runEvaluation(targetSplit);
      setEvalData(res);
    } catch (err) {
      alert('Evaluation failed: ' + err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRunEval('eval');
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div>
          <h2 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Held-Out Benchmark & Confidence Calibration (Sections 31–33)
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            200 synthetic evaluation transactions isolated from policy rule tuning
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={split}
            onChange={(e) => {
              const val = e.target.value as 'eval' | 'dev';
              setSplit(val);
              handleRunEval(val);
            }}
            className="bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:outline-none font-mono"
          >
            <option value="eval">Held-Out Test Split (200 Txns)</option>
            <option value="dev">Development Split (800 Txns)</option>
          </select>

          <button
            onClick={() => handleRunEval(split)}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#0066F5] hover:bg-blue-600 text-white transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{loading ? 'Running...' : 'Run Benchmark'}</span>
          </button>
        </div>
      </div>

      {evalData && (
        <>
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md shadow-xs">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Recovered Capital</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1">
                ₹{Number(evalData.financial_metrics.revenue_recovered).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono mt-2">
                From ₹{Number(evalData.financial_metrics.revenue_at_risk).toLocaleString('en-IN')} at risk
              </div>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md shadow-xs">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Recovery Conversion</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums mt-1">
                {evalData.financial_metrics.recovery_rate_percent}%
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono mt-2">
                Avg ticket ₹{Number(evalData.financial_metrics.average_ticket_size).toLocaleString('en-IN')}
              </div>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md shadow-xs">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Unsafe Action Defense</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1">
                {evalData.safety_metrics.unsafe_block_rate_percent}%
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono mt-2">
                {evalData.safety_metrics.unsafe_actions_blocked} / {evalData.safety_metrics.unsafe_actions_attempted} blocked
              </div>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md shadow-xs">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Calibration (1 - Brier)</div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 font-mono tabular-nums mt-1">
                {evalData.decision_quality.calibration_score}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono mt-2">
                Brier score: {evalData.decision_quality.brier_score}
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Calibration Curve */}
            <div className="lg:col-span-8 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
                    Confidence Calibration Curve (Section 33)
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Mean predicted probability vs actual empirical recovery conversion</p>
                </div>
                <span className="text-[10px] font-mono text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-main)] font-semibold">
                  Reliability Diagram
                </span>
              </div>

              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evalData.calibration_curve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="var(--border-main)" />
                    <XAxis dataKey="bin" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} domain={[0, 1]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-main)' }}
                    />
                    <Bar dataKey="predicted_probability" name="Predicted Probability" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="actual_recovery_rate" name="Empirical Recovery Rate" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Action Distribution Breakdown */}
            <div className="lg:col-span-4 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-5 space-y-3 shadow-xs">
              <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
                Action Space Distribution
              </h3>

              <div className="space-y-3 pt-1 font-mono text-xs">
                {Object.entries(evalData.decision_quality.action_distribution).map(([action, count]) => {
                  const pct = Math.round((count / evalData.total_evaluated_transactions) * 100);
                  return (
                    <div key={action} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--text-main)]">{action}</span>
                        <span className="text-[var(--text-muted)]">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-[var(--bg-subtle)] rounded h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-[#0066F5] rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
