'use client';

import React, { useState } from 'react';
import {
  ActionList,
  ActionListItem,
  ActivityIcon,
  AlertTriangleIcon,
  Amount,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardHeaderBadge,
  CardHeaderIcon,
  CardHeaderLeading,
  CardHeaderTrailing,
  CheckCircleIcon,
  Chip,
  ChipGroup,
  Code,
  Dropdown,
  DropdownOverlay,
  EyeIcon,
  FlagIcon,
  Heading,
  HistoryIcon,
  PlayIcon,
  RouteIcon,
  SelectInput,
  ShieldIcon,
  StepGroup,
  StepItem,
  StepItemIcon,
  Text,
  TextArea,
  TextInput,
  useToast,
} from '@razorpay/blade/components';
import { runTimeTravelReplay } from '../lib/api';

// ---- Local response types (shape of POST /api/replay) ----

type StageAnalysis = {
  failure_type?: string;
  risk_level?: string;
  summary?: string;
};

type StagePlanner = {
  recommended_action?: string;
  reason?: string;
  recovery_probability?: number;
  expected_net_recovery?: number;
};

type StageCritic = {
  verdict?: string;
  notes?: string;
  suggested_override?: string | null;
  override_applied?: boolean;
  effective_action?: string;
};

type StagePolicy = {
  action_evaluated?: string;
  allowed?: boolean;
  rule?: string;
  reason?: string;
  requires_escalation?: boolean;
};

type TraceInputs = {
  amount?: number;
  payment_method?: string;
  failure_reason?: string;
  error_code?: string;
  retry_count?: number;
};

type ReplayTrace = {
  inputs?: TraceInputs;
  stage_1_analysis?: StageAnalysis;
  stage_2_planner?: StagePlanner;
  stage_3_critic?: StageCritic;
  stage_4_policy?: StagePolicy;
  final_outcome?: string;
};

type DeltaSummary = {
  amount_diff?: number;
  action_changed?: boolean;
  policy_outcome_changed?: boolean;
  explanation?: string;
};

type ReplayResponse = {
  original_trace?: ReplayTrace;
  replayed_trace?: ReplayTrace;
  delta_summary?: DeltaSummary;
};

// ---- Presets ----

type PresetKey = 'SAFE_UPI' | 'HIGH_TICKET' | 'FRAUD_ATTACK' | 'QUOTA_EXHAUST';

const PRESETS: Record<
  PresetKey,
  {
    label: string;
    amount: string;
    method: string;
    failureReason: string;
    errorCode: string;
    retries: string;
    riskScore: string;
  }
> = {
  SAFE_UPI: {
    label: '₹3.5k Safe UPI',
    amount: '3499',
    method: 'upi',
    failureReason: 'Bank network timeout during UPI PIN authorization',
    errorCode: 'GATEWAY_TIMEOUT',
    retries: '0',
    riskScore: '0.05',
  },
  HIGH_TICKET: {
    label: '₹2.5L High-Ticket',
    amount: '250000',
    method: 'card',
    failureReason: 'Bank network timeout during 3DS OTP validation',
    errorCode: 'GATEWAY_TIMEOUT',
    retries: '0',
    riskScore: '0.12',
  },
  FRAUD_ATTACK: {
    label: 'High Risk Fraud',
    amount: '85000',
    method: 'card',
    failureReason: 'Unusual cross-border velocity pattern detected',
    errorCode: 'FRAUD_SUSPECTED',
    retries: '0',
    riskScore: '0.92',
  },
  QUOTA_EXHAUST: {
    label: 'Retry Quota Exhaust',
    amount: '2500',
    method: 'upi',
    failureReason: 'Bank network timeout',
    errorCode: 'GATEWAY_TIMEOUT',
    retries: '2',
    riskScore: '0.08',
  },
};

const PAYMENT_METHODS = [
  { value: 'upi', title: 'UPI (GPay / PhonePe / Paytm)' },
  { value: 'card', title: 'Credit / Debit Card' },
  { value: 'netbanking', title: 'NetBanking' },
  { value: 'emi', title: 'Cardless EMI' },
];

const ERROR_CODES = [
  'GATEWAY_TIMEOUT',
  'BANK_NETWORK_DOWN',
  'INSUFFICIENT_FUNDS',
  'CARD_EXPIRED',
  'FRAUD_SUSPECTED',
  'UNKNOWN',
];

type StageColor = 'positive' | 'negative' | 'notice' | 'information' | 'neutral';

const outcomeColor = (outcome?: string): StageColor => {
  if (outcome === 'EXECUTE') return 'positive';
  if (outcome === 'ESCALATE') return 'notice';
  return 'neutral';
};

const TraceCard: React.FC<{ trace?: ReplayTrace; label: string; subtitle: string }> = ({
  trace,
  label,
  subtitle,
}) => {
  if (!trace) return null;

  const analysis = trace.stage_1_analysis ?? {};
  const planner = trace.stage_2_planner ?? {};
  const critic = trace.stage_3_critic ?? {};
  const policy = trace.stage_4_policy ?? {};
  const inputs = trace.inputs ?? {};

  const criticColor: StageColor = critic.verdict === 'AGREE' ? 'positive' : 'negative';
  const policyColor: StageColor = policy.allowed ? 'positive' : 'negative';
  const finalColor = outcomeColor(trace.final_outcome);
  const methodTitle =
    PAYMENT_METHODS.find((m) => m.value === inputs.payment_method)?.title ??
    String(inputs.payment_method ?? '—');

  return (
    <Box flex="1" minWidth="0px" display="flex" flexDirection="column">
      <Card padding="spacing.5" width="100%" height="100%">
        <CardHeader>
        <CardHeaderLeading
          title={label}
          subtitle={subtitle}
          prefix={<CardHeaderIcon icon={HistoryIcon} />}
        />
        <CardHeaderTrailing
          visual={
            <CardHeaderBadge color={finalColor}>
              {String(trace.final_outcome ?? 'UNKNOWN')}
            </CardHeaderBadge>
          }
        />
      </CardHeader>
      <CardBody>
        <Box display="flex" flexDirection="column" gap="spacing.5">
          <Box display="flex" flexWrap="wrap" alignItems="center" gap="spacing.3">
            <Amount value={Number(inputs.amount ?? 0)} type="body" size="medium" weight="semibold" />
            <Badge color="information">{methodTitle}</Badge>
            <Code size="small">{String(inputs.error_code ?? '—')}</Code>
            <Text size="xsmall" color="surface.text.gray.muted">
              Retries: {Number(inputs.retry_count ?? 0)}
            </Text>
          </Box>

          <StepGroup orientation="vertical" size="medium">
            <StepItem
              title="Stage 1 · Failure Analysis"
              stepProgress="full"
              marker={<StepItemIcon icon={ActivityIcon} color="information" />}
              trailing={
                <Badge color="information" size="small">
                  {String(analysis.failure_type ?? '—')}
                </Badge>
              }
            >
              <Box display="flex" flexDirection="column" gap="spacing.2" paddingY="spacing.2">
                <Text size="small">{String(analysis.summary ?? '—')}</Text>
                <Text size="xsmall" color="surface.text.gray.muted">
                  Risk level: {String(analysis.risk_level ?? '—')}
                </Text>
              </Box>
            </StepItem>

            <StepItem
              title="Stage 2 · Recovery Planner"
              stepProgress="full"
              marker={<StepItemIcon icon={RouteIcon} color="information" />}
              trailing={
                <Badge color="information" size="small">
                  {String(planner.recommended_action ?? '—')}
                </Badge>
              }
            >
              <Box display="flex" flexDirection="column" gap="spacing.2" paddingY="spacing.2">
                <Text size="small">{String(planner.reason ?? '—')}</Text>
                <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Recovery probability:{' '}
                    {Math.round(Number(planner.recovery_probability ?? 0) * 100)}%
                  </Text>
                  <Box display="flex" alignItems="center" gap="spacing.2">
                    <Text size="xsmall" color="surface.text.gray.muted">
                      Expected net recovery:
                    </Text>
                    <Amount
                      value={Number(planner.expected_net_recovery ?? 0)}
                      type="body"
                      size="xsmall"
                      weight="semibold"
                    />
                  </Box>
                </Box>
              </Box>
            </StepItem>

            <StepItem
              title="Stage 3 · Critic Review"
              stepProgress="full"
              marker={<StepItemIcon icon={EyeIcon} color={criticColor} />}
              trailing={
                <Badge color={criticColor} size="small">
                  {String(critic.verdict ?? '—')}
                </Badge>
              }
            >
              <Box display="flex" flexDirection="column" gap="spacing.2" paddingY="spacing.2">
                <Text size="small">{String(critic.notes ?? '—')}</Text>
                <Box display="flex" alignItems="center" gap="spacing.2" flexWrap="wrap">
                  {critic.override_applied ? (
                    <Badge color="notice" size="small" icon={AlertTriangleIcon}>
                      Override applied
                    </Badge>
                  ) : (
                    <Badge color="neutral" size="small">
                      No override
                    </Badge>
                  )}
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Effective action:
                  </Text>
                  <Code size="small">{String(critic.effective_action ?? '—')}</Code>
                </Box>
              </Box>
            </StepItem>

            <StepItem
              title="Stage 4 · Policy Engine"
              stepProgress="full"
              marker={<StepItemIcon icon={ShieldIcon} color={policyColor} />}
              trailing={
                <Badge color={policyColor} size="small">
                  {policy.allowed ? 'APPROVED' : 'BLOCKED'}
                </Badge>
              }
            >
              <Box display="flex" flexDirection="column" gap="spacing.2" paddingY="spacing.2">
                <Box display="flex" alignItems="center" gap="spacing.2" flexWrap="wrap">
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Action evaluated:
                  </Text>
                  <Code size="small">{String(policy.action_evaluated ?? '—')}</Code>
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Rule:
                  </Text>
                  <Code size="small">{String(policy.rule ?? '—')}</Code>
                </Box>
                <Text size="small">{String(policy.reason ?? '—')}</Text>
              </Box>
            </StepItem>

            <StepItem
              title="Final Outcome"
              stepProgress="end"
              marker={<StepItemIcon icon={FlagIcon} color={finalColor} />}
              trailing={
                <Badge color={finalColor} size="small">
                  {String(trace.final_outcome ?? 'UNKNOWN')}
                </Badge>
              }
            />
          </StepGroup>
        </Box>
      </CardBody>
      </Card>
    </Box>
  );
};

export const TimeTravelReplay: React.FC = () => {
  const [amount, setAmount] = useState<string>(PRESETS.SAFE_UPI.amount);
  const [method, setMethod] = useState<string>(PRESETS.SAFE_UPI.method);
  const [failureReason, setFailureReason] = useState<string>(PRESETS.SAFE_UPI.failureReason);
  const [errorCode, setErrorCode] = useState<string>(PRESETS.SAFE_UPI.errorCode);
  const [retries, setRetries] = useState<string>(PRESETS.SAFE_UPI.retries);
  const [riskScore, setRiskScore] = useState<string>(PRESETS.SAFE_UPI.riskScore);
  const [preset, setPreset] = useState<string>('SAFE_UPI');

  const [replayData, setReplayData] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const loadPreset = (key: PresetKey) => {
    const p = PRESETS[key];
    setAmount(p.amount);
    setMethod(p.method);
    setFailureReason(p.failureReason);
    setErrorCode(p.errorCode);
    setRetries(p.retries);
    setRiskScore(p.riskScore);
    setPreset(key);
  };

  const handleRunReplay = async () => {
    const parsedAmount = Number(amount);
    const parsedRetries = Number(retries);
    const parsedRisk = Number(riskScore);
    if (!Number.isFinite(parsedAmount) || !Number.isFinite(parsedRetries) || !Number.isFinite(parsedRisk)) {
      toast.show({
        content: 'Amount, retry count and risk score must be valid numbers',
        color: 'negative',
      });
      return;
    }

    setLoading(true);
    try {
      const res = (await runTimeTravelReplay({
        override_amount: parsedAmount,
        override_payment_method: method,
        override_failure_reason: failureReason,
        override_error_code: errorCode,
        override_retry_count: parsedRetries,
        override_risk_score: parsedRisk,
      })) as ReplayResponse;
      setReplayData(res);
    } catch (err) {
      toast.show({
        content: `Replay failed: ${err instanceof Error ? err.message : String(err)}`,
        color: 'negative',
      });
    } finally {
      setLoading(false);
    }
  };

  const original = replayData?.original_trace;
  const replayed = replayData?.replayed_trace;
  const delta = replayData?.delta_summary;

  const criticFlipped =
    Boolean(replayData) && original?.stage_3_critic?.verdict !== replayed?.stage_3_critic?.verdict;
  const outcomeFlipped =
    Boolean(replayData) && original?.final_outcome !== replayed?.final_outcome;
  const anyChange = Boolean(
    delta?.action_changed || delta?.policy_outcome_changed || criticFlipped || outcomeFlipped,
  );
  const amountDiff = Number(delta?.amount_diff ?? 0);

  return (
    <Box display="flex" flexDirection="column" gap="spacing.5">
      {/* Header + presets */}
      <Card padding="spacing.5">
        <CardBody>
          <Box
            display="flex"
            flexDirection={{ base: 'column', m: 'row' }}
            justifyContent="space-between"
            alignItems={{ base: 'stretch', m: 'center' }}
            gap="spacing.4"
          >
            <Box display="flex" flexDirection="column" gap="spacing.1">
              <Heading size="small">Time-Travel Decision Debugger (Section 35)</Heading>
              <Text size="small" color="surface.text.gray.muted">
                Modify input parameters to observe deterministic policy reactions and action routing
              </Text>
            </Box>
            <ChipGroup
              label="Presets"
              accessibilityLabel="Load a preset replay scenario"
              selectionType="single"
              size="small"
              value={preset}
              onChange={({ values }) => {
                const key = values[0] as PresetKey | undefined;
                if (key && PRESETS[key]) {
                  loadPreset(key);
                } else {
                  setPreset('');
                }
              }}
            >
              <Box display="flex" gap="spacing.2" flexWrap="wrap">
                <Chip value="SAFE_UPI">{PRESETS.SAFE_UPI.label}</Chip>
                <Chip value="HIGH_TICKET">{PRESETS.HIGH_TICKET.label}</Chip>
                <Chip value="FRAUD_ATTACK" color="negative">
                  {PRESETS.FRAUD_ATTACK.label}
                </Chip>
                <Chip value="QUOTA_EXHAUST">{PRESETS.QUOTA_EXHAUST.label}</Chip>
              </Box>
            </ChipGroup>
          </Box>
        </CardBody>
      </Card>

      {/* Inputs + results */}
      <Box display="flex" flexDirection={{ base: 'column', l: 'row' }} gap="spacing.5">
        {/* Transaction parameters */}
        <Box flexShrink={0} width={{ base: '100%', l: '360px' }}>
          <Card padding="spacing.5">
            <CardHeader>
              <CardHeaderLeading
                title="Transaction Parameters"
                prefix={<CardHeaderIcon icon={ActivityIcon} />}
              />
            </CardHeader>
            <CardBody>
              <Box display="flex" flexDirection="column" gap="spacing.4">
                <TextInput
                  label="Transaction Amount"
                  type="number"
                  prefix="₹"
                  value={amount}
                  onChange={({ value }) => {
                    setAmount(value ?? '');
                    setPreset('');
                  }}
                />

                <Dropdown selectionType="single">
                  <SelectInput
                    label="Payment Method"
                    value={method}
                    onChange={({ values }) => {
                      setMethod(values[0] ?? 'upi');
                      setPreset('');
                    }}
                  />
                  <DropdownOverlay>
                    <ActionList>
                      {PAYMENT_METHODS.map((m) => (
                        <ActionListItem key={m.value} title={m.title} value={m.value} />
                      ))}
                    </ActionList>
                  </DropdownOverlay>
                </Dropdown>

                <TextArea
                  label="Failure Reason Diagnostic"
                  numberOfLines={2}
                  value={failureReason}
                  onChange={({ value }) => {
                    setFailureReason(value ?? '');
                    setPreset('');
                  }}
                />

                <Dropdown selectionType="single">
                  <SelectInput
                    label="Error Code"
                    value={errorCode}
                    onChange={({ values }) => {
                      setErrorCode(values[0] ?? 'UNKNOWN');
                      setPreset('');
                    }}
                  />
                  <DropdownOverlay>
                    <ActionList>
                      {ERROR_CODES.map((code) => (
                        <ActionListItem key={code} title={code} value={code} />
                      ))}
                    </ActionList>
                  </DropdownOverlay>
                </Dropdown>

                <Box display="flex" gap="spacing.3">
                  <Box flex="1">
                    <TextInput
                      label="Retry Count"
                      type="number"
                      value={retries}
                      onChange={({ value }) => {
                        setRetries(value ?? '');
                        setPreset('');
                      }}
                    />
                  </Box>
                  <Box flex="1">
                    <TextInput
                      label="Risk Score (0–1)"
                      type="number"
                      value={riskScore}
                      onChange={({ value }) => {
                        setRiskScore(value ?? '');
                        setPreset('');
                      }}
                    />
                  </Box>
                </Box>

                <Button
                  icon={PlayIcon}
                  iconPosition="left"
                  isFullWidth
                  isLoading={loading}
                  onClick={handleRunReplay}
                >
                  Run Decision Pipeline
                </Button>
              </Box>
            </CardBody>
          </Card>
        </Box>

        {/* Pipeline output */}
        <Box flex="1" minWidth="0px" display="flex" flexDirection="column" gap="spacing.5">
          {replayData ? (
            <Box display="flex" flexDirection="column" gap="spacing.5">
              {/* Delta summary */}
              <Card padding="spacing.5">
                <CardBody>
                  <Box display="flex" flexDirection="column" gap="spacing.3">
                    <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
                      <Heading size="small">Replay Delta</Heading>
                      {delta?.action_changed && (
                        <Badge color="notice" icon={AlertTriangleIcon}>
                          Planner action flipped
                        </Badge>
                      )}
                      {criticFlipped && (
                        <Badge color="notice" icon={EyeIcon}>
                          Critic verdict flipped
                        </Badge>
                      )}
                      {delta?.policy_outcome_changed && (
                        <Badge color="negative" icon={ShieldIcon}>
                          Policy decision flipped
                        </Badge>
                      )}
                      {outcomeFlipped && (
                        <Badge color="negative" icon={FlagIcon}>
                          {`Outcome: ${original?.final_outcome ?? '—'} → ${
                            replayed?.final_outcome ?? '—'
                          }`}
                        </Badge>
                      )}
                      {!anyChange && (
                        <Badge color="neutral" icon={CheckCircleIcon}>
                          No decision changes
                        </Badge>
                      )}
                    </Box>
                    {delta?.explanation && (
                      <Text size="small" color="surface.text.gray.muted">
                        {delta.explanation}
                      </Text>
                    )}
                    {amountDiff !== 0 && (
                      <Box display="flex" alignItems="center" gap="spacing.2">
                        <Text size="small" weight="medium">
                          Amount delta: {amountDiff > 0 ? '+' : '−'}
                        </Text>
                        <Amount
                          value={Math.abs(amountDiff)}
                          type="body"
                          size="small"
                          weight="semibold"
                        />
                      </Box>
                    )}
                  </Box>
                </CardBody>
              </Card>

              {/* Original vs replayed traces */}
              <Box display="flex" flexDirection={{ base: 'column', m: 'row' }} gap="spacing.5">
                <TraceCard
                  trace={original}
                  label="Original Trace"
                  subtitle="Baseline pipeline decision"
                />
                <TraceCard
                  trace={replayed}
                  label="Replayed Trace"
                  subtitle="Pipeline decision with modified inputs"
                />
              </Box>
            </Box>
          ) : (
            <Box
              borderWidth="thin"
              borderStyle="dashed"
              borderColor="surface.border.gray.normal"
              borderRadius="medium"
              padding="spacing.10"
              display="flex"
              alignItems="center"
              justifyContent="center"
              minHeight="240px"
            >
              <Text size="small" color="surface.text.gray.muted" textAlign="center">
                Run the decision pipeline to inspect the original vs replayed stage traces
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
