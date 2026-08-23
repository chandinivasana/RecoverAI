'use client';

import React from 'react';
import {
  ActivityIcon,
  AlertOctagonIcon,
  AlertTriangleIcon,
  Amount,
  Badge,
  Box,
  CheckCircleIcon,
  Code,
  Divider,
  Link,
  LockIcon,
  RefreshIcon,
  ShieldIcon,
  StopCircleIcon,
  Text,
  UserCheckIcon,
  XCircleIcon,
} from '@razorpay/blade/components';
import { AuditEvent } from '../types';

interface AgentActivityFeedProps {
  events: AuditEvent[];
  onSelectPayment?: (paymentId: string) => void;
}

type BladeIcon = typeof ActivityIcon;

type FeedbackTone = 'positive' | 'negative' | 'notice' | 'information' | 'neutral';

interface EventVisual {
  tone: FeedbackTone;
  icon: BladeIcon;
  isSafetyEvent: boolean;
}

// Safety-critical audit events — these are the system's safeguards firing,
// so they get distinctive notice/negative treatment in the timeline.
const SAFETY_EVENTS: Record<string, { tone: 'negative' | 'notice'; icon: BladeIcon }> = {
  CIRCUIT_BREAKER_TRIPPED: { tone: 'negative', icon: AlertOctagonIcon },
  CRITIC_OVERRIDE_APPLIED: { tone: 'notice', icon: ShieldIcon },
  LLM_FALLBACK: { tone: 'notice', icon: AlertTriangleIcon },
  HUMAN_APPROVAL_BLOCKED_BY_HARD_RULE: { tone: 'negative', icon: LockIcon },
};

const TONE_ICON_COLOR = {
  positive: 'feedback.icon.positive.intense',
  negative: 'feedback.icon.negative.intense',
  notice: 'feedback.icon.notice.intense',
  information: 'feedback.icon.information.intense',
  neutral: 'surface.icon.gray.muted',
} as const;

const TONE_TEXT_COLOR = {
  positive: 'feedback.text.positive.intense',
  negative: 'feedback.text.negative.intense',
  notice: 'feedback.text.notice.intense',
  information: 'feedback.text.information.intense',
  neutral: 'surface.text.gray.subtle',
} as const;

const getEventVisual = (eventType: string): EventVisual => {
  const safety = SAFETY_EVENTS[eventType];
  if (safety) {
    return { tone: safety.tone, icon: safety.icon, isSafetyEvent: true };
  }
  const upper = eventType.toUpperCase();
  // Neutral terminal states first (permanently_failed/stopped stay neutral gray).
  if (/PERMANENTLY_FAILED|STOP|HALT|ABORT/.test(upper)) {
    return { tone: 'neutral', icon: StopCircleIcon, isSafetyEvent: false };
  }
  if (/RECOVERED|SUCCE|APPROVED|VERIFIED/.test(upper)) {
    return { tone: 'positive', icon: CheckCircleIcon, isSafetyEvent: false };
  }
  if (/FAIL|REJECT|DENIED|ERROR/.test(upper)) {
    return { tone: 'negative', icon: XCircleIcon, isSafetyEvent: false };
  }
  if (/ESCALAT|HUMAN|REVIEW/.test(upper)) {
    return { tone: 'notice', icon: UserCheckIcon, isSafetyEvent: false };
  }
  if (/PROCESS|RETRY|ATTEMPT|PLAN|DECISION|EVALUAT|ANALY/.test(upper)) {
    return { tone: 'information', icon: RefreshIcon, isSafetyEvent: false };
  }
  return { tone: 'neutral', icon: ActivityIcon, isSafetyEvent: false };
};

const getActorColor = (
  actor: string,
): 'positive' | 'information' | 'primary' | 'notice' | 'neutral' => {
  if (actor.includes('PolicyEngine')) return 'positive';
  if (actor.includes('PaymentAnalyst')) return 'information';
  if (actor.includes('RecoveryPlanner')) return 'primary';
  if (actor.includes('HumanReviewer')) return 'notice';
  return 'neutral';
};

const humanizeEventType = (eventType: string): string => {
  const lower = eventType.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const formatTimestamp = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const AgentActivityFeed: React.FC<AgentActivityFeedProps> = ({
  events,
  onSelectPayment,
}) => {
  return (
    <Box
      as="section"
      display="flex"
      flexDirection="column"
      height="100%"
      backgroundColor="surface.background.gray.intense"
      borderWidth="thin"
      borderStyle="solid"
      borderColor="surface.border.gray.muted"
      borderRadius="medium"
      padding="spacing.5"
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap="spacing.3"
        paddingBottom="spacing.3"
      >
        <Box display="flex" alignItems="center" gap="spacing.2">
          <ActivityIcon size="small" color="surface.icon.gray.subtle" />
          <Text size="small" weight="semibold" color="surface.text.gray.normal">
            Agent activity
          </Text>
        </Box>
        <Box display="flex" alignItems="center" gap="spacing.2">
          <RefreshIcon size="small" color="surface.icon.gray.muted" />
          <Text variant="caption" size="small" color="surface.text.gray.muted">
            auto-refresh 10s
          </Text>
        </Box>
      </Box>

      <Divider />

      <Box marginTop="spacing.4" overflowY="auto" maxHeight="260px" paddingRight="spacing.2">
        {events.length === 0 ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            gap="spacing.2"
            paddingY="spacing.7"
          >
            <ActivityIcon size="medium" color="surface.icon.gray.muted" />
            <Text size="small" color="surface.text.gray.muted">
              No audit events recorded yet
            </Text>
          </Box>
        ) : (
          events.map((evt, idx) => {
            const isLast = idx === events.length - 1;
            const { tone, icon: EventIcon, isSafetyEvent } = getEventVisual(evt.event_type);
            const detail = evt.metadata?.reason || evt.metadata?.result || evt.metadata?.message;

            return (
              <Box key={evt.audit_id || idx} display="flex" gap="spacing.3" alignItems="stretch">
                {/* Timeline rail: event icon + connecting line */}
                <Box display="flex" flexDirection="column" alignItems="center" flexShrink="0">
                  <EventIcon size="small" color={TONE_ICON_COLOR[tone]} />
                  {!isLast ? (
                    <Box flex="1" display="flex" justifyContent="center" paddingY="spacing.1">
                      <Divider orientation="vertical" />
                    </Box>
                  ) : null}
                </Box>

                <Box flex="1" minWidth="0px" paddingBottom={isLast ? 'spacing.0' : 'spacing.4'}>
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    gap="spacing.2"
                    flexWrap="wrap"
                  >
                    <Box display="flex" alignItems="center" gap="spacing.2" flexWrap="wrap">
                      <Badge size="small" color={getActorColor(evt.actor)}>
                        {evt.actor}
                      </Badge>
                      {onSelectPayment ? (
                        <Link
                          variant="button"
                          size="small"
                          onClick={() => onSelectPayment(evt.payment_id)}
                        >
                          {evt.payment_id}
                        </Link>
                      ) : (
                        <Code size="small">{evt.payment_id}</Code>
                      )}
                    </Box>
                    <Text variant="caption" size="small" color="surface.text.gray.muted">
                      {formatTimestamp(evt.timestamp)}
                    </Text>
                  </Box>

                  <Box marginTop="spacing.2">
                    {isSafetyEvent ? (
                      <Badge size="medium" color={tone} emphasis="intense" icon={EventIcon}>
                        {humanizeEventType(evt.event_type)}
                      </Badge>
                    ) : (
                      <Text size="small" weight="semibold" color={TONE_TEXT_COLOR[tone]}>
                        {humanizeEventType(evt.event_type)}
                      </Text>
                    )}
                  </Box>

                  {detail ? (
                    <Text
                      size="small"
                      color="surface.text.gray.muted"
                      truncateAfterLines={2}
                      marginTop="spacing.1"
                    >
                      {detail}
                    </Text>
                  ) : null}

                  {evt.metadata?.rule ? (
                    <Box marginTop="spacing.1">
                      <Code size="small">{evt.metadata.rule}</Code>
                    </Box>
                  ) : null}

                  {evt.metadata?.amount_recovered ? (
                    <Box display="flex" alignItems="center" gap="spacing.2" marginTop="spacing.2">
                      <Amount
                        value={Number(evt.metadata.amount_recovered)}
                        currency="INR"
                        type="body"
                        size="small"
                        weight="medium"
                        color="feedback.text.positive.intense"
                      />
                      <Text variant="caption" size="small" color="feedback.text.positive.intense">
                        settled
                      </Text>
                    </Box>
                  ) : null}
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};
