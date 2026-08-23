'use client';

import React, { useEffect, useState } from 'react';
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
  Heading,
  PlayIcon,
  SaveIcon,
  Switch,
  Text,
  TextInput,
  useToast,
} from '@razorpay/blade/components';
import { PolicyConfig, SimulationResult } from '../types';
import { fetchPolicies, updatePolicies, simulatePolicy } from '../lib/api';

/**
 * The simulate API also returns the basis on which the 30-day projection was
 * computed. Defined locally because the shared SimulationResult type does not
 * carry it (and this file must not edit src/types).
 */
type SimulationReport = SimulationResult & { projection_basis?: string };

type BooleanRuleKey =
  | 'require_human_high_risk'
  | 'stop_on_repeated_failure'
  | 'require_customer_consent_for_nudge'
  | 'escalate_unknown_failure'
  | 'vulcan_enabled';

const BOOLEAN_RULES: Array<{ key: BooleanRuleKey; label: string; description: string }> = [
  {
    key: 'require_human_high_risk',
    label: 'Mandate human sign-off for high risk',
    description: 'High-risk recoveries always escalate to a human reviewer',
  },
  {
    key: 'stop_on_repeated_failure',
    label: 'Stop recovery on repeated failure',
    description: 'Halt the recovery loop once retries keep failing',
  },
  {
    key: 'require_customer_consent_for_nudge',
    label: 'Require user consent for SMS/link nudges',
    description: 'Payment-link and SMS nudges need explicit messaging consent',
  },
  {
    key: 'escalate_unknown_failure',
    label: 'Escalate unknown failure types',
    description: 'Unrecognised error codes go to a human instead of the agent',
  },
  {
    key: 'vulcan_enabled',
    label: 'Razorpay Vulcan smart intelligence signals',
    description: 'Use gateway health and propensity signals in decisions',
  },
];

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const formatSignedInt = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

const formatSignedPercent = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

type SignedTone = 'feedback.text.positive.intense' | 'feedback.text.negative.intense';

const SignedAmount: React.FC<{ value: number; color: SignedTone }> = ({ value, color }) => (
  <Box display="flex" alignItems="baseline" gap="spacing.1">
    <Text size="small" weight="semibold" color={color}>
      {value >= 0 ? '+' : '−'}
    </Text>
    <Amount
      value={Math.abs(value)}
      currency="INR"
      type="body"
      size="small"
      weight="semibold"
      color={color}
    />
  </Box>
);

const StatTile: React.FC<{
  label: string;
  caption?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, caption, children }) => (
  <Box
    flex="1"
    minWidth="170px"
    backgroundColor="surface.background.gray.moderate"
    borderRadius="medium"
    padding="spacing.4"
    display="flex"
    flexDirection="column"
    gap="spacing.2"
  >
    <Text variant="caption" size="small" color="surface.text.gray.muted">
      {label}
    </Text>
    {children}
    {caption}
  </Box>
);

export const PolicySimulator: React.FC = () => {
  const toast = useToast();

  const [proposedConfig, setProposedConfig] = useState<PolicyConfig>({
    max_autonomous_retry_attempts: 2,
    max_autonomous_amount: 25000,
    require_human_high_risk: true,
    stop_on_repeated_failure: true,
    require_customer_consent_for_nudge: true,
    escalate_unknown_failure: true,
    vulcan_enabled: true,
  });

  const [simResult, setSimResult] = useState<SimulationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPolicies()
      .then((res) => {
        setProposedConfig(res);
      })
      .catch((err) => {
        toast.show({
          content: `Failed to load current policy configuration: ${errorMessage(err)}`,
          color: 'negative',
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSimulate = async () => {
    setLoading(true);
    try {
      const res: SimulationReport = await simulatePolicy(proposedConfig, 'dev');
      setSimResult(res);
    } catch (err) {
      toast.show({
        content: `Error running simulation: ${errorMessage(err)}`,
        color: 'negative',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePolicies(proposedConfig);
      toast.show({
        content: 'Deterministic merchant policy rules persisted successfully.',
        color: 'positive',
      });
    } catch (err) {
      toast.show({
        content: `Error saving policy configuration: ${errorMessage(err)}`,
        color: 'negative',
      });
    } finally {
      setSaving(false);
    }
  };

  const setBooleanRule = (key: BooleanRuleKey, isChecked: boolean) => {
    setProposedConfig((prev) => {
      const next = { ...prev };
      next[key] = isChecked;
      return next;
    });
  };

  const revenueDeltaColor =
    simResult && simResult.revenue_delta >= 0
      ? 'feedback.text.positive.intense'
      : 'feedback.text.negative.intense';

  const riskColor = simResult
    ? simResult.risk_exposure_change_percent > 0
      ? 'feedback.text.notice.intense'
      : simResult.risk_exposure_change_percent < 0
      ? 'feedback.text.positive.intense'
      : 'surface.text.gray.normal'
    : 'surface.text.gray.normal';

  return (
    <Box display="flex" flexDirection="column" gap="spacing.4">
      {/* Header */}
      <Card padding="spacing.5" elevation="lowRaised">
        <CardBody>
          <Box
            display="flex"
            flexDirection={{ base: 'column', m: 'row' }}
            justifyContent="space-between"
            alignItems={{ base: 'flex-start', m: 'center' }}
            gap="spacing.4"
          >
            <Box>
              <Heading size="small">
                Deterministic Policy Engine &amp; Impact Simulator (Section 34)
              </Heading>
              <Text size="small" color="surface.text.gray.muted" marginTop="spacing.1">
                Configure hard autonomous limits and run offline simulations across historical
                payments
              </Text>
            </Box>
            <Box display="flex" gap="spacing.3" flexShrink="0">
              <Button
                variant="secondary"
                icon={PlayIcon}
                isLoading={loading}
                onClick={handleSimulate}
              >
                Run Simulation
              </Button>
              <Button variant="primary" icon={SaveIcon} isLoading={saving} onClick={handleSave}>
                Apply Live Rules
              </Button>
            </Box>
          </Box>
        </CardBody>
      </Card>

      {/* Simulator layout */}
      <Box display="flex" flexDirection={{ base: 'column', l: 'row' }} gap="spacing.4">
        {/* Rule parameters */}
        <Box width={{ base: '100%', l: '40%' }} flexShrink="0">
          <Card padding="spacing.5" height="100%">
            <CardHeader>
              <CardHeaderLeading
                title="Rule Parameters"
                subtitle="Hard limits enforced by the policy engine on every recovery"
              />
            </CardHeader>
            <CardBody>
              <Box display="flex" flexDirection="column" gap="spacing.4">
                <TextInput
                  label="Autonomous amount cap"
                  name="max_autonomous_amount"
                  type="number"
                  prefix="₹"
                  value={String(proposedConfig.max_autonomous_amount)}
                  onChange={({ value }) =>
                    setProposedConfig((prev) => ({
                      ...prev,
                      max_autonomous_amount: value ? Number(value) : 0,
                    }))
                  }
                  helpText="Maximum amount the agent may act on without human sign-off"
                />

                <TextInput
                  label="Max autonomous retry count"
                  name="max_autonomous_retry_attempts"
                  type="number"
                  suffix="retries"
                  value={String(proposedConfig.max_autonomous_retry_attempts)}
                  onChange={({ value }) =>
                    setProposedConfig((prev) => ({
                      ...prev,
                      max_autonomous_retry_attempts: value ? Number(value) : 0,
                    }))
                  }
                  helpText="0 disables autonomous retries entirely"
                />

                <Box display="flex" flexDirection="column" gap="spacing.3">
                  {BOOLEAN_RULES.map((rule) => (
                    <Box
                      key={rule.key}
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      gap="spacing.4"
                      padding="spacing.3"
                      backgroundColor="surface.background.gray.moderate"
                      borderRadius="medium"
                    >
                      <Box>
                        <Text size="small" weight="medium">
                          {rule.label}
                        </Text>
                        <Text variant="caption" size="small" color="surface.text.gray.muted">
                          {rule.description}
                        </Text>
                      </Box>
                      <Switch
                        accessibilityLabel={rule.label}
                        isChecked={Boolean(proposedConfig[rule.key])}
                        onChange={({ isChecked }) => setBooleanRule(rule.key, isChecked)}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            </CardBody>
          </Card>
        </Box>

        {/* Simulation output */}
        <Box flex="1" minWidth="0px">
          {simResult ? (
            <Card padding="spacing.5" height="100%">
              <CardHeader>
                <CardHeaderLeading
                  title="Simulation Report"
                  subtitle={`${simResult.total_evaluated} historical transactions evaluated`}
                />
                <CardHeaderTrailing
                  visual={<CardHeaderBadge color="information">Offline evaluation</CardHeaderBadge>}
                />
              </CardHeader>
              <CardBody>
                <Box display="flex" flexDirection="column" gap="spacing.4">
                  {/* KPI tiles */}
                  <Box display="flex" flexWrap="wrap" gap="spacing.3">
                    <StatTile
                      label="Projected recovered revenue"
                      caption={
                        <Box display="flex" alignItems="baseline" gap="spacing.2">
                          <Text variant="caption" size="small" color="surface.text.gray.muted">
                            Delta
                          </Text>
                          <SignedAmount
                            value={simResult.revenue_delta}
                            color={revenueDeltaColor}
                          />
                        </Box>
                      }
                    >
                      <Amount
                        value={simResult.simulated_recovered_revenue}
                        currency="INR"
                        type="heading"
                        size="large"
                        weight="semibold"
                        color="feedback.text.positive.intense"
                      />
                    </StatTile>

                    <StatTile
                      label="Autonomous recoveries"
                      caption={
                        <Text variant="caption" size="small" color="surface.text.gray.muted">
                          Baseline {simResult.baseline_autonomous_recoveries} → Simulated{' '}
                          {simResult.simulated_autonomous_recoveries}
                        </Text>
                      }
                    >
                      <Heading size="large">{simResult.simulated_autonomous_recoveries}</Heading>
                    </StatTile>

                    <StatTile
                      label="Human escalations"
                      caption={
                        <Text variant="caption" size="small" color="surface.text.gray.muted">
                          Delta {formatSignedInt(simResult.escalations_delta)} vs baseline{' '}
                          {simResult.baseline_human_escalations}
                        </Text>
                      }
                    >
                      <Heading size="large" color="feedback.text.notice.intense">
                        {simResult.simulated_human_escalations}
                      </Heading>
                    </StatTile>

                    <StatTile label="Risk exposure change">
                      <Heading size="large" color={riskColor}>
                        {formatSignedPercent(simResult.risk_exposure_change_percent)}
                      </Heading>
                    </StatTile>
                  </Box>

                  {/* 30-day projection — values come only from the API response */}
                  <Box
                    backgroundColor="surface.background.primary.subtle"
                    borderRadius="medium"
                    padding="spacing.4"
                    display="flex"
                    flexDirection="column"
                    gap="spacing.2"
                  >
                    <Box
                      display="flex"
                      flexDirection={{ base: 'column', m: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ base: 'flex-start', m: 'center' }}
                      gap="spacing.3"
                    >
                      <Box>
                        <Text size="small" weight="semibold" color="surface.text.primary.normal">
                          Projected 30-day financial impact
                        </Text>
                        <Box
                          display="flex"
                          alignItems="baseline"
                          gap="spacing.2"
                          marginTop="spacing.1"
                        >
                          <Text size="small" color="surface.text.gray.muted">
                            Estimated net monthly revenue gain:
                          </Text>
                          {typeof simResult.projected_monthly_revenue_gain === 'number' ? (
                            <SignedAmount
                              value={simResult.projected_monthly_revenue_gain}
                              color={
                                simResult.projected_monthly_revenue_gain >= 0
                                  ? 'feedback.text.positive.intense'
                                  : 'feedback.text.negative.intense'
                              }
                            />
                          ) : (
                            <Text size="small" color="surface.text.gray.muted">
                              n/a
                            </Text>
                          )}
                        </Box>
                      </Box>
                      <Box flexShrink="0">
                        {typeof simResult.estimated_roi_multiplier === 'number' ? (
                          simResult.estimated_roi_multiplier === 0 ? (
                            <Text size="small" color="surface.text.gray.muted">
                              n/a — no newly-allowed actions
                            </Text>
                          ) : (
                            <Badge color="information" emphasis="intense">
                              {`${simResult.estimated_roi_multiplier}x action-cost ROI`}
                            </Badge>
                          )
                        ) : (
                          <Text size="small" color="surface.text.gray.muted">
                            n/a
                          </Text>
                        )}
                      </Box>
                    </Box>
                    {simResult.projection_basis ? (
                      <Text variant="caption" size="small" color="surface.text.gray.muted">
                        {simResult.projection_basis}
                      </Text>
                    ) : null}
                  </Box>

                  {/* Explanation */}
                  <Box
                    backgroundColor="surface.background.gray.moderate"
                    borderRadius="medium"
                    padding="spacing.4"
                  >
                    <Text variant="caption" size="small" color="surface.text.gray.muted">
                      Risk &amp; policy analysis
                    </Text>
                    <Text size="small" marginTop="spacing.2">
                      {simResult.explanation}
                    </Text>
                  </Box>
                </Box>
              </CardBody>
            </Card>
          ) : (
            <Box
              height="100%"
              minHeight="320px"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              gap="spacing.3"
              padding="spacing.7"
              borderRadius="medium"
              borderWidth="thin"
              borderStyle="dashed"
              borderColor="surface.border.gray.muted"
            >
              <Heading size="small">Ready to simulate</Heading>
              <Text size="small" color="surface.text.gray.muted" textAlign="center">
                Adjust the rule parameters on the left and run an offline simulation to project the
                impact across historical payments.
              </Text>
              <Button
                variant="primary"
                icon={PlayIcon}
                isLoading={loading}
                onClick={handleSimulate}
              >
                Run Simulation
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
