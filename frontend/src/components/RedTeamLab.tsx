'use client';

import React, { useState, useEffect } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Code,
  Heading,
  Spinner,
  Text,
  useToast,
  CrosshairIcon,
  FlaskIcon,
  PlayIcon,
  ShieldIcon,
  ZapIcon,
} from '@razorpay/blade/components';
import { fetchRedTeamScenarios, runRedTeamAttack } from '../lib/api';

// ---- Local types for /api/redteam responses ----

interface RedTeamScenario {
  id: string;
  title: string;
  attack_type: string;
  payload: Record<string, unknown>;
  description: string;
  expected_defense: string;
  forced_action?: string;
}

interface PolicyValidation {
  action_allowed: boolean;
  rule_enforced: string;
  policy_reason: string;
  requires_escalation: boolean;
}

interface IngestionRecord {
  event_id: string;
  is_duplicate: boolean;
  status: string;
}

/**
 * The run endpoint returns two shapes:
 * - standard pipeline: ai_proposed_action / adversary_forced_action /
 *   action_tested / policy_validation
 * - duplicate replay (duplicate_replay_2): first_ingestion / replay_ingestion,
 *   no policy_validation
 * Both always carry scenario, defense_verdict and passed_safety_target.
 */
interface AttackResult {
  scenario: RedTeamScenario;
  defense_verdict: string;
  passed_safety_target: boolean;
  // Standard pipeline shape
  ai_proposed_action?: string;
  ai_reasoning?: string;
  adversary_forced_action?: string | null;
  action_tested?: string;
  policy_validation?: PolicyValidation;
  // Duplicate-replay shape
  attack_executed?: string;
  first_ingestion?: IngestionRecord;
  replay_ingestion?: IngestionRecord;
}

const PanelLabel: React.FC<{ children: string }> = ({ children }) => (
  <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
    {children}
  </Text>
);

const PayloadBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
  const lines = JSON.stringify(payload, null, 2).split('\n');
  return (
    <Box
      backgroundColor="surface.background.gray.subtle"
      padding="spacing.4"
      borderRadius="medium"
      overflowX="auto"
      display="flex"
      flexDirection="column"
      gap="spacing.1"
    >
      {lines.map((line, idx) => (
        <Code key={idx} size="small" isHighlighted={false} color="surface.text.gray.subtle">
          {line.length > 0 ? line.replace(/ /g, '\u00A0') : '\u00A0'}
        </Code>
      ))}
    </Box>
  );
};

const IngestionPanel: React.FC<{ label: string; record: IngestionRecord }> = ({
  label,
  record,
}) => (
  <Box
    flex="1"
    minWidth="spacing.0"
    backgroundColor="surface.background.gray.subtle"
    padding="spacing.4"
    borderRadius="medium"
    display="flex"
    flexDirection="column"
    gap="spacing.2"
  >
    <PanelLabel>{label}</PanelLabel>
    <Code size="small">{record.event_id}</Code>
    <Box display="flex" alignItems="center" gap="spacing.2" flexWrap="wrap">
      <Badge
        size="small"
        color={record.is_duplicate ? 'positive' : 'neutral'}
        icon={record.is_duplicate ? ShieldIcon : ZapIcon}
      >
        {record.status}
      </Badge>
      <Text size="xsmall" color="surface.text.gray.muted">
        {record.is_duplicate ? 'Duplicate detected' : 'First ingestion of this event_id'}
      </Text>
    </Box>
  </Box>
);

export const RedTeamLab: React.FC = () => {
  const [scenarios, setScenarios] = useState<RedTeamScenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [activeScenario, setActiveScenario] = useState<string>('prompt_injection_1');
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchRedTeamScenarios()
      .then((res: RedTeamScenario[]) => {
        setScenarios(res);
        if (res.length > 0) setActiveScenario(res[0].id);
      })
      .catch((err: unknown) => {
        toast.show({
          content: err instanceof Error ? err.message : 'Failed to fetch red-team scenarios',
          color: 'negative',
        });
      })
      .finally(() => setScenariosLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRunAttack = async (scenarioId: string): Promise<void> => {
    setActiveScenario(scenarioId);
    setLoading(true);
    try {
      const res: AttackResult = await runRedTeamAttack(scenarioId);
      setAttackResult(res);
    } catch (err) {
      toast.show({
        content:
          err instanceof Error
            ? `Error executing attack simulation: ${err.message}`
            : 'Error executing attack simulation',
        color: 'negative',
      });
    } finally {
      setLoading(false);
    }
  };

  const isReplayShape = Boolean(attackResult?.first_ingestion && attackResult?.replay_ingestion);
  const passed = attackResult?.passed_safety_target === true;
  const policyValidation = attackResult?.policy_validation;

  // Verdict copy is EARNED from the response — never assumed.
  const verdictTitle = passed ? 'DEFENSE SUCCESSFUL' : 'DEFENSE FAILED';
  const verdictDescription = attackResult
    ? passed
      ? policyValidation
        ? `${policyValidation.rule_enforced} — ${policyValidation.policy_reason}`
        : attackResult.defense_verdict
      : policyValidation
        ? policyValidation.policy_reason
        : attackResult.defense_verdict
    : '';

  return (
    <Box display="flex" flexDirection="column" gap="spacing.4">
      {/* Header */}
      <Card padding="spacing.5">
        <CardBody>
          <Box
            display="flex"
            flexDirection={{ base: 'column', m: 'row' }}
            justifyContent="space-between"
            alignItems={{ base: 'flex-start', m: 'center' }}
            gap="spacing.3"
          >
            <Box display="flex" flexDirection="column" gap="spacing.1">
              <Heading size="small">Adversarial Red-Team Stress Lab</Heading>
              <Text size="small" color="surface.text.gray.muted">
                Execute adversarial attack payloads against the decision pipeline and inspect the
                policy engine&apos;s actual verdict
              </Text>
            </Box>
            <Badge color="neutral" icon={FlaskIcon}>
              Section 25
            </Badge>
          </Box>
        </CardBody>
      </Card>

      <Box
        display="flex"
        flexDirection={{ base: 'column', l: 'row' }}
        gap="spacing.4"
        alignItems="stretch"
      >
        {/* Scenario list */}
        <Box
          display="flex"
          flexDirection="column"
          gap="spacing.3"
          flex="1"
          minWidth="spacing.0"
          flexBasis={{ base: 'auto', l: '40%' }}
        >
          {scenariosLoading ? (
            <Card padding="spacing.5">
              <CardBody>
                <Box display="flex" justifyContent="center" paddingY="spacing.6">
                  <Spinner
                    accessibilityLabel="Loading attack scenarios"
                    label="Loading attack scenarios"
                  />
                </Box>
              </CardBody>
            </Card>
          ) : (
            scenarios.map((sc) => (
              <Card
                key={sc.id}
                padding="spacing.5"
                isSelected={activeScenario === sc.id}
                accessibilityLabel={`Run attack scenario: ${sc.title}`}
                onClick={() => {
                  void handleRunAttack(sc.id);
                }}
              >
                <CardBody>
                  <Box display="flex" flexDirection="column" gap="spacing.2">
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      gap="spacing.3"
                    >
                      <Badge color="negative" size="small" icon={CrosshairIcon}>
                        {sc.attack_type}
                      </Badge>
                      <Button
                        size="xsmall"
                        variant="secondary"
                        icon={PlayIcon}
                        iconPosition="left"
                        isLoading={loading && activeScenario === sc.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRunAttack(sc.id);
                        }}
                      >
                        Execute
                      </Button>
                    </Box>
                    <Text size="small" weight="semibold">
                      {sc.title}
                    </Text>
                    <Text size="xsmall" color="surface.text.gray.muted" truncateAfterLines={2}>
                      {sc.description}
                    </Text>
                  </Box>
                </CardBody>
              </Card>
            ))
          )}
        </Box>

        {/* Result panel */}
        <Box flex="1" minWidth="spacing.0" flexBasis={{ base: 'auto', l: '60%' }}>
          {loading ? (
            <Card padding="spacing.7" minHeight="240px">
              <CardBody>
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  paddingY="spacing.8"
                >
                  <Spinner
                    accessibilityLabel="Running adversarial payload"
                    label="Running adversarial payload against the policy engine"
                    labelPosition="bottom"
                    color="primary"
                    size="large"
                  />
                </Box>
              </CardBody>
            </Card>
          ) : attackResult ? (
            <Card padding="spacing.5">
              <CardBody>
                <Box display="flex" flexDirection="column" gap="spacing.5">
                  {/* Verdict — branches on passed_safety_target, never hardwired */}
                  <Alert
                    color={passed ? 'positive' : 'negative'}
                    emphasis="intense"
                    isDismissible={false}
                    icon={ShieldIcon}
                    title={verdictTitle}
                    description={verdictDescription}
                  />

                  <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
                    <Badge color="negative" size="small" icon={CrosshairIcon}>
                      {attackResult.scenario.attack_type}
                    </Badge>
                    <Text size="small" weight="semibold">
                      {attackResult.scenario.title}
                    </Text>
                  </Box>

                  {isReplayShape ? (
                    /* Duplicate-replay shape: first vs replay ingestion */
                    <Box display="flex" flexDirection="column" gap="spacing.3">
                      {attackResult.attack_executed ? (
                        <Text size="small" color="surface.text.gray.subtle">
                          {attackResult.attack_executed}
                        </Text>
                      ) : null}
                      <Box
                        display="flex"
                        flexDirection={{ base: 'column', m: 'row' }}
                        gap="spacing.3"
                      >
                        {attackResult.first_ingestion ? (
                          <IngestionPanel
                            label="FIRST INGESTION"
                            record={attackResult.first_ingestion}
                          />
                        ) : null}
                        {attackResult.replay_ingestion ? (
                          <IngestionPanel
                            label="REPLAY INGESTION"
                            record={attackResult.replay_ingestion}
                          />
                        ) : null}
                      </Box>
                    </Box>
                  ) : (
                    /* Standard shape: adversarial narrative + policy validation */
                    <Box display="flex" flexDirection="column" gap="spacing.4">
                      <Box
                        display="flex"
                        flexDirection={{ base: 'column', m: 'row' }}
                        gap="spacing.3"
                      >
                        {attackResult.ai_proposed_action ? (
                          <Box
                            flex="1"
                            minWidth="spacing.0"
                            backgroundColor="surface.background.gray.subtle"
                            padding="spacing.4"
                            borderRadius="medium"
                            display="flex"
                            flexDirection="column"
                            gap="spacing.2"
                          >
                            <PanelLabel>AI PROPOSED</PanelLabel>
                            <Code size="small" weight="bold">
                              {attackResult.ai_proposed_action}
                            </Code>
                            {attackResult.ai_reasoning ? (
                              <Text
                                size="xsmall"
                                color="surface.text.gray.subtle"
                                truncateAfterLines={3}
                              >
                                {attackResult.ai_reasoning}
                              </Text>
                            ) : null}
                          </Box>
                        ) : null}

                        {attackResult.adversary_forced_action ? (
                          <Box
                            flex="1"
                            minWidth="spacing.0"
                            backgroundColor="surface.background.gray.subtle"
                            padding="spacing.4"
                            borderRadius="medium"
                            display="flex"
                            flexDirection="column"
                            gap="spacing.2"
                          >
                            <Text
                              size="xsmall"
                              weight="semibold"
                              color="feedback.text.negative.intense"
                            >
                              ADVERSARY FORCED
                            </Text>
                            <Code size="small" weight="bold">
                              {attackResult.adversary_forced_action}
                            </Code>
                            <Text size="xsmall" color="surface.text.gray.subtle">
                              The adversary bypassed the AI&apos;s proposal and pushed this action
                              directly at the policy wall.
                            </Text>
                          </Box>
                        ) : null}

                        {attackResult.action_tested ? (
                          <Box
                            flex="1"
                            minWidth="spacing.0"
                            backgroundColor="surface.background.gray.subtle"
                            padding="spacing.4"
                            borderRadius="medium"
                            display="flex"
                            flexDirection="column"
                            gap="spacing.2"
                          >
                            <PanelLabel>TESTED AT POLICY WALL</PanelLabel>
                            <Code size="small" weight="bold">
                              {attackResult.action_tested}
                            </Code>
                            {policyValidation ? (
                              <Box display="flex" gap="spacing.2" flexWrap="wrap">
                                <Badge
                                  size="small"
                                  color={passed ? 'positive' : 'negative'}
                                  icon={ShieldIcon}
                                >
                                  {policyValidation.action_allowed ? 'ALLOWED' : 'BLOCKED'}
                                </Badge>
                              </Box>
                            ) : null}
                          </Box>
                        ) : null}
                      </Box>

                      {policyValidation ? (
                        <Box display="flex" flexDirection="column" gap="spacing.2">
                          <PanelLabel>POLICY VALIDATION</PanelLabel>
                          <Box display="flex" alignItems="center" gap="spacing.2" flexWrap="wrap">
                            <Code size="small" weight="bold">
                              {policyValidation.rule_enforced}
                            </Code>
                            {policyValidation.requires_escalation ? (
                              <Badge color="notice" size="small">
                                ESCALATED TO HUMAN REVIEW
                              </Badge>
                            ) : null}
                          </Box>
                          <Text size="small">{policyValidation.policy_reason}</Text>
                        </Box>
                      ) : null}
                    </Box>
                  )}

                  {/* Payload */}
                  <Box display="flex" flexDirection="column" gap="spacing.2">
                    <PanelLabel>INGESTED ATTACK PAYLOAD</PanelLabel>
                    <PayloadBlock payload={attackResult.scenario.payload} />
                  </Box>

                  {/* Expected defense (scenario metadata, labeled as expected) */}
                  <Box display="flex" flexDirection="column" gap="spacing.2">
                    <PanelLabel>EXPECTED DEFENSE</PanelLabel>
                    <Text size="small" color="surface.text.gray.subtle">
                      {attackResult.scenario.expected_defense}
                    </Text>
                  </Box>
                </Box>
              </CardBody>
            </Card>
          ) : (
            <Card padding="spacing.7" minHeight="240px">
              <CardBody>
                <Box
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  gap="spacing.3"
                  paddingY="spacing.8"
                >
                  <CrosshairIcon size="large" color="surface.icon.gray.muted" />
                  <Text size="small" color="surface.text.gray.muted" textAlign="center">
                    Select an attack vector to evaluate
                  </Text>
                </Box>
              </CardBody>
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
};
