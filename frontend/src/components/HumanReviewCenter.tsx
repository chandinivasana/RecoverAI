'use client';

import React, { useState } from 'react';
import { CheckCircle2, Eye, ShieldAlert } from 'lucide-react';
import { HumanReviewItem } from '../types';
import { approveReview, rejectReview } from '../lib/api';

interface HumanReviewCenterProps {
  reviews: HumanReviewItem[];
  onRefresh: () => void;
  onSelectPayment: (paymentId: string) => void;
}

export const HumanReviewCenter: React.FC<HumanReviewCenterProps> = ({ reviews, onRefresh, onSelectPayment }) => {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const filteredReviews = reviews.filter((r) => {
    if (filter === 'ALL') return true;
    return r.status === filter;
  });

  const handleApprove = async (reviewId: string) => {
    setActionLoading(reviewId);
    try {
      await approveReview(reviewId, 'Approved by Merchant Risk Officer');
      onRefresh();
    } catch (err) {
      alert('Error approving review: ' + err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reviewId: string) => {
    setActionLoading(reviewId);
    try {
      await rejectReview(reviewId, 'Rejected by Merchant Risk Officer — halted.');
      onRefresh();
    } catch (err) {
      alert('Error rejecting review: ' + err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md shadow-xs">
        <div>
          <h2 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Escalation Triage Queue (Section 17)
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Transactions blocked by deterministic safety rules requiring human risk officer sign-off
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-[var(--bg-subtle)] p-1 rounded-md border border-[var(--border-main)]">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                filter === tab
                  ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              {tab} ({reviews.filter((r) => tab === 'ALL' || r.status === tab).length})
            </button>
          ))}
        </div>
      </div>

      {/* Review Queue Items */}
      <div className="space-y-3">
        {filteredReviews.length === 0 ? (
          <div className="text-center py-12 bg-[var(--bg-card)] border border-dashed border-[var(--border-main)] rounded-md">
            <div className="text-xs font-semibold text-[var(--text-muted)]">Queue is clear</div>
            <p className="text-[11px] text-[var(--text-dim)] mt-0.5">No transactions currently flagged in this status.</p>
          </div>
        ) : (
          filteredReviews.map((rev) => (
            <div
              key={rev.review_id}
              className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-4 space-y-3 shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-main)]">
                <div className="flex items-center space-x-2.5">
                  <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {rev.payment_id}
                  </span>
                  <span className="text-xs text-[var(--text-main)]">
                    {rev.customer_name}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono">
                    • {rev.payment_method}
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-sm font-bold text-[var(--text-main)] font-mono">
                    ₹{Number(rev.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                      rev.status === 'PENDING'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : rev.status === 'APPROVED'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-main)]'
                    }`}
                  >
                    {rev.status}
                  </span>
                </div>
              </div>

              {/* Reason Box */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                <div className="md:col-span-8 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md p-3 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase font-semibold text-amber-600 dark:text-amber-400">
                    Policy Block Reason
                  </div>
                  <p className="text-[11px] text-[var(--text-main)] leading-relaxed">
                    {rev.reason}
                  </p>
                  <div className="text-[11px] text-[var(--text-muted)] pt-1">
                    Diagnostic: {rev.failure_reason}
                  </div>
                </div>

                <div className="md:col-span-4 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md p-3 flex flex-col justify-between text-[11px] font-mono space-y-1">
                  <div>
                    <span className="text-[var(--text-muted)]">Risk Profile: </span>
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">{rev.risk_level}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Prior Orders: </span>
                    <span className="text-[var(--text-main)]">{rev.customer_context?.past_successful_payments || 0}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Proposed Strategy: </span>
                    <span className="text-purple-600 dark:text-purple-400 font-semibold">{rev.proposed_action}</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-2">
                <button
                  onClick={() => onSelectPayment(rev.payment_id)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 font-mono transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect Decision Audit Graph</span>
                </button>

                {rev.status === 'PENDING' && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleReject(rev.review_id)}
                      disabled={actionLoading === rev.review_id}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-subtle)] hover:bg-[var(--border-main)] text-[var(--text-main)] border border-[var(--border-main)] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Reject & Safe Stop
                    </button>
                    <button
                      onClick={() => handleApprove(rev.review_id)}
                      disabled={actionLoading === rev.review_id}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center space-x-1 disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{actionLoading === rev.review_id ? 'Executing...' : 'Approve Execution'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
