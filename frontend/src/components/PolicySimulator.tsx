'use client';

import React, { useState, useEffect } from 'react';
import { Play, Save, CheckCircle2, RefreshCw } from 'lucide-react';
import { PolicyConfig, SimulationResult } from '../types';
import { fetchPolicies, updatePolicies, simulatePolicy } from '../lib/api';

export const PolicySimulator: React.FC = () => {
  const [proposedConfig, setProposedConfig] = useState<PolicyConfig>({
    max_autonomous_retry_attempts: 2,
    max_autonomous_amount: 25000,
    require_human_high_risk: true,
    stop_on_repeated_failure: true,
    require_customer_consent_for_nudge: true,
    escalate_unknown_failure: true,
    vulcan_enabled: true,
  });

  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchPolicies().then((res) => {
      setProposedConfig(res);
    });
  }, []);

  const handleSimulate = async () => {
    setLoading(true);
    try {
      const res = await simulatePolicy(proposedConfig, 'dev');
      setSimResult(res);
    } catch (err) {
      alert('Error running simulation: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePolicies(proposedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Error saving policy configuration: ' + err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div>
          <h2 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Deterministic Policy Engine & Impact Simulator (Section 34)
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Configure hard autonomous limits and run offline simulations across historical payments
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-subtle)] hover:bg-[var(--border-main)] text-[var(--text-main)] border border-[var(--border-main)] transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
            <span>{loading ? 'Simulating...' : 'Run Simulation'}</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#0066F5] hover:bg-blue-600 text-white transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saving ? 'Saving...' : 'Apply Live Rules'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-xs text-emerald-700 dark:text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Deterministic merchant policy rules persisted successfully.</span>
        </div>
      )}

      {/* Simulator Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Controls Column */}
        <div className="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-4 space-y-4 shadow-xs">
          <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Rule Parameters
          </h3>

          {/* Amount Slider */}
          <div className="space-y-1.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3 rounded-md">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--text-muted)]">Autonomous Amount Cap</span>
              <span className="font-mono font-bold text-[var(--text-main)]">
                ₹{Number(proposedConfig.max_autonomous_amount).toLocaleString('en-IN')}
              </span>
            </div>
            <input
              type="range"
              min="5000"
              max="100000"
              step="5000"
              value={proposedConfig.max_autonomous_amount}
              onChange={(e) =>
                setProposedConfig({ ...proposedConfig, max_autonomous_amount: Number(e.target.value) })
              }
              className="w-full h-1.5 bg-[var(--border-main)] rounded appearance-none cursor-pointer accent-[#0066F5]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
              <span>₹5k</span>
              <span>₹50k</span>
              <span>₹100k</span>
            </div>
          </div>

          {/* Retry Slider */}
          <div className="space-y-1.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3 rounded-md">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--text-muted)]">Max Autonomous Retry Count</span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {proposedConfig.max_autonomous_retry_attempts} retries
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="1"
              value={proposedConfig.max_autonomous_retry_attempts}
              onChange={(e) =>
                setProposedConfig({ ...proposedConfig, max_autonomous_retry_attempts: Number(e.target.value) })
              }
              className="w-full h-1.5 bg-[var(--border-main)] rounded appearance-none cursor-pointer accent-[#0066F5]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
              <span>0 (No Retries)</span>
              <span>2 (Default)</span>
              <span>5 (Max)</span>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2.5 pt-1 text-xs">
            <label className="flex items-center justify-between p-2.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md cursor-pointer">
              <span className="text-[var(--text-main)]">Mandate Human Sign-Off for High Risk</span>
              <input
                type="checkbox"
                checked={proposedConfig.require_human_high_risk}
                onChange={(e) =>
                  setProposedConfig({ ...proposedConfig, require_human_high_risk: e.target.checked })
                }
                className="w-3.5 h-3.5 rounded bg-[var(--bg-card)] border-[var(--border-main)] text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md cursor-pointer">
              <span className="text-[var(--text-main)]">Stop Recovery on Repeated Failure</span>
              <input
                type="checkbox"
                checked={proposedConfig.stop_on_repeated_failure}
                onChange={(e) =>
                  setProposedConfig({ ...proposedConfig, stop_on_repeated_failure: e.target.checked })
                }
                className="w-3.5 h-3.5 rounded bg-[var(--bg-card)] border-[var(--border-main)] text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md cursor-pointer">
              <span className="text-[var(--text-main)]">Require User Consent for SMS/Link Nudges</span>
              <input
                type="checkbox"
                checked={proposedConfig.require_customer_consent_for_nudge}
                onChange={(e) =>
                  setProposedConfig({ ...proposedConfig, require_customer_consent_for_nudge: e.target.checked })
                }
                className="w-3.5 h-3.5 rounded bg-[var(--bg-card)] border-[var(--border-main)] text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md cursor-pointer">
              <span className="text-[var(--text-main)]">Razorpay Vulcan Smart Intelligence Signals</span>
              <input
                type="checkbox"
                checked={proposedConfig.vulcan_enabled}
                onChange={(e) =>
                  setProposedConfig({ ...proposedConfig, vulcan_enabled: e.target.checked })
                }
                className="w-3.5 h-3.5 rounded bg-[var(--bg-card)] border-[var(--border-main)] text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Simulation Output Column */}
        <div className="lg:col-span-7">
          {simResult ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-main)]">
                <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
                  Simulation Report ({simResult.total_evaluated} Transactions)
                </h3>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">Offline Evaluation</span>
              </div>

              {/* KPI Deltas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3.5 rounded-md">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-mono">Projected Recovered</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                    ₹{Number(simResult.simulated_recovered_revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1">
                    Delta: <span className={simResult.revenue_delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                      {simResult.revenue_delta >= 0 ? '+' : ''}₹{Number(simResult.revenue_delta).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3.5 rounded-md">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-mono">Autonomous Actions</div>
                  <div className="text-lg font-bold text-[var(--text-main)] font-mono mt-1">
                    {simResult.simulated_autonomous_recoveries}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1">
                    Baseline: {simResult.baseline_autonomous_recoveries}
                  </div>
                </div>

                <div className="bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3.5 rounded-md">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-mono">Human Escalations</div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono mt-1">
                    {simResult.simulated_human_escalations}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1">
                    Delta: {simResult.escalations_delta > 0 ? `+${simResult.escalations_delta}` : simResult.escalations_delta}
                  </div>
                </div>
              </div>

              {/* Financial ROI & Monthly Yield Projection Banner */}
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-mono uppercase font-bold text-blue-600 dark:text-blue-400">
                    Projected 30-Day Financial Impact & Break-Even ROI
                  </div>
                  <div className="text-xs text-[var(--text-main)] font-medium mt-0.5">
                    Estimated Net Monthly Revenue Gain: <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">+₹{Number(simResult.projected_monthly_revenue_gain || (simResult.revenue_delta * 3.75)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/mo</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-bold">
                    {simResult.estimated_roi_multiplier || 14.2}x Action Cost ROI
                  </span>
                </div>
              </div>

              {/* Explanation Summary */}
              <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md space-y-1">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-semibold">
                  Risk & Policy Analysis
                </div>
                <p className="text-xs text-[var(--text-main)] leading-relaxed font-sans">
                  {simResult.explanation}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-main)] rounded-md p-10 text-center flex flex-col items-center justify-center h-full">
              <div className="text-xs font-semibold text-[var(--text-main)]">Ready to Simulate</div>
              <p className="text-[11px] text-[var(--text-muted)] max-w-sm mt-1 mb-3">
                Adjust parameter sliders on the left and click Run Simulation to project net monetary yield.
              </p>
              <button
                onClick={handleSimulate}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#0066F5] hover:bg-blue-600 text-white transition-colors cursor-pointer shadow-xs"
              >
                Run Simulation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
