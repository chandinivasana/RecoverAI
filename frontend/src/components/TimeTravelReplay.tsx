'use client';

import React, { useState } from 'react';
import { History, Play } from 'lucide-react';
import { runTimeTravelReplay } from '../lib/api';

export const TimeTravelReplay: React.FC = () => {
  const [amount, setAmount] = useState<number>(3499);
  const [method, setMethod] = useState<string>('upi');
  const [failureReason, setFailureReason] = useState<string>('Bank network timeout during UPI PIN authorization');
  const [errorCode, setErrorCode] = useState<string>('GATEWAY_TIMEOUT');
  const [retries, setRetries] = useState<number>(0);
  const [riskScore, setRiskScore] = useState<number>(0.05);

  const [replayData, setReplayData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleRunReplay = async () => {
    setLoading(true);
    try {
      const res = await runTimeTravelReplay({
        override_amount: amount,
        override_payment_method: method,
        override_failure_reason: failureReason,
        override_error_code: errorCode,
        override_retry_count: retries,
        override_risk_score: riskScore,
      });
      setReplayData(res);
    } catch (err) {
      alert('Replay failed: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const loadPreset = (preset: 'SAFE_UPI' | 'HIGH_TICKET' | 'FRAUD_ATTACK' | 'QUOTA_EXHAUST') => {
    if (preset === 'SAFE_UPI') {
      setAmount(3499);
      setMethod('upi');
      setFailureReason('Bank network timeout during UPI PIN authorization');
      setErrorCode('GATEWAY_TIMEOUT');
      setRetries(0);
      setRiskScore(0.05);
    } else if (preset === 'HIGH_TICKET') {
      setAmount(250000);
      setMethod('card');
      setFailureReason('Bank network timeout during 3DS OTP validation');
      setErrorCode('GATEWAY_TIMEOUT');
      setRetries(0);
      setRiskScore(0.12);
    } else if (preset === 'FRAUD_ATTACK') {
      setAmount(85000);
      setMethod('card');
      setFailureReason('Unusual cross-border velocity pattern detected');
      setErrorCode('FRAUD_SUSPECTED');
      setRetries(0);
      setRiskScore(0.92);
    } else if (preset === 'QUOTA_EXHAUST') {
      setAmount(2500);
      setMethod('upi');
      setFailureReason('Bank network timeout');
      setErrorCode('GATEWAY_TIMEOUT');
      setRetries(2);
      setRiskScore(0.08);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div>
          <h2 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Time-Travel Decision Debugger (Section 35)
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Modify input parameters to observe deterministic policy reactions and action routing
          </p>
        </div>

        {/* Presets */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] text-[var(--text-muted)] font-mono mr-1">Presets:</span>
          <button
            onClick={() => loadPreset('SAFE_UPI')}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-[var(--bg-subtle)] border border-[var(--border-main)] hover:bg-[var(--border-main)] text-[var(--text-main)] transition-colors cursor-pointer"
          >
            ₹3.5k UPI
          </button>
          <button
            onClick={() => loadPreset('HIGH_TICKET')}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-[var(--bg-subtle)] border border-[var(--border-main)] hover:bg-[var(--border-main)] text-amber-600 dark:text-amber-300 font-semibold transition-colors cursor-pointer"
          >
            ₹2.5L High-Ticket
          </button>
          <button
            onClick={() => loadPreset('FRAUD_ATTACK')}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-[var(--bg-subtle)] border border-[var(--border-main)] hover:bg-[var(--border-main)] text-rose-600 dark:text-rose-300 font-semibold transition-colors cursor-pointer"
          >
            High Risk
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Inputs */}
        <div className="lg:col-span-4 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-4 space-y-3 shadow-xs">
          <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Transaction Parameters
          </h3>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Transaction Amount (INR)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-[var(--text-main)] font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Payment Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-[var(--text-main)] focus:border-blue-500 focus:outline-none font-mono text-xs"
              >
                <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                <option value="card">Credit / Debit Card</option>
                <option value="netbanking">NetBanking</option>
                <option value="emi">Cardless EMI</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Failure Reason Diagnostic</label>
              <textarea
                value={failureReason}
                rows={2}
                onChange={(e) => setFailureReason(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-[var(--text-main)] focus:border-blue-500 focus:outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Error Code</label>
              <select
                value={errorCode}
                onChange={(e) => setErrorCode(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-[var(--text-main)] font-mono focus:border-blue-500 focus:outline-none text-xs"
              >
                <option value="GATEWAY_TIMEOUT">GATEWAY_TIMEOUT</option>
                <option value="BANK_NETWORK_DOWN">BANK_NETWORK_DOWN</option>
                <option value="INSUFFICIENT_FUNDS">INSUFFICIENT_FUNDS</option>
                <option value="CARD_EXPIRED">CARD_EXPIRED</option>
                <option value="FRAUD_SUSPECTED">FRAUD_SUSPECTED</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Retry Count</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={retries}
                  onChange={(e) => setRetries(Number(e.target.value))}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-[var(--text-main)] font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Risk Score (0–1)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={riskScore}
                  onChange={(e) => setRiskScore(Number(e.target.value))}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-[var(--text-main)] font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleRunReplay}
              disabled={loading}
              className="w-full mt-2 py-2 rounded-md text-xs font-medium bg-[#0066F5] hover:bg-blue-600 text-white transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{loading ? 'Evaluating...' : 'Run Decision Pipeline'}</span>
            </button>
          </div>
        </div>

        {/* Pipeline Output */}
        <div className="lg:col-span-8 space-y-3">
          {replayData ? (
            <div className="space-y-3">
              {/* Summary */}
              <div className="p-3 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md flex items-center justify-between shadow-xs">
                <div className="text-xs font-sans text-[var(--text-main)]">
                  {replayData.delta_summary.explanation}
                </div>
                <span
                  className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                    replayData.replayed_trace.final_outcome === 'EXECUTE'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : replayData.replayed_trace.final_outcome === 'ESCALATE'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  Outcome: {replayData.replayed_trace.final_outcome}
                </span>
              </div>

              {/* Stage 1 */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-3 text-xs space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] pb-1 border-b border-[var(--border-main)]">
                  <span>Stage 1: Failure Diagnostic Analysis</span>
                  <span className="text-[var(--text-main)] font-semibold">{replayData.replayed_trace.stage_1_analysis.failure_type}</span>
                </div>
                <p className="text-[var(--text-main)] text-[11px]">{replayData.replayed_trace.stage_1_analysis.summary}</p>
              </div>

              {/* Stage 2 */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-3 text-xs space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] pb-1 border-b border-[var(--border-main)]">
                  <span>Stage 2: Recovery Strategy Recommendation</span>
                  <span className="text-purple-600 dark:text-purple-400 font-bold">{replayData.replayed_trace.stage_2_planner.recommended_action}</span>
                </div>
                <p className="text-[var(--text-main)] text-[11px]">{replayData.replayed_trace.stage_2_planner.reason}</p>
                <div className="text-[10px] font-mono text-[var(--text-muted)] flex space-x-3 pt-1">
                  <span>Prob: {Math.round(replayData.replayed_trace.stage_2_planner.recovery_probability * 100)}%</span>
                  <span>Expected: ₹{Number(replayData.replayed_trace.stage_2_planner.expected_net_recovery).toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Stage 4: Policy Hard Boundary */}
              <div className={`p-3 rounded-md border text-xs space-y-1.5 shadow-xs ${
                replayData.replayed_trace.stage_4_policy.allowed
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-rose-500/5 border-rose-500/20'
              }`}>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase pb-1 border-b border-[var(--border-main)]">
                  <span className="font-semibold text-[var(--text-main)]">Stage 4: Deterministic Policy Engine</span>
                  <span className={replayData.replayed_trace.stage_4_policy.allowed ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}>
                    {replayData.replayed_trace.stage_4_policy.allowed ? 'APPROVED' : 'BLOCKED'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-[var(--text-muted)]">
                  Rule: {replayData.replayed_trace.stage_4_policy.rule}
                </div>
                <p className="text-[11px] text-[var(--text-main)]">
                  {replayData.replayed_trace.stage_4_policy.reason}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-main)] rounded-md p-10 text-center text-xs text-[var(--text-muted)] font-mono">
              Execute replay to inspect pipeline stages
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
