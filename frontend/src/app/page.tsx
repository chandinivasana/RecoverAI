'use client';

import React, { useState, useEffect } from 'react';
import { RazorpaySidebar, ActiveView } from '../components/RazorpaySidebar';
import { RazorpayTopNav } from '../components/RazorpayTopNav';
import { Dashboard } from '../components/Dashboard';
import { HumanReviewCenter } from '../components/HumanReviewCenter';
import { PolicySimulator } from '../components/PolicySimulator';
import { TimeTravelReplay } from '../components/TimeTravelReplay';
import { RedTeamLab } from '../components/RedTeamLab';
import { EvaluationView } from '../components/EvaluationView';
import { TransactionModal } from '../components/TransactionModal';
import { CustomerRecoveryModal } from '../components/CustomerRecoveryModal';
import { fetchHumanReviews } from '../lib/api';
import { HumanReviewItem } from '../types';

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveView>('dashboard');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<string>('merch_urban_comp');
  const [isTestMode, setIsTestMode] = useState<boolean>(true);
  const [showCustomerPreview, setShowCustomerPreview] = useState<boolean>(false);
  const [reviews, setReviews] = useState<HumanReviewItem[]>([]);

  const loadReviews = async () => {
    try {
      const res = await fetchHumanReviews();
      setReviews(res.reviews || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadReviews();
    const interval = setInterval(loadReviews, 10000);
    return () => clearInterval(interval);
  }, []);

  const pendingCount = reviews.filter((r) => r.status === 'PENDING').length;

  const merchantNames: Record<string, string> = {
    merch_swiggy_ind: 'Swiggy India',
    merch_urban_comp: 'Urban Company',
    merch_tata_lux: 'Tata Luxury',
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] flex flex-row font-sans antialiased selection:bg-[#0C8CE9] selection:text-white transition-colors duration-150">
      {/* 1. Razorpay Official Left Sidebar */}
      <RazorpaySidebar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        pendingReviewsCount={pendingCount}
        onOpenCustomerPreview={() => setShowCustomerPreview(true)}
        isTestMode={isTestMode}
        onToggleTestMode={() => setIsTestMode(!isTestMode)}
        merchantName={merchantNames[selectedMerchant] || 'Urban Company'}
      />

      {/* 2. Main Dashboard Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Razorpay Top Navigation */}
        <RazorpayTopNav
          currentTab={activeTab}
          selectedMerchantId={selectedMerchant}
          onSelectMerchant={(id) => setSelectedMerchant(id)}
          pendingReviewsCount={pendingCount}
          onOpenReviews={() => setActiveTab('reviews')}
          onOpenCustomerPreview={() => setShowCustomerPreview(true)}
        />

        {/* Dynamic Content Body */}
        <main className="max-w-[1440px] w-full mx-auto px-6 py-6 flex-1 space-y-6">
          {activeTab === 'dashboard' && (
            <Dashboard
              onSelectPayment={(id) => setSelectedPaymentId(id)}
              onNavigateToReviews={() => setActiveTab('reviews')}
            />
          )}

          {activeTab === 'reviews' && (
            <HumanReviewCenter
              reviews={reviews}
              onRefresh={loadReviews}
              onSelectPayment={(id) => setSelectedPaymentId(id)}
            />
          )}

          {activeTab === 'policies' && <PolicySimulator />}

          {activeTab === 'replay' && <TimeTravelReplay />}

          {activeTab === 'redteam' && <RedTeamLab />}

          {activeTab === 'evaluation' && <EvaluationView />}
        </main>

        {/* Subtle Razorpay Blade Footer */}
        <footer className="border-t border-[var(--border-main)] bg-[var(--bg-header)] py-3 px-6 text-xs text-[var(--text-muted)] transition-colors duration-150">
          <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Razorpay RecoverAI Engine • Autonomous Decisioning with Fail-Closed Policies</span>
            </div>
            <div className="font-mono text-[10px] text-[var(--text-dim)]">
              DPDP Act (2023) Compliant • Track 3: AI Revenue Recovery
            </div>
          </div>
        </footer>
      </div>

      {/* Detail Transaction Modal */}
      {selectedPaymentId && (
        <TransactionModal
          paymentId={selectedPaymentId}
          onClose={() => setSelectedPaymentId(null)}
          onProcessed={loadReviews}
        />
      )}

      {/* Customer Blade Recovery Drawer Mockup */}
      {showCustomerPreview && (
        <CustomerRecoveryModal
          payment={{
            payment_id: 'pay_demo_preview',
            customer_name: 'Priya Sharma',
            amount: 3499.0,
            payment_method: 'card',
            failure_reason: 'Bank network timeout during 3DS authorization',
          }}
          onClose={() => setShowCustomerPreview(false)}
          onRecovered={loadReviews}
        />
      )}
    </div>
  );
}
