'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, Eye, Search, Zap, ArrowUpRight
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { DashboardKPIs, PaymentItem, StrategyStat, AuditEvent, AnomalyItem } from '../types';
import {
  fetchKPIs, fetchTimeseries, fetchStrategies, fetchPayments,
  fetchAgentFeed, fetchAnomalies, processFullRecovery, batchProcessRecoveries
} from '../lib/api';
import { AgentActivityFeed } from './AgentActivityFeed';
import { ABExperimentWidget } from './ABExperimentWidget';

interface DashboardProps {
  onSelectPayment: (paymentId: string) => void;
  onNavigateToReviews: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectPayment, onNavigateToReviews }) => {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<StrategyStat[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [feed, setFeed] = useState<AuditEvent[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [singleProcessing, setSingleProcessing] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const loadData = async () => {
    try {
      const [kpiRes, tsRes, stratRes, payRes, feedRes, anomRes] = await Promise.all([
        fetchKPIs(),
        fetchTimeseries(),
        fetchStrategies(),
        fetchPayments({ status: statusFilter || undefined, payment_method: methodFilter || undefined, search: search || undefined, limit: 15 }),
        fetchAgentFeed(15),
        fetchAnomalies(),
      ]);
      setKpis(kpiRes);
      setTimeseries(tsRes);
      setStrategies(stratRes);
      setPayments(payRes.payments || []);
      setFeed(feedRes || []);
      setAnomalies(anomRes || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [statusFilter, methodFilter, search]);

  const handleRunSingleRecovery = async (paymentId: string) => {
    setSingleProcessing(paymentId);
    try {
      await processFullRecovery(paymentId);
      await loadData();
    } catch (err) {
      alert('Error running recovery: ' + err);
    } finally {
      setSingleProcessing(null);
    }
  };

  const handleBatchProcess = async () => {
    setBatchProcessing(true);
    try {
      await batchProcessRecoveries(10, 'dev');
      await loadData();
    } catch (err) {
      alert('Batch recovery error: ' + err);
    } finally {
      setBatchProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'recovered':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Recovered
          </span>
        );
      case 'escalated_to_human':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Escalated
          </span>
        );
      case 'stopped':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-main)]">
            Stopped
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            Failed
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Telemetry Alert if Anomaly Detected */}
      {anomalies.length > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-amber-600 dark:text-amber-300">Gateway Telemetry Alert: </span>
              <span className="text-[var(--text-main)]">{anomalies[0].message}</span>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-200 border border-amber-500/30 font-semibold">
            {anomalies[0].recommended_action}
          </span>
        </div>
      )}

      {/* Top Asymmetric KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Revenue at Risk */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md flex flex-col justify-between shadow-xs">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Revenue at Risk
            </div>
            <div className="text-2xl font-bold text-[var(--text-main)] font-mono tabular-nums mt-1.5">
              ₹{kpis ? Number(kpis.revenue_at_risk).toLocaleString('en-IN') : '0'}
            </div>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono mt-3">
            {kpis?.total_failed_transactions || 0} failed transactions
          </div>
        </div>

        {/* Revenue Recovered */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md flex flex-col justify-between shadow-xs">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Revenue Recovered
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1.5">
              ₹{kpis ? Number(kpis.revenue_recovered).toLocaleString('en-IN') : '0'}
            </div>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono mt-3">
            {kpis?.recovered_transactions_count || 0} settled autonomously
          </div>
        </div>

        {/* Recovery Rate */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md flex flex-col justify-between shadow-xs">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Recovery Rate
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums mt-1.5">
              {kpis?.recovery_rate_percent || 0}%
            </div>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono mt-3">
            Primary optimization metric
          </div>
        </div>

        {/* Human Escalations */}
        <div
          onClick={onNavigateToReviews}
          className="bg-[var(--bg-card)] border border-[var(--border-main)] hover:border-amber-500/50 p-4 rounded-md flex flex-col justify-between cursor-pointer transition-colors shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              <span>Human Escalations</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums mt-1.5">
              {kpis?.pending_human_escalations || 0}
            </div>
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono mt-3 font-medium">
            Pending operator review →
          </div>
        </div>
      </div>

      {/* Main Split: Primary Chart (8 col) + Agent Stream (4 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Chart Panel */}
        <div className="lg:col-span-8 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-5 flex flex-col justify-between space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
                Revenue Recovery Performance
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">Failed volume at risk vs. actual settled recovery (INR)</p>
            </div>

            <button
              onClick={handleBatchProcess}
              disabled={batchProcessing}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#0066F5] hover:bg-blue-600 text-white transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{batchProcessing ? 'Executing Batch...' : 'Batch Process 10 Txns'}</span>
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRecovered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 2" stroke="var(--border-main)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} tickFormatter={(val) => `₹${val > 100000 ? (val/100000).toFixed(1)+'L' : val}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-main)' }}
                />
                <Area type="monotone" dataKey="revenue_at_risk" name="Revenue at Risk" stroke="#f43f5e" strokeWidth={1.5} fillOpacity={1} fill="url(#colorRisk)" />
                <Area type="monotone" dataKey="revenue_recovered" name="Revenue Recovered" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorRecovered)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Decision Feed */}
        <div className="lg:col-span-4">
          <AgentActivityFeed events={feed} onSelectPayment={onSelectPayment} />
        </div>
      </div>

      {/* Recovery Strategy Performance Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-5 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
              Strategy Attribution & Efficiency (Section 23)
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">Bounded action yield and settled recovery metrics</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-main)] text-[var(--text-muted)] uppercase text-[10px] tracking-wider">
                <th className="py-2.5 font-semibold">Strategy Rail</th>
                <th className="py-2.5 font-semibold">Attempts</th>
                <th className="py-2.5 font-semibold">Settled</th>
                <th className="py-2.5 font-semibold">Conversion</th>
                <th className="py-2.5 font-semibold text-right">Recovered Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-main)] font-mono">
              {strategies.map((st) => (
                <tr key={st.strategy} className="hover:bg-[var(--table-hover)] transition-colors">
                  <td className="py-2.5 font-medium text-[var(--text-main)]">{st.strategy}</td>
                  <td className="py-2.5 text-[var(--text-muted)]">{st.attempts}</td>
                  <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">{st.recoveries}</td>
                  <td className="py-2.5 text-blue-600 dark:text-blue-400 font-semibold">{st.recovery_rate_percent}%</td>
                  <td className="py-2.5 text-right font-bold text-[var(--text-main)]">
                    ₹{Number(st.revenue_recovered).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live A/B Strategy Performance Experiments */}
      <ABExperimentWidget />

      {/* Transactions Data Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
              Payment Events & Transaction Stream
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">Failed payment ingestion log and agent action states</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search ID, customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md pl-7 pr-3 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="failed">Failed</option>
              <option value="recovered">Recovered</option>
              <option value="escalated_to_human">Escalated</option>
              <option value="stopped">Stopped</option>
            </select>

            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border-main)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:outline-none"
            >
              <option value="">All Methods</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="netbanking">NetBanking</option>
              <option value="emi">EMI</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-main)] text-[var(--text-muted)] uppercase text-[10px] tracking-wider">
                <th className="py-2.5 font-semibold">Payment ID</th>
                <th className="py-2.5 font-semibold">Customer</th>
                <th className="py-2.5 font-semibold">Method</th>
                <th className="py-2.5 font-semibold">Amount</th>
                <th className="py-2.5 font-semibold">Diagnostic Failure Reason</th>
                <th className="py-2.5 font-semibold">Status</th>
                <th className="py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-main)] font-mono">
              {payments.map((p) => (
                <tr key={p.payment_id} className="hover:bg-[var(--table-hover)] transition-colors">
                  <td className="py-2.5 text-blue-600 dark:text-blue-400 font-medium">
                    <button
                      onClick={() => onSelectPayment(p.payment_id)}
                      className="hover:underline cursor-pointer"
                    >
                      {p.payment_id}
                    </button>
                  </td>
                  <td className="py-2.5 text-[var(--text-main)] font-sans">{p.customer_name}</td>
                  <td className="py-2.5 text-[var(--text-muted)] uppercase text-[11px]">{p.payment_method}</td>
                  <td className="py-2.5 font-bold text-[var(--text-main)]">
                    ₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 text-[var(--text-muted)] max-w-xs truncate font-sans text-[11px]">
                    {p.failure_reason}
                  </td>
                  <td className="py-2.5 font-sans">{getStatusBadge(p.status)}</td>
                  <td className="py-2.5 text-right font-sans">
                    {p.status === 'failed' ? (
                      <button
                        onClick={() => handleRunSingleRecovery(p.payment_id)}
                        disabled={singleProcessing === p.payment_id}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#0066F5] hover:bg-blue-600 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {singleProcessing === p.payment_id ? 'Running...' : 'Recover'}
                      </button>
                    ) : (
                      <button
                        onClick={() => onSelectPayment(p.payment_id)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-subtle)] hover:bg-[var(--border-main)] text-[var(--text-main)] border border-[var(--border-main)] transition-colors cursor-pointer"
                      >
                        Inspect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
