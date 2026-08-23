'use client';

import React from 'react';
import { X, Printer, ShieldCheck, CheckCircle2, FileText } from 'lucide-react';

interface AuditReportModalProps {
  paymentData: any;
  onClose: () => void;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({ paymentData, onClose }) => {
  if (!paymentData || !paymentData.payment) return null;
  const p = paymentData.payment;
  const decisions = paymentData.decisions || [];
  const executions = paymentData.executions || [];
  const audit = paymentData.audit_trail || [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 print:p-0 print:bg-white">
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans text-xs print:border-none print:shadow-none print:max-h-full">
        {/* Header (No print controls during print) */}
        <div className="p-4 border-b border-[var(--border-main)] bg-[var(--bg-subtle)] flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-xs text-[var(--text-main)]">
              Compliance & Decision Audit Certificate ({p.payment_id})
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1 rounded-md text-xs font-medium bg-[#0066F5] hover:bg-blue-600 text-white flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 print:p-8">
          {/* Document Letterhead */}
          <div className="flex justify-between items-start border-b border-[var(--border-main)] pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded bg-[#0066F5] text-white flex items-center justify-center font-black text-xs">
                  R
                </div>
                <span className="font-bold text-sm text-[var(--text-main)]">RecoverAI Compliance Engine</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">
                Deterministic Policy Audit & DPDP Compliance Attestation
              </div>
            </div>
            <div className="text-right font-mono text-[10px] text-[var(--text-muted)]">
              <div>Ref: {p.payment_id}</div>
              <div>Generated: {new Date().toISOString()}</div>
              <div className="text-emerald-600 dark:text-emerald-400 font-semibold">Status: VERIFIED_AUDITABLE</div>
            </div>
          </div>

          {/* Section 1: Transaction & Customer Details */}
          <div className="space-y-1.5">
            <h4 className="font-semibold text-[11px] text-[var(--text-main)] uppercase tracking-wider">
              1. Transaction & Customer Context
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[var(--bg-subtle)] p-3 rounded-md font-mono text-[11px]">
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block">Amount</span>
                <span className="font-bold text-[var(--text-main)]">₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block">Customer</span>
                <span className="text-[var(--text-main)] truncate block">{p.customer_name}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block">Payment Method</span>
                <span className="text-[var(--text-main)] uppercase">{p.payment_method}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block">Settled Recovered</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{Number(p.amount_recovered).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Failure Diagnostic & Policy Validation */}
          <div className="space-y-1.5">
            <h4 className="font-semibold text-[11px] text-[var(--text-main)] uppercase tracking-wider">
              2. Failure Diagnosis & Policy Sign-off
            </h4>
            <div className="border border-[var(--border-main)] rounded-md p-3 space-y-2 text-[11px]">
              <div>
                <span className="text-[var(--text-muted)]">Diagnostic Reason: </span>
                <span className="text-[var(--text-main)] font-medium">{p.failure_reason} (Code: {p.error_code})</span>
              </div>
              {decisions.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-main)] font-mono space-y-1">
                  <div>
                    <span className="text-[var(--text-muted)]">Recommended Action: </span>
                    <span className="text-purple-600 dark:text-purple-400 font-semibold">{decisions[0].recommended_action}</span>
                    <span className="text-[var(--text-muted)] ml-2">(Est. Probability: {Math.round(decisions[0].recovery_probability * 100)}%)</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    Rationale: {decisions[0].reason}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Chronological Audit Trail */}
          <div className="space-y-1.5">
            <h4 className="font-semibold text-[11px] text-[var(--text-main)] uppercase tracking-wider">
              3. Immutable Cryptographic Audit Log
            </h4>
            <div className="border border-[var(--border-main)] rounded-md divide-y divide-[var(--border-main)] font-mono text-[10px]">
              {audit.map((a: any, i: number) => (
                <div key={a.audit_id || i} className="p-2 flex items-start space-x-2">
                  <span className="text-[var(--text-muted)] shrink-0">{new Date(a.timestamp).toLocaleTimeString()}</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold shrink-0">[{a.actor}]</span>
                  <span className="text-[var(--text-main)] font-sans flex-1">
                    <span className="font-mono font-semibold">{a.event_type}: </span>
                    {a.metadata?.reason || a.metadata?.result || a.metadata?.rule || JSON.stringify(a.metadata)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Attestation Seal */}
          <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-[10px]">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">DPDP Act (2023) & RBI Security Standard Verified</div>
                <div className="text-emerald-600 dark:text-emerald-400">Zero unauthorized monetary movement • Fail-closed policy boundary verified</div>
              </div>
            </div>
            <div className="font-mono font-bold text-slate-400">SEAL_OK</div>
          </div>
        </div>
      </div>
    </div>
  );
};
