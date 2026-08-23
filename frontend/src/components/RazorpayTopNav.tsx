'use client';

import React from 'react';
import { Search, Bell, Shield, Activity, ExternalLink, HelpCircle } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { MerchantSwitcher } from './MerchantSwitcher';

interface RazorpayTopNavProps {
  currentTab: string;
  selectedMerchantId: string;
  onSelectMerchant: (merchantId: string) => void;
  pendingReviewsCount: number;
  onOpenReviews: () => void;
  onOpenCustomerPreview: () => void;
}

export const RazorpayTopNav: React.FC<RazorpayTopNavProps> = ({
  currentTab,
  selectedMerchantId,
  onSelectMerchant,
  pendingReviewsCount,
  onOpenReviews,
  onOpenCustomerPreview,
}) => {
  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'Revenue Recovery & Strategy Dashboard';
      case 'reviews': return 'Escalation Triage Queue';
      case 'policies': return 'Deterministic Policy Engine & ROI Simulator';
      case 'replay': return 'Time-Travel Decision Debugger';
      case 'redteam': return 'Adversarial Red-Team Safety Lab';
      case 'evaluation': return 'Held-Out Benchmark & Confidence Calibration';
      default: return 'Payment Recovery Platform';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--bg-header)] border-b border-[var(--border-main)] backdrop-blur-xs font-sans transition-colors duration-150">
      <div className="px-6 h-14 flex items-center justify-between gap-4">
        {/* Left Breadcrumb & Current Context */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-[var(--text-muted)] font-medium">Razorpay</span>
          <span className="text-[var(--text-dim)]">/</span>
          <span className="text-[var(--text-muted)] font-medium">RecoverAI</span>
          <span className="text-[var(--text-dim)]">/</span>
          <span className="text-[var(--text-main)] font-semibold truncate max-w-[200px] sm:max-w-none">
            {getTabLabel(currentTab)}
          </span>
        </div>

        {/* Center Global Search (Razorpay Style) */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search payments, customers, failure reasons (Press ⌘K)..."
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-md pl-8 pr-12 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#0C8CE9] transition-colors"
            />
            <kbd className="absolute right-2.5 top-2 px-1.5 py-0.2 text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border-main)] rounded">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right Actions & Utilities */}
        <div className="flex items-center space-x-3">
          {/* Multi-Tenant Merchant Selector */}
          <MerchantSwitcher
            selectedMerchantId={selectedMerchantId}
            onSelectMerchant={onSelectMerchant}
          />

          {/* Policy Telemetry Chip */}
          <div className="hidden xl:flex items-center space-x-1.5 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
            <Shield className="w-3 h-3" />
            <span>Policy Engine: Active</span>
          </div>

          {/* Notification / Escalation Bell */}
          <button
            onClick={onOpenReviews}
            className="relative p-2 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer border border-[var(--border-main)]"
            title="Escalations Queue"
          >
            <Bell className="w-3.5 h-3.5" />
            {pendingReviewsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold font-mono">
                {pendingReviewsCount}
              </span>
            )}
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
