'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Box,
  Text,
  Amount,
  Button,
  Badge,
  Alert,
  Code,
  RadioGroup,
  Radio,
  InfoGroup,
  InfoItem,
  InfoItemKey,
  InfoItemValue,
  useToast,
  CheckCircleIcon,
  ArrowRightIcon,
  ShieldIcon,
} from '@razorpay/blade/components';
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

type RecoveryRail = 'upi' | 'netbanking' | 'link';

const railLabels: Record<RecoveryRail, string> = {
  upi: 'UPI',
  netbanking: 'NetBanking',
  link: 'Payment link',
};

export const CustomerRecoveryModal: React.FC<CustomerRecoveryModalProps> = ({
  payment,
  onClose,
  onRecovered,
}) => {
  const [selectedRail, setSelectedRail] = useState<RecoveryRail>('upi');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const toast = useToast();

  const handlePay = async (): Promise<void> => {
    setProcessing(true);
    try {
      await processFullRecovery(payment.payment_id);
      setSuccess(true);
      toast.show({
        content: `Recovery processed via ${railLabels[selectedRail]}`,
        color: 'positive',
      });
      if (onRecovered) onRecovered();
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (err) {
      toast.show({
        content: err instanceof Error ? err.message : 'Recovery attempt failed',
        color: 'negative',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onDismiss={onClose}
      size="small"
      zIndex={1100}
      accessibilityLabel="Customer checkout preview"
    >
      <ModalHeader
        title="Customer checkout preview"
        subtitle="What your customer sees when retrying a failed payment"
        trailing={<Badge color="information">Demo</Badge>}
      />
      <ModalBody>
        {success ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap="spacing.4"
            paddingY="spacing.7"
          >
            <CheckCircleIcon size="2xlarge" color="feedback.icon.positive.intense" />
            <Text size="large" weight="semibold">
              Payment successful
            </Text>
            <Amount
              value={payment.amount}
              type="heading"
              size="large"
              weight="semibold"
              currency="INR"
            />
            <Text size="small" color="surface.text.gray.muted" textAlign="center">
              Recovery processed via {railLabels[selectedRail]} for{' '}
              <Code size="small">{payment.payment_id}</Code>
            </Text>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap="spacing.5" paddingTop="spacing.4">
            <Alert
              color="negative"
              emphasis="subtle"
              isDismissible={false}
              title="Your payment didn't go through"
              description="Retry securely or pick another method below."
            />

            <InfoGroup itemOrientation="horizontal" size="small" valueAlign="right">
              <InfoItem>
                <InfoItemKey>Amount</InfoItemKey>
                <InfoItemValue>
                  <Amount value={payment.amount} weight="semibold" size="medium" currency="INR" />
                </InfoItemValue>
              </InfoItem>
              <InfoItem>
                <InfoItemKey>Customer</InfoItemKey>
                <InfoItemValue>{payment.customer_name}</InfoItemValue>
              </InfoItem>
              <InfoItem>
                <InfoItemKey>Failed method</InfoItemKey>
                <InfoItemValue>{payment.payment_method.toUpperCase()}</InfoItemValue>
              </InfoItem>
              <InfoItem>
                <InfoItemKey>Failure reason</InfoItemKey>
                <InfoItemValue>{payment.failure_reason}</InfoItemValue>
              </InfoItem>
              <InfoItem>
                <InfoItemKey>Payment ID</InfoItemKey>
                <InfoItemValue>
                  <Code size="small">{payment.payment_id}</Code>
                </InfoItemValue>
              </InfoItem>
            </InfoGroup>

            <RadioGroup
              label="Pay again using"
              name="recovery-rail"
              value={selectedRail}
              onChange={({ value }) => setSelectedRail(value as RecoveryRail)}
              isDisabled={processing}
            >
              <Radio value="upi" helpText="Google Pay, PhonePe, Paytm and other UPI apps">
                UPI
              </Radio>
              <Radio value="netbanking" helpText="Pay directly from your bank account">
                NetBanking
              </Radio>
              <Radio value="link" helpText="Get a link on SMS or WhatsApp and finish on your phone">
                Payment link
              </Radio>
            </RadioGroup>
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          width="100%"
          gap="spacing.4"
        >
          <Box display="flex" alignItems="center" gap="spacing.2">
            <ShieldIcon size="small" color="surface.icon.gray.subtle" />
            <Text size="xsmall" color="surface.text.gray.muted">
              Demo preview — no real money moves
            </Text>
          </Box>
          {success ? (
            <Button variant="tertiary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <Box display="flex" gap="spacing.3">
              <Button variant="tertiary" onClick={onClose} isDisabled={processing}>
                Cancel
              </Button>
              <Button
                icon={ArrowRightIcon}
                iconPosition="right"
                isLoading={processing}
                onClick={handlePay}
              >
                Retry payment
              </Button>
            </Box>
          )}
        </Box>
      </ModalFooter>
    </Modal>
  );
};
