import { PolicyConfig } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchKPIs() {
  const res = await fetch(`${API_BASE}/api/analytics/kpis`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch KPIs');
  return res.json();
}

export async function fetchTimeseries() {
  const res = await fetch(`${API_BASE}/api/analytics/timeseries`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch timeseries');
  return res.json();
}

export async function fetchStrategies() {
  const res = await fetch(`${API_BASE}/api/analytics/strategies`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch strategies');
  return res.json();
}

export async function fetchAnomalies() {
  const res = await fetch(`${API_BASE}/api/analytics/anomalies`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch anomalies');
  return res.json();
}

export async function fetchAgentFeed(limit: number = 15) {
  const res = await fetch(`${API_BASE}/api/analytics/feed?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch feed');
  return res.json();
}

export async function fetchPayments(params: {
  status?: string;
  dataset_split?: string;
  payment_method?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.dataset_split) query.set('dataset_split', params.dataset_split);
  if (params.payment_method) query.set('payment_method', params.payment_method);
  if (params.search) query.set('search', params.search);
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.offset) query.set('offset', params.offset.toString());

  const res = await fetch(`${API_BASE}/api/payments?${query.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch payments');
  return res.json();
}

export async function fetchPaymentDetail(paymentId: string) {
  const res = await fetch(`${API_BASE}/api/payments/${paymentId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch payment detail');
  return res.json();
}

export async function processFullRecovery(paymentId: string) {
  const res = await fetch(`${API_BASE}/api/recovery/${paymentId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to process recovery');
  return res.json();
}

export async function batchProcessRecoveries(limit: number = 10, split: string = 'dev') {
  const res = await fetch(`${API_BASE}/api/recovery/batch-process?limit=${limit}&dataset_split=${split}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to batch process recoveries');
  return res.json();
}

export async function fetchPolicies(): Promise<PolicyConfig> {
  const res = await fetch(`${API_BASE}/api/policies`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch policies');
  return res.json();
}

export async function updatePolicies(config: PolicyConfig): Promise<PolicyConfig> {
  const res = await fetch(`${API_BASE}/api/policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to update policies');
  return res.json();
}

export async function simulatePolicy(proposedConfig: PolicyConfig, split: string = 'dev') {
  const res = await fetch(`${API_BASE}/api/policies/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposed_config: proposedConfig, dataset_split: split }),
  });
  if (!res.ok) throw new Error('Failed to simulate policy');
  return res.json();
}

export async function fetchHumanReviews(status?: string) {
  const query = status ? `?status=${status}` : '';
  const res = await fetch(`${API_BASE}/api/reviews${query}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch reviews');
  return res.json();
}

export async function approveReview(reviewId: string, notes?: string, overrideAction?: string) {
  const res = await fetch(`${API_BASE}/api/reviews/${reviewId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer: 'Merchant Ops Admin', notes: notes || 'Approved manually', override_action: overrideAction }),
  });
  if (!res.ok) {
    // Surface hard-policy refusals (HTTP 409) verbatim — "even humans cannot
    // override the injection defense" is a feature, not a generic failure.
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || 'Failed to approve review');
  }
  return res.json();
}

export async function rejectReview(reviewId: string, notes?: string) {
  const res = await fetch(`${API_BASE}/api/reviews/${reviewId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer: 'Merchant Ops Admin', notes: notes || 'Rejected manually' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || 'Failed to reject review');
  }
  return res.json();
}

export async function runEvaluation(split: string = 'eval') {
  const res = await fetch(`${API_BASE}/api/evaluation/run?dataset_split=${split}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to run evaluation benchmark');
  return res.json();
}

export async function runTimeTravelReplay(payload: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to run time-travel replay');
  return res.json();
}

export async function fetchRedTeamScenarios() {
  const res = await fetch(`${API_BASE}/api/redteam/scenarios`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch redteam scenarios');
  return res.json();
}

export async function runRedTeamAttack(scenarioId: string) {
  const res = await fetch(`${API_BASE}/api/redteam/run?scenario_id=${scenarioId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to run redteam scenario');
  return res.json();
}
