'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Amount,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Heading,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Text,
  useToast,
  CheckCircleIcon,
  PrinterIcon,
} from '@razorpay/blade/components';
import { verifyAuditChain } from '../lib/api';
import type { AuditChainStatus } from '../lib/api';

interface AuditReportModalProps {
  // Full payment-detail payload from GET /api/payments/{id} (shape owned by the
  // backend; typed loosely here on purpose — the report renders defensively).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paymentData: any;
  onClose: () => void;
}

type StatusColor = 'positive' | 'negative' | 'notice' | 'information' | 'neutral';

const statusColor = (status?: string): StatusColor => {
  switch (status) {
    case 'recovered':
    case 'success':
      return 'positive';
    case 'failed':
      return 'negative';
    case 'escalated_to_human':
      return 'notice';
    case 'processing_recovery':
      return 'information';
    case 'stopped':
    case 'permanently_failed':
    default:
      return 'neutral';
  }
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box display="flex" flexDirection="column" gap="spacing.1">
    <Text variant="caption" size="small" color="surface.text.gray.muted">
      {label}
    </Text>
    {children}
  </Box>
);

const HashChip: React.FC<{ label: string; hash?: string | null }> = ({ label, hash }) => {
  if (!hash) return null;
  return (
    <Text variant="caption" size="small" color="surface.text.gray.muted">
      {label} <Code size="small">{`${hash.slice(0, 12)}…${hash.slice(-6)}`}</Code>
    </Text>
  );
};

export const AuditReportModal: React.FC<AuditReportModalProps> = ({ paymentData, onClose }) => {
  const toast = useToast();
  const [chain, setChain] = useState<AuditChainStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [generatedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    let cancelled = false;
    verifyAuditChain()
      .then((status) => {
        if (!cancelled) setChain(status);
      })
      .catch(() => {
        if (!cancelled) {
          setChain(null);
          toast.show({ content: 'Audit chain verification could not be loaded', color: 'negative' });
        }
      })
      .finally(() => {
        if (!cancelled) setIsVerifying(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!paymentData || !paymentData.payment) return null;

  const p = paymentData.payment;
  const decisions = paymentData.decisions || [];
  const executions = paymentData.executions || [];
  const audit = paymentData.audit_trail || [];
  const decision = decisions[0];
  const latestExecution = executions.length > 0 ? executions[executions.length - 1] : null;
  const currency = p.currency || 'INR';

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={true}
      onDismiss={onClose}
      size="large"
      zIndex={1100}
      accessibilityLabel="Compliance and decision audit report"
    >
      <ModalHeader
        title="Compliance & Decision Audit Report"
        subtitle={`Ref: ${p.payment_id}`}
        trailing={
          <Button variant="tertiary" size="small" icon={PrinterIcon} onClick={handlePrint}>
            Print / Save PDF
          </Button>
        }
      />

      <ModalBody>
        <Box display="flex" flexDirection="column" gap="spacing.6">
          {/* Letterhead */}
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="flex-start"
            gap="spacing.4"
            flexWrap="wrap"
          >
            <Box display="flex" flexDirection="column" gap="spacing.1">
              <Heading size="small" as="h3">
                RecoverAI Compliance Engine
              </Heading>
              <Text variant="caption" size="small" color="surface.text.gray.muted">
                Deterministic policy audit for payment recovery decisions
              </Text>
            </Box>
            <Box display="flex" flexDirection="column" alignItems="flex-end" gap="spacing.1">
              <Code size="small">{String(p.payment_id)}</Code>
              <Text variant="caption" size="small" color="surface.text.gray.muted">
                Generated {generatedAt}
              </Text>
            </Box>
          </Box>

          <Divider />

          {/* Section 1: Transaction & Customer Context */}
          <Box display="flex" flexDirection="column" gap="spacing.3">
            <Heading size="small" as="h4">
              1. Transaction & Customer Context
            </Heading>
            <Box
              display="grid"
              gridTemplateColumns={{ base: '1fr 1fr', m: 'repeat(4, 1fr)' }}
              gap="spacing.4"
              padding="spacing.4"
              backgroundColor="surface.background.gray.subtle"
              borderRadius="medium"
            >
              <Fact label="Amount">
                <Amount
                  value={Number(p.amount) || 0}
                  currency={currency}
                  type="body"
                  size="medium"
                  weight="semibold"
                />
              </Fact>
              <Fact label="Customer">
                <Text size="small" weight="medium" truncateAfterLines={1}>
                  {p.customer_name || '—'}
                </Text>
              </Fact>
              <Fact label="Payment Method">
                <Text size="small" weight="medium">
                  {String(p.payment_method || '—').toUpperCase()}
                </Text>
              </Fact>
              <Fact label="Amount Recovered">
                <Amount
                  value={Number(p.amount_recovered) || 0}
                  currency={currency}
                  type="body"
                  size="medium"
                  weight="semibold"
                  color={
                    Number(p.amount_recovered) > 0
                      ? 'feedback.text.positive.intense'
                      : 'surface.text.gray.muted'
                  }
                />
              </Fact>
              <Fact label="Status">
                <Box>
                  <Badge size="small" color={statusColor(p.status)}>
                    {String(p.status || 'unknown')}
                  </Badge>
                </Box>
              </Fact>
            </Box>
          </Box>

          {/* Section 2: Failure Diagnosis & Policy Sign-off */}
          <Box display="flex" flexDirection="column" gap="spacing.3">
            <Heading size="small" as="h4">
              2. Failure Diagnosis & Policy Sign-off
            </Heading>
            <Box
              borderWidth="thin"
              borderColor="surface.border.gray.muted"
              borderRadius="medium"
              padding="spacing.4"
              display="flex"
              flexDirection="column"
              gap="spacing.3"
            >
              <Text size="small">
                <Text as="span" size="small" color="surface.text.gray.muted">
                  Diagnostic reason:{' '}
                </Text>
                <Text as="span" size="small" weight="medium">
                  {p.failure_reason || 'Not recorded'}
                </Text>{' '}
                {p.error_code ? <Code size="small">{String(p.error_code)}</Code> : null}
              </Text>

              {decision ? (
                <>
                  <Divider />
                  <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
                    <Text size="small" color="surface.text.gray.muted">
                      Recommended action
                    </Text>
                    <Badge size="small" color="information">
                      {String(decision.recommended_action)}
                    </Badge>
                    {typeof decision.recovery_probability === 'number' && (
                      <Text size="small" color="surface.text.gray.muted">
                        Est. probability {Math.round(decision.recovery_probability * 100)}%
                      </Text>
                    )}
                  </Box>
                  {decision.reason && (
                    <Text size="small" color="surface.text.gray.subtle">
                      Rationale: {decision.reason}
                    </Text>
                  )}
                  {decision.critic_verdict && (
                    <Text size="small" color="surface.text.gray.subtle">
                      Critic verdict: {decision.critic_verdict}
                    </Text>
                  )}
                </>
              ) : (
                <Text size="small" color="surface.text.gray.muted">
                  No recovery decision recorded for this payment.
                </Text>
              )}

              {latestExecution && (
                <>
                  <Divider />
                  <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
                    <Text size="small" color="surface.text.gray.muted">
                      Policy-gated execution
                    </Text>
                    <Code size="small">{String(latestExecution.action)}</Code>
                    <Badge size="small" color={statusColor(latestExecution.status)}>
                      {String(latestExecution.status || 'unknown')}
                    </Badge>
                    {Number(latestExecution.amount_recovered) > 0 && (
                      <Amount
                        value={Number(latestExecution.amount_recovered)}
                        currency={currency}
                        type="body"
                        size="small"
                        weight="semibold"
                        color="feedback.text.positive.intense"
                      />
                    )}
                  </Box>
                  {latestExecution.result && (
                    <Text size="small" color="surface.text.gray.subtle">
                      Result: {latestExecution.result}
                    </Text>
                  )}
                </>
              )}
            </Box>
          </Box>

          {/* Section 3: Tamper-Evident SHA-256 Audit Chain */}
          <Box display="flex" flexDirection="column" gap="spacing.3">
            <Heading size="small" as="h4">
              3. Tamper-Evident SHA-256 Audit Chain
            </Heading>

            {isVerifying ? (
              <Box display="flex" alignItems="center" padding="spacing.3">
                <Spinner
                  accessibilityLabel="Verifying audit chain"
                  label="Verifying audit chain…"
                  size="medium"
                  color="primary"
                />
              </Box>
            ) : chain ? (
              chain.intact ? (
                <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
                  <Badge color="positive" emphasis="subtle" icon={CheckCircleIcon} size="medium">
                    {`AUDIT CHAIN INTACT · ${chain.chained_events} events`}
                  </Badge>
                  <HashChip label="head" hash={chain.head_hash} />
                  {chain.unchained_legacy_events > 0 && (
                    <Text variant="caption" size="small" color="surface.text.gray.muted">
                      {chain.unchained_legacy_events} legacy events predate the chain
                    </Text>
                  )}
                </Box>
              ) : (
                <Alert
                  color="negative"
                  emphasis="intense"
                  isDismissible={false}
                  isFullWidth
                  title="Audit chain broken"
                  description={
                    chain.first_broken_link
                      ? `First broken link at position ${chain.first_broken_link.position} — audit ${chain.first_broken_link.audit_id} (${chain.first_broken_link.event_type}): ${chain.first_broken_link.reason}`
                      : 'The SHA-256 hash chain failed verification.'
                  }
                />
              )
            ) : (
              <Alert
                color="negative"
                isDismissible={false}
                isFullWidth
                title="Chain verification unavailable"
                description="The audit verification API could not be reached — no integrity status is claimed for this report."
              />
            )}

            {audit.length === 0 ? (
              <Text size="small" color="surface.text.gray.muted">
                No audit events recorded for this payment.
              </Text>
            ) : (
              <Box
                borderWidth="thin"
                borderColor="surface.border.gray.muted"
                borderRadius="medium"
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- backend-owned audit event shape */}
                {audit.map((a: any, i: number) => (
                  <Box key={a.audit_id || i}>
                    {i > 0 && <Divider />}
                    <Box
                      padding="spacing.3"
                      display="flex"
                      gap="spacing.3"
                      alignItems="baseline"
                      flexWrap="wrap"
                    >
                      <Text variant="caption" size="small" color="surface.text.gray.muted">
                        {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '—'}
                      </Text>
                      <Badge size="small" color="information">
                        {String(a.actor || 'system')}
                      </Badge>
                      <Box flex="1" minWidth="200px" display="flex" flexDirection="column" gap="spacing.1">
                        <Text size="small">
                          <Text as="span" size="small" weight="semibold">
                            {a.event_type}
                          </Text>
                          {': '}
                          {a.metadata?.reason ||
                            a.metadata?.result ||
                            a.metadata?.rule ||
                            JSON.stringify(a.metadata ?? {})}
                        </Text>
                        <HashChip label="hash" hash={a.entry_hash} />
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </ModalBody>

      <ModalFooter>
        <Box display="flex" justifyContent="flex-end" width="100%">
          <Button variant="tertiary" onClick={onClose}>
            Close
          </Button>
        </Box>
      </ModalFooter>
    </Modal>
  );
};
