'use client';

import React, { useEffect, useState } from 'react';
import { X, Smartphone, FileText, Shield, CheckCircle2 } from 'lucide-react';
import { fetchPaymentDetail, processFullRecovery } from '../lib/api';
import { CustomerRecoveryModal } from './CustomerRecoveryModal';
import { AuditReportModal } from './AuditReportModal';

interface TransactionModalProps {
  paymentId: string | null;
  onClose: () => void;
  onProcessed?: () => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ paymentId, onClose, onProcessed }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const loadDetails = () => {
    if (paymentId) {
      setLoading(true);
      fetchPaymentDetail(paymentId)
        .then((res) => setData(res))
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadDetails();
  }, [paymentId]);

  if (!paymentId) return null;

  const handleRunRecovery = async () => {
    setProcessing(true);
    try {
      await processFullRecovery(paymentId);
      loadDetails();
      if (onProcessed) onProcessed();
    } catch (err) {
      alert('Recovery execution failed: ' + err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl overflow-hidden font-sans">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-main)] bg-[var(--bg-subtle)]">
            <div className="flex items-center space-x-2.5">
              <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                {paymentId}
              </span>
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-main)]">
                {data?.payment?.status}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                DPDP Verified
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAuditModal(true)}
                className="px-2.5 py-1 rounded text-xs font-medium bg-[var(--bg-card)] hover:bg-[var(--border-main)] text-[var(--text-main)] border border-[var(--border-main)] transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <FileText className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span>Audit PDF</span>
              </button>

              <button
                onClick={() => setShowCustomerModal(true)}
                className="px-2.5 py-1 rounded text-xs font-medium bg-[var(--bg-card)] hover:bg-[var(--border-main)] text-purple-600 dark:text-purple-400 border border-[var(--border-main)] transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <Smartphone className="w-3 h-3" />
                <span>Customer View</span>
              </button>

              <button
                onClick={onClose}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-main)] transition-colors cursor-pointer ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {loading ? (
              <div className="text-center py-16 text-[var(--text-muted)] font-mono">
                Loading transaction audit graph...
              </div>
            ) : data ? (
              <>
                {/* Overview Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                  <div className="bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3 rounded-md">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase">Amount</div>
                    <div className="text-sm font-bold text-[var(--text-main)] mt-0.5">
                      ₹{Number(data.payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mt-0.5">{data.payment.payment_method}</div>
                  </div>

                  <div className="bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3 rounded-md font-sans">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase font-mono">Customer</div>
                    <div className="text-xs font-semibold text-[var(--text-main)] mt-0.5 truncate">{data.payment.customer_name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">{data.payment.metadata?.past_successful_payments || 0} prior txns</div>
                  </div>

                  <div className="bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3 rounded-md">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase">Risk Score</div>
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                      {Math.round((data.payment.risk_score || 0.1) * 100)}%
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {data.payment.amount > 25000 ? 'High value' : 'Standard'}
                    </div>
                  </div>

                  <div className="bg-[var(--bg-subtle)] border border-[var(--border-main)] p-3 rounded-md">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase">Settled Recovery</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ₹{Number(data.payment.amount_recovered).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Retries: {data.payment.retry_count} / 2</div>
                  </div>
                </div>

                {/* Diagnostic Box */}
                <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md space-y-1">
                  <div className="text-[10px] font-mono uppercase text-rose-600 dark:text-rose-400 font-semibold">
                    Diagnostic Failure Signal
                  </div>
                  <div className="text-xs text-[var(--text-main)] font-sans">{data.payment.failure_reason}</div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">Error Code: {data.payment.error_code}</div>
                </div>

                {/* Decisions List */}
                {data.decisions && data.decisions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-semibold">
                      Agent Decision & Telemetry
                    </div>
                    {data.decisions.map((dec: any, idx: number) => (
                      <div key={dec.decision_id || idx} className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-purple-600 dark:text-purple-400 font-semibold">
                            Recommended Action: {dec.recommended_action}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            Prob: {Math.round(dec.recovery_probability * 100)}% • Net: ₹{Number(dec.expected_net_recovery).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-main)] font-sans leading-relaxed">
                          {dec.reason}
                        </p>
                        {dec.critic_notes && (
                          <div className="text-[11px] font-mono text-amber-700 dark:text-amber-300 pt-1 border-t border-[var(--border-main)]">
                            Critic Second Opinion: {dec.critic_notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Executions */}
                {data.executions && data.executions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-semibold">
                      Execution Receipts
                    </div>
                    {data.executions.map((ex: any, idx: number) => (
                      <div key={ex.execution_id || idx} className="p-2.5 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md text-xs space-y-1">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-[var(--text-main)]">{ex.execution_id} ({ex.action})</span>
                          <span className={ex.status === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
                            {ex.status}
                          </span>
                        </div>
                        <p className="text-[var(--text-muted)] text-[11px] font-sans">{ex.result}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Audit Log */}
                {data.audit_trail && data.audit_trail.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-semibold">
                      Chronological Audit Trail (Section 20)
                    </div>
                    <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md space-y-2">
                      {data.audit_trail.map((aud: any, idx: number) => (
                        <div key={aud.audit_id || idx} className="flex items-start space-x-2 font-mono text-[10px]">
                          <span className="text-[var(--text-muted)]">
                            {new Date(aud.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">[{aud.actor}]</span>
                          <div className="flex-1 text-[var(--text-main)] font-sans text-[11px]">
                            <span className="font-semibold">{aud.event_type}: </span>
                            {aud.metadata?.reason || aud.metadata?.result || aud.metadata?.rule || JSON.stringify(aud.metadata)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[var(--border-main)] bg-[var(--bg-subtle)] flex items-center justify-between">
            <span className="text-[11px] font-mono text-[var(--text-muted)]">Fail-Closed Safety Engine Enforced</span>
            <div className="flex space-x-2">
              {data?.payment?.status === 'failed' && (
                <button
                  onClick={handleRunRecovery}
                  disabled={processing}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#0066F5] hover:bg-blue-600 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {processing ? 'Running...' : 'Run Pipeline'}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-card)] hover:bg-[var(--border-main)] text-[var(--text-main)] border border-[var(--border-main)] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Recovery Drawer Preview */}
      {showCustomerModal && data && (
        <CustomerRecoveryModal
          payment={{
            payment_id: data.payment.payment_id,
            customer_name: data.payment.customer_name,
            amount: data.payment.amount,
            payment_method: data.payment.payment_method,
            failure_reason: data.payment.failure_reason,
          }}
          onClose={() => setShowCustomerModal(false)}
          onRecovered={() => {
            loadDetails();
            if (onProcessed) onProcessed();
          }}
        />
      )}

      {/* Compliance Audit Report Certificate Modal */}
      {showAuditModal && data && (
        <AuditReportModal
          paymentData={data}
          onClose={() => setShowAuditModal(false)}
        />
      )}
    </>
  );
};
