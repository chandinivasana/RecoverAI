'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Drawer,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Box,
  Amount,
  Badge,
  Button,
  Text,
  Heading,
  Code,
  Divider,
  Spinner,
  Alert,
  useToast,
  StepGroup,
  StepItem,
  StepItemIndicator,
  FileTextIcon,
  SmartphoneIcon,
  CheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  ZapIcon,
} from '@razorpay/blade/components';
import { fetchPaymentDetail, processFullRecovery } from '../lib/api';
import { CustomerRecoveryModal } from './CustomerRecoveryModal';
import { AuditReportModal } from './AuditReportModal';

interface TransactionModalProps {
  paymentId: string | null;
  onClose: () => void;
  onProcessed?: () => void;
}

type StatusFeedbackColor = 'positive' | 'negative' | 'notice' | 'information' | 'neutral';

type CurrencyCode = React.ComponentProps<typeof Amount>['currency'];

const toCurrency = (currency?: string): CurrencyCode => (currency as CurrencyCode) || 'INR';

interface PaymentMetadata {
  past_successful_payments?: number;
  has_messaging_consent?: boolean;
  [key: string]: unknown;
}

interface PaymentSummary {
  payment_id: string;
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  amount: number;
  currency?: string;
  payment_method?: string;
  status?: string;
  failure_reason?: string;
  error_code?: string;
  retry_count?: number;
  amount_recovered?: number;
  risk_score?: number;
  metadata?: PaymentMetadata;
  created_at?: string;
  updated_at?: string;
}

interface RecoveryDecision {
  decision_id?: string;
  failure_type?: string;
  recommended_action?: string;
  recovery_probability?: number;
  risk_level?: string;
  expected_net_recovery?: number;
  action_cost?: number;
  reason?: string;
  signals?: Record<string, unknown>;
  critic_verdict?: string | null;
  critic_notes?: string | null;
  created_at?: string;
}

interface RecoveryExecution {
  execution_id?: string;
  action?: string;
  status?: string;
  result?: string;
  amount_recovered?: number;
  details?: { predicted_probability?: number; [key: string]: unknown };
  executed_at?: string;
}

interface AuditEntry {
  audit_id?: string;
  event_type?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  prev_hash?: string | null;
  entry_hash?: string | null;
}

interface HumanReview {
  review_id?: string;
  status?: string;
  reason?: string;
  risk_level?: string;
  reviewer?: string | null;
  review_notes?: string | null;
  proposed_action?: string;
  created_at?: string;
  resolved_at?: string | null;
}

interface PaymentDetail {
  payment: PaymentSummary;
  decisions?: RecoveryDecision[];
  executions?: RecoveryExecution[];
  audit_trail?: AuditEntry[];
  human_reviews?: HumanReview[];
}

const statusColor = (status?: string): StatusFeedbackColor => {
  switch (status) {
    case 'recovered':
      return 'positive';
    case 'failed':
      return 'negative';
    case 'escalated_to_human':
      return 'notice';
    case 'processing_recovery':
      return 'information';
    // stopped / permanently_failed → neutral gray
    default:
      return 'neutral';
  }
};

const statusIcon = (status?: string) => {
  switch (status) {
    case 'recovered':
      return CheckIcon;
    case 'failed':
      return AlertTriangleIcon;
    case 'escalated_to_human':
    case 'processing_recovery':
      return ClockIcon;
    default:
      return undefined;
  }
};

const executionColor = (status?: string): StatusFeedbackColor => {
  if (!status) return 'neutral';
  const s = status.toUpperCase();
  if (s === 'SUCCESS') return 'positive';
  if (s.includes('FAIL')) return 'negative';
  return 'notice';
};

const reviewColor = (status?: string): StatusFeedbackColor => {
  switch ((status || '').toLowerCase()) {
    case 'approved':
      return 'positive';
    case 'rejected':
      return 'negative';
    case 'pending':
      return 'notice';
    default:
      return 'neutral';
  }
};

const auditEventColor = (eventType?: string): StatusFeedbackColor => {
  const e = (eventType || '').toUpperCase();
  if (e.includes('REFUS') || e.includes('BLOCK') || e.includes('FAIL')) return 'negative';
  if (e.includes('RECOVER') || e.includes('SUCCESS') || e.includes('APPROV')) return 'positive';
  if (e.includes('ESCALAT') || e.includes('REVIEW')) return 'notice';
  return 'information';
};

const humanizeStatus = (status?: string): string => (status ? status.replace(/_/g, ' ') : 'unknown');

const truncateHash = (hash: string): string =>
  hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;

const auditDescription = (metadata?: Record<string, unknown>): string => {
  if (!metadata) return '';
  const candidate = metadata.reason ?? metadata.result ?? metadata.rule;
  if (typeof candidate === 'string') return candidate;
  try {
    return JSON.stringify(metadata);
  } catch {
    return '';
  }
};

const formatTimestamp = (value?: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Heading size="small" weight="semibold" marginBottom="spacing.4">
    {children}
  </Heading>
);

const KeyValueGrid = ({ children }: { children: React.ReactNode }) => (
  <Box display="grid" gridTemplateColumns="160px 1fr" gap="spacing.3" alignItems="center">
    {children}
  </Box>
);

const KeyValueItem = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <Text variant="body" size="small" color="surface.text.gray.muted">
      {label}
    </Text>
    <Box>{children}</Box>
  </>
);

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <Box
    padding="spacing.4"
    backgroundColor="surface.background.gray.subtle"
    borderRadius="medium"
    borderWidth="thin"
    borderColor="surface.border.gray.muted"
    display="flex"
    flexDirection="column"
    gap="spacing.3"
  >
    {children}
  </Box>
);

export const TransactionModal: React.FC<TransactionModalProps> = ({ paymentId, onClose, onProcessed }) => {
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const toast = useToast();

  const loadDetails = useCallback(() => {
    if (!paymentId) return;
    setLoading(true);
    fetchPaymentDetail(paymentId)
      .then((res: PaymentDetail) => setData(res))
      .catch(() => {
        toast.show({ content: 'Failed to load payment details', color: 'negative' });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial detail fetch; setters run post-await
    loadDetails();
  }, [loadDetails]);

  if (!paymentId) return null;

  const handleRunRecovery = async () => {
    setProcessing(true);
    try {
      await processFullRecovery(paymentId);
      toast.show({ content: 'Recovery pipeline completed', color: 'positive', autoDismiss: true });
      loadDetails();
      if (onProcessed) onProcessed();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.show({ content: `Recovery execution failed: ${message}`, color: 'negative' });
    } finally {
      setProcessing(false);
    }
  };

  const payment = data?.payment;
  const decisions = data?.decisions ?? [];
  const executions = data?.executions ?? [];
  const auditTrail = data?.audit_trail ?? [];
  const humanReviews = data?.human_reviews ?? [];
  const consent = payment?.metadata?.has_messaging_consent;
  const StatusBadgeIcon = statusIcon(payment?.status);

  return (
    <>
      <Drawer
        isOpen={Boolean(paymentId)}
        onDismiss={onClose}
        accessibilityLabel="Transaction detailed view"
      >
        <DrawerHeader
          title="Transaction Details"
          subtitle={paymentId}
          color={payment ? statusColor(payment.status) : undefined}
          showDivider={false}
        >
          <Box>
            {payment ? (
              <Box>
                <Box marginTop="spacing.6" textAlign="center">
                  <Amount
                    value={Number(payment.amount) || 0}
                    currency={toCurrency(payment.currency)}
                    size="2xlarge"
                    type="heading"
                    weight="semibold"
                    suffix="decimals"
                  />
                </Box>
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  flexWrap="wrap"
                  gap="spacing.3"
                  marginTop="spacing.4"
                >
                  <Badge
                    size="medium"
                    color={statusColor(payment.status)}
                    emphasis="intense"
                    icon={StatusBadgeIcon}
                  >
                    {humanizeStatus(payment.status)}
                  </Badge>
                  {typeof consent === 'boolean' ? (
                    <Badge
                      size="medium"
                      color={consent ? 'positive' : 'notice'}
                      icon={consent ? CheckIcon : AlertTriangleIcon}
                    >
                      {consent ? 'Messaging consent on file' : 'No messaging consent'}
                    </Badge>
                  ) : null}
                </Box>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  gap="spacing.4"
                  marginTop="spacing.6"
                  paddingX="spacing.4"
                >
                  <Box display="flex">
                    <Divider thickness="thicker" orientation="vertical" />
                    <Box paddingX="spacing.3">
                      <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                        Method
                      </Text>
                      <Text size="medium">{payment.payment_method || '—'}</Text>
                    </Box>
                  </Box>
                  <Box display="flex">
                    <Divider thickness="thicker" orientation="vertical" />
                    <Box paddingX="spacing.3">
                      <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                        Customer
                      </Text>
                      <Text size="medium">{payment.customer_name || '—'}</Text>
                    </Box>
                  </Box>
                </Box>
                <Box display="flex" gap="spacing.3" marginTop="spacing.6">
                  <Button
                    variant="secondary"
                    size="small"
                    icon={FileTextIcon}
                    isFullWidth
                    isDisabled={!data}
                    onClick={() => setShowAuditModal(true)}
                  >
                    Audit PDF
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    icon={SmartphoneIcon}
                    isFullWidth
                    isDisabled={!data}
                    onClick={() => setShowCustomerModal(true)}
                  >
                    Customer View
                  </Button>
                </Box>
              </Box>
            ) : null}
          </Box>
        </DrawerHeader>

        <DrawerBody>
          {loading ? (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              gap="spacing.4"
              paddingY="spacing.11"
            >
              <Spinner accessibilityLabel="Loading transaction details" color="primary" size="large" />
              <Text size="small" color="surface.text.gray.muted">
                Loading transaction audit graph…
              </Text>
            </Box>
          ) : data && payment ? (
            <Box display="flex" flexDirection="column" gap="spacing.6">
              {/* Payment summary */}
              <Box>
                <SectionHeading>Payment Summary</SectionHeading>
                <KeyValueGrid>
                  <KeyValueItem label="Amount">
                    <Amount value={Number(payment.amount) || 0} currency={toCurrency(payment.currency)} />
                  </KeyValueItem>
                  <KeyValueItem label="Amount Recovered">
                    <Amount
                      value={Number(payment.amount_recovered) || 0}
                      currency={toCurrency(payment.currency)}
                      color={
                        Number(payment.amount_recovered) > 0
                          ? 'feedback.text.positive.intense'
                          : undefined
                      }
                    />
                  </KeyValueItem>
                  <KeyValueItem label="Payment ID">
                    <Code size="small">{payment.payment_id}</Code>
                  </KeyValueItem>
                  <KeyValueItem label="Method">
                    <Text variant="body" size="medium">
                      {payment.payment_method || '—'}
                    </Text>
                  </KeyValueItem>
                  <KeyValueItem label="Status">
                    <Badge size="small" color={statusColor(payment.status)} icon={StatusBadgeIcon}>
                      {humanizeStatus(payment.status)}
                    </Badge>
                  </KeyValueItem>
                  <KeyValueItem label="Customer">
                    <Text variant="body" size="medium">
                      {payment.customer_name || '—'}
                      {typeof payment.metadata?.past_successful_payments === 'number'
                        ? ` (${payment.metadata.past_successful_payments} prior txns)`
                        : ''}
                    </Text>
                  </KeyValueItem>
                  <KeyValueItem label="Retry Count">
                    <Text variant="body" size="medium">
                      {payment.retry_count ?? 0}
                    </Text>
                  </KeyValueItem>
                  <KeyValueItem label="Risk Score">
                    <Text variant="body" size="medium">
                      {typeof payment.risk_score === 'number'
                        ? `${Math.round(payment.risk_score * 100)}%`
                        : '—'}
                    </Text>
                  </KeyValueItem>
                </KeyValueGrid>
                {payment.failure_reason ? (
                  <Box marginTop="spacing.4">
                    <Alert
                      color="negative"
                      emphasis="subtle"
                      isDismissible={false}
                      isFullWidth
                      title="Diagnostic failure signal"
                      description={
                        payment.error_code
                          ? `${payment.failure_reason} (error code: ${payment.error_code})`
                          : payment.failure_reason
                      }
                    />
                  </Box>
                ) : null}
              </Box>

              {/* Decisions */}
              {decisions.length > 0 ? (
                <Box>
                  <Divider marginBottom="spacing.5" />
                  <SectionHeading>Agent Decisions</SectionHeading>
                  <Box display="flex" flexDirection="column" gap="spacing.4">
                    {decisions.map((dec, idx) => (
                      <SectionCard key={dec.decision_id || idx}>
                        <Box
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                          flexWrap="wrap"
                          gap="spacing.2"
                        >
                          <Code size="medium" weight="bold">
                            {dec.recommended_action || 'unknown_action'}
                          </Code>
                          {dec.critic_verdict ? (
                            <Badge
                              size="small"
                              color={dec.critic_verdict === 'AGREE' ? 'positive' : 'notice'}
                            >
                              {`Critic: ${dec.critic_verdict}`}
                            </Badge>
                          ) : null}
                        </Box>
                        <Box display="flex" gap="spacing.5" flexWrap="wrap">
                          <Box>
                            <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                              Recovery Probability
                            </Text>
                            <Text size="small" weight="semibold">
                              {typeof dec.recovery_probability === 'number'
                                ? `${Math.round(dec.recovery_probability * 100)}%`
                                : '—'}
                            </Text>
                          </Box>
                          <Box>
                            <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                              Expected Net Recovery
                            </Text>
                            <Amount
                              value={Number(dec.expected_net_recovery) || 0}
                              currency={toCurrency(payment.currency)}
                              type="body"
                              size="small"
                              weight="semibold"
                            />
                          </Box>
                          {dec.risk_level ? (
                            <Box>
                              <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                                Risk Level
                              </Text>
                              <Text size="small" weight="semibold">
                                {dec.risk_level}
                              </Text>
                            </Box>
                          ) : null}
                        </Box>
                        {dec.reason ? (
                          <Text size="small" color="surface.text.gray.subtle">
                            {dec.reason}
                          </Text>
                        ) : null}
                        {dec.critic_notes ? (
                          <Box>
                            <Divider marginBottom="spacing.3" />
                            <Text size="small" color="feedback.text.notice.intense">
                              Critic second opinion: {dec.critic_notes}
                            </Text>
                          </Box>
                        ) : null}
                      </SectionCard>
                    ))}
                  </Box>
                </Box>
              ) : null}

              {/* Executions */}
              {executions.length > 0 ? (
                <Box>
                  <Divider marginBottom="spacing.5" />
                  <SectionHeading>Execution Receipts</SectionHeading>
                  <Box display="flex" flexDirection="column" gap="spacing.4">
                    {executions.map((ex, idx) => (
                      <SectionCard key={ex.execution_id || idx}>
                        <Box
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                          flexWrap="wrap"
                          gap="spacing.2"
                        >
                          <Box display="flex" alignItems="center" gap="spacing.2" flexWrap="wrap">
                            <Code size="small">{ex.execution_id || '—'}</Code>
                            <Text size="small" weight="semibold">
                              {ex.action || '—'}
                            </Text>
                          </Box>
                          <Badge size="small" color={executionColor(ex.status)}>
                            {ex.status || 'unknown'}
                          </Badge>
                        </Box>
                        <Box display="flex" gap="spacing.5" flexWrap="wrap">
                          <Box>
                            <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                              Amount Recovered
                            </Text>
                            <Amount
                              value={Number(ex.amount_recovered) || 0}
                              currency={toCurrency(payment.currency)}
                              type="body"
                              size="small"
                              weight="semibold"
                            />
                          </Box>
                          {typeof ex.details?.predicted_probability === 'number' ? (
                            <Box>
                              <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                                Predicted Probability
                              </Text>
                              <Text size="small" weight="semibold">
                                {`${Math.round(ex.details.predicted_probability * 100)}%`}
                              </Text>
                            </Box>
                          ) : null}
                        </Box>
                        {ex.result ? (
                          <Text size="small" color="surface.text.gray.subtle">
                            {ex.result}
                          </Text>
                        ) : null}
                      </SectionCard>
                    ))}
                  </Box>
                </Box>
              ) : null}

              {/* Audit trail timeline */}
              {auditTrail.length > 0 ? (
                <Box>
                  <Divider marginBottom="spacing.5" />
                  <SectionHeading>Audit Trail</SectionHeading>
                  <StepGroup orientation="vertical" size="medium">
                    {auditTrail.map((aud, idx) => (
                      <StepItem
                        key={aud.audit_id || idx}
                        title={`${aud.event_type || 'EVENT'}${aud.actor ? ` · ${aud.actor}` : ''}`}
                        timestamp={formatTimestamp(aud.timestamp)}
                        description={auditDescription(aud.metadata)}
                        stepProgress="full"
                        marker={<StepItemIndicator color={auditEventColor(aud.event_type)} />}
                      >
                        {aud.prev_hash || aud.entry_hash ? (
                          <Box
                            display="flex"
                            gap="spacing.2"
                            alignItems="center"
                            flexWrap="wrap"
                            marginTop="spacing.2"
                            marginBottom="spacing.3"
                          >
                            {aud.prev_hash ? (
                              <Code size="small">{`prev:${truncateHash(aud.prev_hash)}`}</Code>
                            ) : null}
                            {aud.entry_hash ? (
                              <Code size="small">{`hash:${truncateHash(aud.entry_hash)}`}</Code>
                            ) : null}
                          </Box>
                        ) : null}
                      </StepItem>
                    ))}
                  </StepGroup>
                </Box>
              ) : null}

              {/* Human reviews */}
              {humanReviews.length > 0 ? (
                <Box>
                  <Divider marginBottom="spacing.5" />
                  <SectionHeading>Human Reviews</SectionHeading>
                  <Box display="flex" flexDirection="column" gap="spacing.4">
                    {humanReviews.map((review, idx) => (
                      <SectionCard key={review.review_id || idx}>
                        <Box
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                          flexWrap="wrap"
                          gap="spacing.2"
                        >
                          <Code size="small">{review.review_id || '—'}</Code>
                          <Box display="flex" gap="spacing.2" alignItems="center" flexWrap="wrap">
                            {review.risk_level ? (
                              <Badge size="small" color="neutral">
                                {`Risk: ${review.risk_level}`}
                              </Badge>
                            ) : null}
                            <Badge size="small" color={reviewColor(review.status)}>
                              {humanizeStatus(review.status)}
                            </Badge>
                          </Box>
                        </Box>
                        {review.proposed_action ? (
                          <Box display="flex" gap="spacing.2" alignItems="center" flexWrap="wrap">
                            <Text size="xsmall" color="surface.text.gray.muted" weight="semibold">
                              Proposed action
                            </Text>
                            <Code size="small">{review.proposed_action}</Code>
                          </Box>
                        ) : null}
                        {review.reason ? (
                          <Text size="small" color="surface.text.gray.subtle">
                            {review.reason}
                          </Text>
                        ) : null}
                        {review.reviewer || review.review_notes ? (
                          <Text size="small" color="surface.text.gray.muted">
                            {review.reviewer ? `Reviewer: ${review.reviewer}` : ''}
                            {review.reviewer && review.review_notes ? ' — ' : ''}
                            {review.review_notes || ''}
                          </Text>
                        ) : null}
                      </SectionCard>
                    ))}
                  </Box>
                </Box>
              ) : null}
            </Box>
          ) : (
            <Box paddingY="spacing.8" textAlign="center">
              <Text size="small" color="surface.text.gray.muted">
                No transaction details available.
              </Text>
            </Box>
          )}
        </DrawerBody>

        <DrawerFooter>
          <Box display="flex" justifyContent="space-between" alignItems="center" gap="spacing.4">
            <Text size="xsmall" color="surface.text.gray.muted">
              Fail-closed safety engine enforced
            </Text>
            <Box display="flex" gap="spacing.3">
              <Button variant="tertiary" size="medium" onClick={onClose}>
                Close
              </Button>
              {payment?.status === 'failed' ? (
                <Button
                  variant="primary"
                  size="medium"
                  icon={ZapIcon}
                  isLoading={processing}
                  onClick={handleRunRecovery}
                >
                  Run Full Recovery Pipeline
                </Button>
              ) : null}
            </Box>
          </Box>
        </DrawerFooter>
      </Drawer>

      {/* Customer recovery drawer preview */}
      {showCustomerModal && data && payment && (
        <CustomerRecoveryModal
          payment={{
            payment_id: payment.payment_id,
            customer_name: payment.customer_name || '',
            amount: payment.amount,
            payment_method: payment.payment_method || '',
            failure_reason: payment.failure_reason || '',
          }}
          onClose={() => setShowCustomerModal(false)}
          onRecovered={() => {
            loadDetails();
            if (onProcessed) onProcessed();
          }}
        />
      )}

      {/* Compliance audit report certificate */}
      {showAuditModal && data && (
        <AuditReportModal paymentData={data} onClose={() => setShowAuditModal(false)} />
      )}
    </>
  );
};
