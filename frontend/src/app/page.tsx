'use client';

import React, { useState, useEffect } from 'react';
import { AppShell, ActiveView } from '../components/AppShell';
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
  // The app is fully API-driven and client-rendered; skipping SSR output for
  // the shell avoids hydration mismatches from locale-dependent formatting
  // (Blade's Amount uses i18nify, which needs the browser).
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional SSR mount gate
  useEffect(() => setMounted(true), []);

  const [activeTab, setActiveTab] = useState<ActiveView>('dashboard');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<string>(''); // '' = all merchants
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; setters run post-await
    loadReviews();
    const interval = setInterval(loadReviews, 10000);
    return () => clearInterval(interval);
  }, []);

  const pendingCount = reviews.filter((r) => r.status === 'PENDING').length;

  if (!mounted) return null;

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      pendingReviewsCount={pendingCount}
      selectedMerchantId={selectedMerchant}
      onSelectMerchant={setSelectedMerchant}
      isTestMode={isTestMode}
      onToggleTestMode={() => setIsTestMode(!isTestMode)}
      onOpenCustomerPreview={() => setShowCustomerPreview(true)}
    >
      {activeTab === 'dashboard' && (
        <Dashboard
          onSelectPayment={(id) => setSelectedPaymentId(id)}
          onNavigateToReviews={() => setActiveTab('reviews')}
          merchantId={selectedMerchant}
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

      {selectedPaymentId && (
        <TransactionModal
          paymentId={selectedPaymentId}
          onClose={() => setSelectedPaymentId(null)}
          onProcessed={loadReviews}
        />
      )}

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
    </AppShell>
  );
}
