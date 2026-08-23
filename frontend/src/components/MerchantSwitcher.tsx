'use client';

import React, { useState, useEffect } from 'react';
import { Store, ChevronDown, Check } from 'lucide-react';

interface Merchant {
  merchant_id: string;
  merchant_name: string;
  industry: string;
  autonomous_amount_cap: number;
}

interface MerchantSwitcherProps {
  selectedMerchantId: string;
  onSelectMerchant: (merchantId: string) => void;
}

export const MerchantSwitcher: React.FC<MerchantSwitcherProps> = ({
  selectedMerchantId,
  onSelectMerchant,
}) => {
  const [merchants, setMerchants] = useState<Merchant[]>([
    {
      merchant_id: 'merch_swiggy_ind',
      merchant_name: 'Swiggy India (Quick Commerce)',
      industry: 'Food & Delivery',
      autonomous_amount_cap: 5000,
    },
    {
      merchant_id: 'merch_urban_comp',
      merchant_name: 'Urban Company (Services & AMC)',
      industry: 'Home Services',
      autonomous_amount_cap: 25000,
    },
    {
      merchant_id: 'merch_tata_lux',
      merchant_name: 'Tata Luxury (High-Ticket Retail)',
      industry: 'Luxury Retail',
      autonomous_amount_cap: 100000,
    },
  ]);

  const [isOpen, setIsOpen] = useState(false);

  const active = merchants.find((m) => m.merchant_id === selectedMerchantId) || merchants[1];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] hover:bg-[var(--border-main)] border border-[var(--border-main)] text-xs text-[var(--text-main)] transition-colors cursor-pointer"
      >
        <Store className="w-3.5 h-3.5 text-[#0066F5]" />
        <span className="font-semibold text-xs truncate max-w-[140px] sm:max-w-[200px]">{active.merchant_name}</span>
        <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-1.5 w-64 rounded-md bg-[var(--bg-card)] border border-[var(--border-main)] shadow-xl z-50 py-1 font-sans text-xs">
            <div className="px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-main)]">
              Select Isolated Merchant Tenant
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
                </div>
                {m.merchant_id === active.merchant_id && (
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
