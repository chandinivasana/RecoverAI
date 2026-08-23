'use client';

import React, { useState } from 'react';
import { X, CheckCircle2, Shield, Smartphone, CreditCard, Building, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import { processFullRecovery } from '../lib/api';

interface CustomerRecoveryModalProps {
  payment: {
    payment_id: string;
    customer_name: string;
    amount: number;
    payment_method: string;
    failure_reason: string;
  };
  onClose: () => void;
  onRecovered?: () => void;
}

export const CustomerRecoveryModal: React.FC<CustomerRecoveryModalProps> = ({
  payment,
  onClose,
  onRecovered,
}) => {
  const [selectedRail, setSelectedRail] = useState<'upi' | 'netbanking' | 'link'>('upi');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const handlePay = async () => {
    setProcessing(true);
    try {
      await processFullRecovery(payment.payment_id);
      setSuccess(true);
      if (onRecovered) onRecovered();
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (err) {
      alert('Simulated recovery error: ' + err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      {/* Mobile Mockup Card - Razorpay Blade Design Language */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl font-sans text-xs">
        {/* Top Razorpay Blade Header */}
        <div className="bg-[#0C2340] text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-[#0C8CE9] flex items-center justify-center font-bold text-xs text-white">
              R
            </div>
            <div>
              <div className="font-bold text-xs tracking-tight">Razorpay Checkout Recovery</div>
              <div className="text-[10px] text-blue-200">Secured with 256-bit encryption</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Payment Amount & Diagnostic Alert */}
        <div className="p-4 bg-[var(--bg-subtle)] border-b border-[var(--border-main)] space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-[var(--text-muted)]">Pay to Merchant</span>
            <span className="text-xl font-bold font-mono text-[var(--text-main)]">
              ₹{Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-600 dark:text-rose-400">
            <div className="font-semibold">Payment Incomplete on {payment.payment_method.toUpperCase()}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{payment.failure_reason}</div>
          </div>
        </div>

        {/* Smart Rails Selector */}
        <div className="p-4 space-y-3">
          {success ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="font-bold text-sm text-[var(--text-main)]">Payment Successful!</div>
              <p className="text-[11px] text-[var(--text-muted)]">
                ₹{Number(payment.amount).toLocaleString('en-IN')} settled via {selectedRail.toUpperCase()}. Receipt sent to your phone.
              </p>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-semibold text-[var(--text-main)] uppercase tracking-wider">
                Select Smart Recovery Rail
              </div>

              {/* Option 1: 1-Click UPI */}
              <div
                onClick={() => setSelectedRail('upi')}
                className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                  selectedRail === 'upi'
                    ? 'border-[#0066F5] bg-blue-500/5'
                    : 'border-[var(--border-main)] bg-[var(--bg-card)] hover:border-[var(--border-subtle)]'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Smartphone className="w-4 h-4 text-[#0066F5]" />
                  <div>
                    <div className="font-semibold text-[var(--text-main)]">1-Click UPI AutoPay (Recommended)</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Google Pay, PhonePe, Paytm • 98% Success</div>
                  </div>
                </div>
                <div className="w-3.5 h-3.5 rounded-full border border-[var(--border-main)] flex items-center justify-center">
                  {selectedRail === 'upi' && <div className="w-2 h-2 rounded-full bg-[#0066F5]" />}
                </div>
              </div>

              {/* Option 2: NetBanking */}
              <div
                onClick={() => setSelectedRail('netbanking')}
                className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                  selectedRail === 'netbanking'
                    ? 'border-[#0066F5] bg-blue-500/5'
                    : 'border-[var(--border-main)] bg-[var(--bg-card)] hover:border-[var(--border-subtle)]'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Building className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-semibold text-[var(--text-main)]">Direct NetBanking</div>
                    <div className="text-[10px] text-[var(--text-muted)]">HDFC, ICICI, SBI, Axis • Zero Timeout Risk</div>
                  </div>
                </div>
                <div className="w-3.5 h-3.5 rounded-full border border-[var(--border-main)] flex items-center justify-center">
                  {selectedRail === 'netbanking' && <div className="w-2 h-2 rounded-full bg-[#0066F5]" />}
                </div>
              </div>

              {/* Option 3: Dynamic Payment Link */}
              <div
                onClick={() => setSelectedRail('link')}
                className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                  selectedRail === 'link'
                    ? 'border-[#0066F5] bg-blue-500/5'
                    : 'border-[var(--border-main)] bg-[var(--bg-card)] hover:border-[var(--border-subtle)]'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <CreditCard className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <div>
                    <div className="font-semibold text-[var(--text-main)]">SMS / WhatsApp 1-Click Link</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Pay later on your mobile browser (DPDP Consent Verified)</div>
                  </div>
                </div>
                <div className="w-3.5 h-3.5 rounded-full border border-[var(--border-main)] flex items-center justify-center">
                  {selectedRail === 'link' && <div className="w-2 h-2 rounded-full bg-[#0066F5]" />}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handlePay}
                disabled={processing}
                className="w-full mt-3 py-2.5 rounded-lg bg-[#0066F5] hover:bg-[#0052cc] text-white font-semibold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-md disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing with Razorpay...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Payment of ₹{Number(payment.amount).toLocaleString('en-IN')}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Blade Footer */}
        <div className="px-4 py-2.5 bg-[var(--bg-subtle)] border-t border-[var(--border-main)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
          <div className="flex items-center space-x-1">
            <Shield className="w-3 h-3 text-emerald-500" />
            <span>DPDP Compliant Recovery</span>
          </div>
          <span>Razorpay Platform</span>
        </div>
      </div>
    </div>
  );
};
