'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Text,
  Button,
  Menu,
  MenuOverlay,
  MenuHeader,
  MenuItem,
  BuildingIcon,
  CheckIcon,
  ChevronDownIcon,
} from '@razorpay/blade/components';
import { fetchMerchants, MerchantProfile } from '../lib/api';

interface MerchantSwitcherProps {
  selectedMerchantId: string; // '' = all merchants
  onSelectMerchant: (merchantId: string) => void;
}

// Static fallback while live profiles load (identity fields only — every
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

  useEffect(() => {
    fetchMerchants()
      .then(setMerchants)
      .catch((err) => console.error('Failed to load merchant profiles:', err));
  }, []);

  const active = merchants.find((m) => m.merchant_id === selectedMerchantId);
  const activeName = active ? active.merchant_name : 'All Merchants';

  return (
    <Menu openInteraction="click">
      <Button
        variant="tertiary"
        size="small"
        icon={BuildingIcon}
        iconPosition="left"
        accessibilityLabel={`Merchant: ${activeName}`}
      >
        {activeName}
      </Button>
      <MenuOverlay>
        <MenuHeader title="Merchant tenant isolation" subtitle="Every view filters to the selected tenant" />
        <MenuItem
          title="All Merchants"
          leading={selectedMerchantId === '' ? <CheckIcon size="small" /> : <ChevronDownIcon size="small" />}
          onClick={() => onSelectMerchant('')}
        />
        {merchants.map((m) => (
          <MenuItem
            key={m.merchant_id}
            title={m.merchant_name}
            leading={m.merchant_id === selectedMerchantId ? <CheckIcon size="small" /> : <BuildingIcon size="small" />}
            onClick={() => onSelectMerchant(m.merchant_id)}
          />
        ))}
        <Box paddingX="spacing.4" paddingY="spacing.2">
          <Text size="xsmall" color="surface.text.gray.muted">
            {merchants.some((m) => m.payments_count > 0)
              ? `Live: ${merchants.map((m) => `${m.merchant_name.split(' ')[0]} ${m.avg_recovery_rate}%`).join(' · ')}`
              : 'Per-tenant metrics load from live data'}
          </Text>
        </Box>
      </MenuOverlay>
    </Menu>
  );
};
