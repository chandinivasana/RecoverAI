'use client';

import React, { useState, useEffect } from 'react';
import { Store, ChevronDown, Check, Layers } from 'lucide-react';
import { fetchMerchants, MerchantProfile } from '../lib/api';

interface MerchantSwitcherProps {
  selectedMerchantId: string; // '' = all merchants
  onSelectMerchant: (merchantId: string) => void;
}

// Static fallback while the live profiles load (identity fields only — every
// metric shown comes from the backend, computed per-merchant from real rows).
const FALLBACK_MERCHANTS: MerchantProfile[] = [
  {
    merchant_id: 'merch_swiggy_ind',
    merchant_name: 'Swiggy India (Quick Commerce)',
    industry: 'Food & Delivery',
    autonomous_amount_cap: 5000,
    currency: 'INR',
    payments_count: 0,
    revenue_at_risk: 0,
    revenue_recovered: 0,
    avg_recovery_rate: 0,
  },
  {
    merchant_id: 'merch_urban_comp',
    merchant_name: 'Urban Company (Services & AMC)',
    industry: 'Home Services',
    autonomous_amount_cap: 25000,
    currency: 'INR',
    payments_count: 0,
    revenue_at_risk: 0,
    revenue_recovered: 0,
    avg_recovery_rate: 0,
  },
  {
    merchant_id: 'merch_tata_lux',
    merchant_name: 'Tata Luxury (High-Ticket Retail)',
    industry: 'Luxury Retail',
    autonomous_amount_cap: 100000,
    currency: 'INR',
    payments_count: 0,
    revenue_at_risk: 0,
    revenue_recovered: 0,
    avg_recovery_rate: 0,
  },
];

export const MerchantSwitcher: React.FC<MerchantSwitcherProps> = ({
  selectedMerchantId,
  onSelectMerchant,
}) => {
  const [merchants, setMerchants] = useState<MerchantProfile[]>(FALLBACK_MERCHANTS);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchMerchants()
      .then(setMerchants)
      .catch((err) => console.error('Failed to load merchant profiles:', err));
  }, []);

  const active = merchants.find((m) => m.merchant_id === selectedMerchantId);
  const activeName = active ? active.merchant_name : 'All Merchants';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] hover:bg-[var(--border-main)] border border-[var(--border-main)] text-xs text-[var(--text-main)] transition-colors cursor-pointer"
      >
        <Store className="w-3.5 h-3.5 text-[#0066F5]" />
        <span className="font-semibold text-xs truncate max-w-[140px] sm:max-w-[200px]">{activeName}</span>
        <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-1.5 w-72 rounded-md bg-[var(--bg-card)] border border-[var(--border-main)] shadow-xl z-50 py-1 font-sans text-xs">
            <div className="px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-main)]">
              Merchant Tenant Isolation
            </div>

            <div
              onClick={() => {
                onSelectMerchant('');
                setIsOpen(false);
              }}
              className="px-3 py-2 hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center justify-between transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <div>
                  <div className="font-semibold text-[var(--text-main)]">All Merchants</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">Aggregated portfolio view</div>
                </div>
              </div>
              {selectedMerchantId === '' && <Check className="w-3.5 h-3.5 text-[#0066F5]" />}
            </div>

            {merchants.map((m) => (
              <div
                key={m.merchant_id}
                onClick={() => {
                  onSelectMerchant(m.merchant_id);
                  setIsOpen(false);
                }}
                className="px-3 py-2 hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-semibold text-[var(--text-main)]">{m.merchant_name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                    Cap: ₹{m.autonomous_amount_cap.toLocaleString('en-IN')} • {m.industry}
                  </div>
                  {m.payments_count > 0 && (
                    <div className="text-[10px] text-[var(--text-dim)] font-mono">
                      {m.payments_count} txns • {m.avg_recovery_rate}% recovered (live)
                    </div>
                  )}
                </div>
                {m.merchant_id === selectedMerchantId && (
                  <Check className="w-3.5 h-3.5 text-[#0066F5]" />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
