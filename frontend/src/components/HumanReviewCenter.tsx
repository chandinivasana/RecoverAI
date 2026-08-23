'use client';

import React, { useState } from 'react';
import {
  Amount,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardHeaderBadge,
  CardHeaderLeading,
  CardHeaderTrailing,
  CheckCircleIcon,
  Code,
  Counter,
  EmptyState,
  EyeIcon,
  Heading,
  Link,
  MessageCircleIcon,
  SendIcon,
  StopCircleIcon,
  TabItem,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextInput,
  useToast,
} from '@razorpay/blade/components';
import { HumanReviewItem } from '../types';
import { approveReview, rejectReview, explainRefusal, RefusalExplanation } from '../lib/api';

interface HumanReviewCenterProps {
  reviews: HumanReviewItem[];
  onRefresh: () => void;
  onSelectPayment: (paymentId: string) => void;
}

type ReviewFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const FILTERS: ReviewFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

const statusBadgeColor = (
  status: HumanReviewItem['status'],
): 'notice' | 'positive' | 'neutral' => {
  if (status === 'PENDING') return 'notice';
  if (status === 'APPROVED') return 'positive';
  return 'neutral';
};

const riskBadgeColor = (
  riskLevel: string,
): 'negative' | 'notice' | 'positive' | 'neutral' => {
  const level = (riskLevel || '').toUpperCase();
  if (level === 'HIGH' || level === 'CRITICAL') return 'negative';
  if (level === 'MEDIUM') return 'notice';
  if (level === 'LOW') return 'positive';
  return 'neutral';
};

const filterCounterColor = (
  tab: ReviewFilter,
): 'notice' | 'positive' | 'neutral' | 'information' => {
  if (tab === 'PENDING') return 'notice';
  if (tab === 'APPROVED') return 'positive';
  if (tab === 'REJECTED') return 'neutral';
  return 'information';
};

export const HumanReviewCenter: React.FC<HumanReviewCenterProps> = ({
  reviews,
  onRefresh,
  onSelectPayment,
}) => {
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState<{
    id: string;
    kind: 'approve' | 'reject';
  } | null>(null);
  const [qnaOpenFor, setQnaOpenFor] = useState<string | null>(null);
  const [qnaQuestion, setQnaQuestion] = useState('');
  const [qnaLoading, setQnaLoading] = useState(false);
  const [qnaAnswer, setQnaAnswer] = useState<RefusalExplanation | null>(null);

  const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

  const handleAsk = async (reviewId: string): Promise<void> => {
    if (qnaQuestion.trim().length < 3) return;
    setQnaLoading(true);
    setQnaAnswer(null);
    try {
      const result = await explainRefusal(reviewId, qnaQuestion.trim());
      setQnaAnswer(result);
    } catch (err) {
      toast.show({
        content: `Could not explain refusal: ${errorMessage(err)}`,
        color: 'negative',
      });
    } finally {
      setQnaLoading(false);
    }
  };

  const toggleQna = (reviewId: string): void => {
    if (qnaOpenFor === reviewId) {
      setQnaOpenFor(null);
    } else {
      setQnaOpenFor(reviewId);
      setQnaQuestion('');
      setQnaAnswer(null);
    }
  };

  const handleApprove = async (reviewId: string): Promise<void> => {
    setActionLoading({ id: reviewId, kind: 'approve' });
    try {
      await approveReview(reviewId, 'Approved by Merchant Risk Officer');
      toast.show({
        content: 'Execution approved — recovery will proceed.',
        color: 'positive',
        autoDismiss: true,
      });
      onRefresh();
    } catch (err) {
      // A hard policy rule can refuse even human sign-off (HTTP 409). The API
      // layer surfaces the rule-naming detail verbatim — show it in full and
      // keep it on screen until dismissed.
      toast.show({
        content: `Approval refused by policy: ${errorMessage(err)}`,
        color: 'negative',
        autoDismiss: false,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reviewId: string): Promise<void> => {
    setActionLoading({ id: reviewId, kind: 'reject' });
    try {
      await rejectReview(reviewId, 'Rejected by Merchant Risk Officer — halted.');
      toast.show({
        content: 'Review rejected — recovery safely stopped.',
        color: 'neutral',
        autoDismiss: true,
      });
      onRefresh();
    } catch (err) {
      toast.show({
        content: `Could not reject review: ${errorMessage(err)}`,
        color: 'negative',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const providerChipLabel = (answer: RefusalExplanation): string => {
    const label =
      answer.provider === 'anthropic'
        ? 'LLM · Claude'
        : answer.degraded
        ? 'deterministic fallback'
        : 'deterministic';
    return answer.latency_ms > 0 ? `${label} · ${answer.latency_ms}ms` : label;
  };

  const renderReviewCard = (rev: HumanReviewItem): React.ReactElement => {
    const isActing = actionLoading?.id === rev.review_id;
    return (
      <Card key={rev.review_id} padding="spacing.5" elevation="lowRaised">
        <CardHeader>
          <CardHeaderLeading
            title={rev.customer_name}
            subtitle={`${rev.payment_id} · ${rev.payment_method}`}
          />
          <CardHeaderTrailing
            visual={
              <CardHeaderBadge color={statusBadgeColor(rev.status)}>
                {rev.status}
              </CardHeaderBadge>
            }
          />
        </CardHeader>
        <CardBody>
          <Box display="flex" flexDirection="column" gap="spacing.4">
            {/* Amount + risk / strategy context */}
            <Box
              display="flex"
              flexDirection="row"
              flexWrap="wrap"
              justifyContent="space-between"
              alignItems="center"
              gap="spacing.3"
            >
              <Amount
                value={rev.amount}
                currency="INR"
                type="heading"
                size="large"
                weight="semibold"
              />
              <Box
                display="flex"
                flexDirection="row"
                flexWrap="wrap"
                alignItems="center"
                gap="spacing.4"
              >
                <Box display="flex" flexDirection="row" alignItems="center" gap="spacing.2">
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Risk profile
                  </Text>
                  <Badge color={riskBadgeColor(rev.risk_level)} size="small">
                    {rev.risk_level}
                  </Badge>
                </Box>
                <Box display="flex" flexDirection="row" alignItems="center" gap="spacing.2">
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Prior orders
                  </Text>
                  <Text size="small" weight="semibold">
                    {String(rev.customer_context?.past_successful_payments || 0)}
                  </Text>
                </Box>
                <Box display="flex" flexDirection="row" alignItems="center" gap="spacing.2">
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Proposed strategy
                  </Text>
                  <Code size="small">{rev.proposed_action}</Code>
                </Box>
              </Box>
            </Box>

            {/* Policy block reason */}
            <Box
              backgroundColor="surface.background.gray.subtle"
              borderRadius="medium"
              padding="spacing.4"
              display="flex"
              flexDirection="column"
              gap="spacing.2"
            >
              <Text size="xsmall" weight="semibold" color="feedback.text.notice.intense">
                Policy block reason
              </Text>
              <Text size="small">{rev.reason}</Text>
              <Text size="xsmall" color="surface.text.gray.muted">
                Diagnostic: {rev.failure_reason}
              </Text>
            </Box>

            {/* Actions footer */}
            <Box
              display="flex"
              flexDirection="row"
              flexWrap="wrap"
              justifyContent="space-between"
              alignItems="center"
              gap="spacing.3"
            >
              <Box
                display="flex"
                flexDirection="row"
                flexWrap="wrap"
                alignItems="center"
                gap="spacing.5"
              >
                <Link
                  variant="button"
                  size="small"
                  icon={EyeIcon}
                  onClick={() => onSelectPayment(rev.payment_id)}
                >
                  Inspect Decision Audit Graph
                </Link>
                <Link
                  variant="button"
                  size="small"
                  icon={MessageCircleIcon}
                  onClick={() => toggleQna(rev.review_id)}
                >
                  {qnaOpenFor === rev.review_id ? 'Close Q&A' : 'Ask why it was refused'}
                </Link>
              </Box>

              {rev.status === 'PENDING' && (
                <Box display="flex" flexDirection="row" gap="spacing.3">
                  <Button
                    variant="secondary"
                    color="negative"
                    size="small"
                    icon={StopCircleIcon}
                    isLoading={isActing && actionLoading?.kind === 'reject'}
                    isDisabled={isActing && actionLoading?.kind !== 'reject'}
                    onClick={() => handleReject(rev.review_id)}
                  >
                    Reject & Safe Stop
                  </Button>
                  <Button
                    variant="primary"
                    color="positive"
                    size="small"
                    icon={CheckCircleIcon}
                    isLoading={isActing && actionLoading?.kind === 'approve'}
                    isDisabled={isActing && actionLoading?.kind !== 'approve'}
                    onClick={() => handleApprove(rev.review_id)}
                  >
                    Approve Execution
                  </Button>
                </Box>
              )}
            </Box>

            {/* Explainable refusal Q&A drawer */}
            {qnaOpenFor === rev.review_id && (
              <Box
                backgroundColor="surface.background.gray.subtle"
                borderRadius="medium"
                padding="spacing.4"
                display="flex"
                flexDirection="column"
                gap="spacing.3"
              >
                <Text size="xsmall" weight="semibold" color="surface.text.primary.normal">
                  Explainable Refusal — ask the reasoning layer
                </Text>
                <Box
                  display="flex"
                  flexDirection="row"
                  alignItems="center"
                  gap="spacing.3"
                >
                  <Box flex="1">
                    <TextInput
                      accessibilityLabel="Ask why this recovery was refused"
                      placeholder="e.g. Why not just retry this payment?"
                      value={qnaQuestion}
                      onChange={({ value }) => setQnaQuestion(value ?? '')}
                      onKeyDown={({ key }) => {
                        if (key === 'Enter' && !qnaLoading) void handleAsk(rev.review_id);
                      }}
                    />
                  </Box>
                  <Button
                    size="medium"
                    icon={SendIcon}
                    isLoading={qnaLoading}
                    isDisabled={qnaQuestion.trim().length < 3}
                    onClick={() => handleAsk(rev.review_id)}
                  >
                    Ask
                  </Button>
                </Box>
                {qnaAnswer && (
                  <Box display="flex" flexDirection="column" gap="spacing.3">
                    <Text size="small">{qnaAnswer.answer}</Text>
                    <Box
                      display="flex"
                      flexDirection="row"
                      flexWrap="wrap"
                      alignItems="center"
                      gap="spacing.2"
                    >
                      {qnaAnswer.cited_rules.map((rule) => (
                        <Badge key={rule} color="notice" size="small">
                          {rule}
                        </Badge>
                      ))}
                      <Badge
                        color={qnaAnswer.provider === 'anthropic' ? 'information' : 'neutral'}
                        size="small"
                      >
                        {providerChipLabel(qnaAnswer)}
                      </Badge>
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </CardBody>
      </Card>
    );
  };

  const renderQueue = (tab: ReviewFilter): React.ReactElement => {
    const items = reviews.filter((r) => tab === 'ALL' || r.status === tab);
    if (items.length === 0) {
      return (
        <EmptyState
          size="medium"
          asset={<CheckCircleIcon size="2xlarge" color="surface.icon.gray.muted" />}
          title="Queue is clear"
          description="No transactions currently flagged in this status."
        />
      );
    }
    return (
      <Box display="flex" flexDirection="column" gap="spacing.4">
        {items.map((rev) => renderReviewCard(rev))}
      </Box>
    );
  };

  return (
    <Box display="flex" flexDirection="column" gap="spacing.5">
      {/* Header */}
      <Box display="flex" flexDirection="column" gap="spacing.1">
        <Heading size="small" weight="semibold">
          Escalation Triage Queue (Section 17)
        </Heading>
        <Text size="xsmall" color="surface.text.gray.muted">
          Transactions blocked by deterministic safety rules requiring human risk officer
          sign-off
        </Text>
      </Box>

      {/* Filter tabs + review queue */}
      <Tabs defaultValue="PENDING" variant="bordered" orientation="horizontal">
        <TabList>
          {FILTERS.map((tab) => (
            <TabItem
              key={tab}
              value={tab}
              trailing={
                <Counter
                  value={reviews.filter((r) => tab === 'ALL' || r.status === tab).length}
                  color={filterCounterColor(tab)}
                  size="small"
                />
              }
            >
              {tab}
            </TabItem>
          ))}
        </TabList>
        {FILTERS.map((tab) => (
          <TabPanel key={tab} value={tab}>
            <Box paddingTop="spacing.4">{renderQueue(tab)}</Box>
          </TabPanel>
        ))}
      </Tabs>
    </Box>
  );
};
