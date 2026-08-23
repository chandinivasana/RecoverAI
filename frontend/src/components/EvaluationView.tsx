'use client';

import React, { useEffect, useState } from 'react';
import {
  ActionList,
  ActionListItem,
  Alert,
  Amount,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardHeaderLeading,
  ChartBar,
  ChartBarWrapper,
  ChartCartesianGrid,
  ChartLegend,
  ChartTooltip,
  ChartXAxis,
  ChartYAxis,
  Code,
  Dropdown,
  DropdownOverlay,
  Heading,
  PlayIcon,
  ProgressBar,
  SelectInput,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRow,
  Text,
  useToast,
} from '@razorpay/blade/components';
import { runEvaluation } from '../lib/api';

// ---------------------------------------------------------------------------
// Local types for the CURRENT /api/evaluation/run response shape.
// Declared as type aliases (not interfaces) so they stay assignable to the
// index-signature data props of Blade charts.
// ---------------------------------------------------------------------------

type DatasetSplit = 'eval' | 'dev';

type EvalFinancialMetrics = {
  revenue_at_risk: number;
  revenue_recovered: number;
  recovery_rate_percent: number;
  average_ticket_size: number;
};

type EvalMissedRecoverable = {
  count: number;
  revenue: number;
};

type EvalSafetyMetrics = {
  unsafe_actions_attempted: number;
  unsafe_actions_blocked: number;
  unsafe_block_rate_percent: number;
  autonomous_actions_within_policy: number;
  human_escalations: number;
  stopped_actions: number;
  unsafe_financial_leakage: number;
  missed_recoverable_in_escalations: EvalMissedRecoverable;
};

type EvalConfusionCounts = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
};

type EvalDecisionQuality = {
  brier_score: number;
  calibration_score: number;
  expected_calibration_error: number;
  action_distribution: Record<string, number>;
  confusion_by_action: Record<string, EvalConfusionCounts>;
  false_positives: number;
  false_negatives: number;
  false_positive_cost: number;
};

type EvalMissType = 'FALSE_POSITIVE' | 'FALSE_NEGATIVE';

type EvalHonestException = {
  payment_id: string;
  failure_type: string;
  action: string;
  predicted_probability: number;
  actual_outcome: number;
  amount: number;
  miss_type: EvalMissType;
};

type EvalCalibrationBin = {
  bin: string;
  count: number;
  predicted_probability: number;
  actual_recovery_rate: number;
};

type EvaluationResult = {
  dataset_split: string;
  total_evaluated_transactions: number;
  benchmark_disclosure: string;
  generator_seed: number;
  financial_metrics: EvalFinancialMetrics;
  safety_metrics: EvalSafetyMetrics;
  decision_quality: EvalDecisionQuality;
  honest_exceptions: EvalHonestException[];
  calibration_curve: EvalCalibrationBin[];
  evaluated_at: string;
};

type ExceptionRow = EvalHonestException & { id: string };

type ConfusionRow = {
  id: string;
  action: string;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const StatCard: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <Box
    flex="1"
    flexBasis={{ base: '100%', s: 'calc(50% - 12px)', l: 'calc(25% - 12px)' }}
    display="flex"
  >
    <Card padding="spacing.5" width="100%" height="100%">
      <CardBody>
        <Box display="flex" flexDirection="column" gap="spacing.2">
          <Text size="xsmall" weight="medium" color="surface.text.gray.subtle">
            {label}
          </Text>
          {children}
        </Box>
      </CardBody>
    </Card>
  </Box>
);

// ---------------------------------------------------------------------------
// EvaluationView
// ---------------------------------------------------------------------------

export const EvaluationView: React.FC = () => {
  const [evalData, setEvalData] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [split, setSplit] = useState<DatasetSplit>('eval');
  const toast = useToast();

  const handleRunEval = async (targetSplit: DatasetSplit): Promise<void> => {
    setLoading(true);
    try {
      const res = (await runEvaluation(targetSplit)) as EvaluationResult;
      setEvalData(res);
    } catch (err) {
      toast.show({
        content: `Evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
        color: 'negative',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial benchmark run; setters run post-await
    handleRunEval('eval');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exceptionRows: ExceptionRow[] = (evalData?.honest_exceptions ?? []).map((e, index) => ({
    ...e,
    id: `${e.payment_id}-${index}`,
  }));

  const confusionRows: ConfusionRow[] = Object.entries(
    evalData?.decision_quality.confusion_by_action ?? {},
  ).map(([action, counts]) => ({
    id: action,
    action,
    tp: counts.tp,
    fp: counts.fp,
    fn: counts.fn,
    tn: counts.tn,
  }));

  const actionDistribution = Object.entries(evalData?.decision_quality.action_distribution ?? {});
  const totalTransactions = evalData?.total_evaluated_transactions ?? 0;
  const leakage = evalData?.safety_metrics.unsafe_financial_leakage ?? 0;
  const missed = evalData?.safety_metrics.missed_recoverable_in_escalations;

  return (
    <Box display="flex" flexDirection="column" gap="spacing.5">
      {/* (1) Synthetic-benchmark disclosure — rendered verbatim from the API */}
      {evalData && (
        <Alert
          color="information"
          emphasis="subtle"
          isDismissible={false}
          isFullWidth
          title="Synthetic Benchmark Disclosure"
          description={evalData.benchmark_disclosure}
        />
      )}

      {/* Header: title, split selector, run button */}
      <Card padding="spacing.5">
        <CardBody>
          <Box
            display="flex"
            flexDirection={{ base: 'column', m: 'row' }}
            justifyContent="space-between"
            alignItems={{ base: 'flex-start', m: 'center' }}
            gap="spacing.4"
          >
            <Box display="flex" flexDirection="column" gap="spacing.1">
              <Heading size="small">Held-Out Benchmark &amp; Confidence Calibration</Heading>
              <Text size="small" color="surface.text.gray.subtle">
                Synthetic evaluation transactions isolated from policy rule tuning
              </Text>
              {evalData && (
                <Box display="flex" alignItems="center" gap="spacing.3" marginTop="spacing.2">
                  <Badge color="information">{evalData.dataset_split} split</Badge>
                  <Text size="xsmall" color="surface.text.gray.subtle">
                    {evalData.total_evaluated_transactions} transactions evaluated · generator seed{' '}
                    {evalData.generator_seed}
                  </Text>
                </Box>
              )}
            </Box>

            <Box
              display="flex"
              alignItems="center"
              gap="spacing.3"
              flexWrap="wrap"
            >
              <Box minWidth="220px">
                <Dropdown selectionType="single">
                  <SelectInput
                    accessibilityLabel="Dataset split"
                    name="dataset-split"
                    placeholder="Select dataset split"
                    value={split}
                    onChange={({ values }) => {
                      const next = (values[0] ?? 'eval') as DatasetSplit;
                      setSplit(next);
                      handleRunEval(next);
                    }}
                    size="medium"
                  />
                  <DropdownOverlay>
                    <ActionList>
                      <ActionListItem title="Held-out test split" value="eval" />
                      <ActionListItem title="Development split" value="dev" />
                    </ActionList>
                  </DropdownOverlay>
                </Dropdown>
              </Box>
              <Button
                icon={PlayIcon}
                isLoading={loading}
                onClick={() => handleRunEval(split)}
              >
                Run Benchmark
              </Button>
            </Box>
          </Box>
        </CardBody>
      </Card>

      {loading && !evalData && (
        <Box display="flex" justifyContent="center" padding="spacing.10">
          <Spinner
            accessibilityLabel="Running evaluation benchmark"
            color="primary"
            size="large"
            label="Running evaluation benchmark…"
          />
        </Box>
      )}

      {evalData && (
        <>
          {/* (2) Financial metrics */}
          <Box display="flex" flexWrap="wrap" gap="spacing.4">
            <StatCard label="REVENUE AT RISK">
              <Amount
                value={evalData.financial_metrics.revenue_at_risk}
                currency="INR"
                type="heading"
                size="large"
                weight="semibold"
              />
              <Text size="xsmall" color="surface.text.gray.subtle">
                Total value of failed payments in this split
              </Text>
            </StatCard>

            <StatCard label="REVENUE RECOVERED">
              <Amount
                value={evalData.financial_metrics.revenue_recovered}
                currency="INR"
                type="heading"
                size="large"
                weight="semibold"
                color="feedback.text.positive.intense"
              />
              <Text size="xsmall" color="surface.text.gray.subtle">
                Recovered by policy-allowed autonomous actions
              </Text>
            </StatCard>

            <StatCard label="RECOVERY RATE">
              <Heading size="large" color="feedback.text.information.intense">
                {evalData.financial_metrics.recovery_rate_percent}%
              </Heading>
              <Text size="xsmall" color="surface.text.gray.subtle">
                Recovered ÷ at-risk revenue
              </Text>
            </StatCard>

            <StatCard label="AVERAGE TICKET SIZE">
              <Amount
                value={evalData.financial_metrics.average_ticket_size}
                currency="INR"
                type="heading"
                size="large"
                weight="semibold"
              />
              <Text size="xsmall" color="surface.text.gray.subtle">
                Mean failed-payment value
              </Text>
            </StatCard>
          </Box>

          {/* (3) Decision quality */}
          <Box display="flex" flexWrap="wrap" gap="spacing.4">
            <StatCard label="BRIER SCORE">
              <Heading size="large">{evalData.decision_quality.brier_score}</Heading>
              <Text size="xsmall" color="surface.text.gray.subtle">
                Mean squared forecast error — 0 is perfect, lower is better
              </Text>
            </StatCard>

            <StatCard label="EXPECTED CALIBRATION ERROR">
              <Heading size="large">
                {evalData.decision_quality.expected_calibration_error}
              </Heading>
              <Text size="xsmall" color="surface.text.gray.subtle">
                Bin-weighted gap between predicted and actual — lower is better
              </Text>
            </StatCard>

            <StatCard label="PREDICTION MISSES">
              <Box display="flex" gap="spacing.3" alignItems="center">
                <Badge color="negative">
                  {`${evalData.decision_quality.false_positives} false positives`}
                </Badge>
                <Badge color="notice">
                  {`${evalData.decision_quality.false_negatives} false negatives`}
                </Badge>
              </Box>
              <Text size="xsmall" color="surface.text.gray.subtle">
                Forecast ≥ 0.50 that failed / forecast &lt; 0.50 that recovered
              </Text>
            </StatCard>

            <StatCard label="FALSE POSITIVE COST">
              <Amount
                value={evalData.decision_quality.false_positive_cost}
                currency="INR"
                type="heading"
                size="large"
                weight="semibold"
                color={
                  evalData.decision_quality.false_positive_cost > 0
                    ? 'feedback.text.negative.intense'
                    : 'surface.text.gray.normal'
                }
              />
              <Text size="xsmall" color="surface.text.gray.subtle">
                Revenue on actions predicted to succeed that did not recover
              </Text>
            </StatCard>
          </Box>

          {/* (4) Safety metrics */}
          <Box display="flex" flexWrap="wrap" gap="spacing.4">
            <StatCard label="UNSAFE ACTION BLOCK RATE">
              <Heading size="large" color="feedback.text.positive.intense">
                {evalData.safety_metrics.unsafe_block_rate_percent}%
              </Heading>
              <Text size="xsmall" color="surface.text.gray.subtle">
                {evalData.safety_metrics.unsafe_actions_blocked} of{' '}
                {evalData.safety_metrics.unsafe_actions_attempted} unsafe attempts blocked by the
                policy engine
              </Text>
            </StatCard>

            <StatCard label="ACTION OUTCOMES">
              <Box display="flex" flexDirection="column" gap="spacing.2">
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Text size="xsmall" color="feedback.text.information.intense">
                    Autonomous within policy
                  </Text>
                  <Text size="small" weight="semibold">
                    {evalData.safety_metrics.autonomous_actions_within_policy}
                  </Text>
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Text size="xsmall" color="feedback.text.notice.intense">
                    Escalated to human
                  </Text>
                  <Text size="small" weight="semibold">
                    {evalData.safety_metrics.human_escalations}
                  </Text>
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Text size="xsmall" color="surface.text.gray.subtle">
                    Stopped
                  </Text>
                  <Text size="small" weight="semibold">
                    {evalData.safety_metrics.stopped_actions}
                  </Text>
                </Box>
              </Box>
            </StatCard>

            <StatCard label="UNSAFE FINANCIAL LEAKAGE">
              <Amount
                value={leakage}
                currency="INR"
                type="heading"
                size="large"
                weight="semibold"
                color={
                  leakage > 0 ? 'feedback.text.negative.intense' : 'surface.text.gray.normal'
                }
              />
              <Box>
                <Badge color="neutral" size="small">
                  Measured, not asserted
                </Badge>
              </Box>
              <Text size="xsmall" color="surface.text.gray.subtle">
                Revenue recovered by unsafe-per-policy actions that were still allowed
              </Text>
            </StatCard>

            <StatCard label="MISSED RECOVERABLE IN ESCALATIONS">
              <Box display="flex" alignItems="baseline" gap="spacing.3">
                <Heading size="large" color="feedback.text.notice.intense">
                  {missed?.count ?? 0}
                </Heading>
                <Amount
                  value={missed?.revenue ?? 0}
                  currency="INR"
                  type="body"
                  size="medium"
                  weight="semibold"
                />
              </Box>
              <Box>
                <Badge color="notice" size="small">
                  The honest cost of safety
                </Badge>
              </Box>
              <Text size="xsmall" color="surface.text.gray.subtle">
                Latently-recoverable payments deliberately gated behind escalation or stop
              </Text>
            </StatCard>
          </Box>

          {/* (5) Calibration curve + action distribution */}
          <Box display="flex" flexWrap="wrap" gap="spacing.4">
            <Box flex="2" flexBasis={{ base: '100%', l: 'calc(66% - 12px)' }} display="flex">
              <Card padding="spacing.5" width="100%" height="100%">
                <CardHeader>
                  <CardHeaderLeading
                    title="Confidence Calibration Curve"
                    subtitle="Mean predicted probability vs actual recovery rate per forecast bin"
                  />
                </CardHeader>
                <CardBody>
                  <Box width="100%" height="320px">
                    <ChartBarWrapper
                      data={evalData.calibration_curve}
                      width="100%"
                      height="100%"
                    >
                      <ChartCartesianGrid />
                      <ChartXAxis dataKey="bin" />
                      <ChartYAxis domain={[0, 1]} />
                      <ChartTooltip />
                      <ChartLegend />
                      <ChartBar
                        dataKey="predicted_probability"
                        name="Mean Predicted Probability"
                        color="data.background.categorical.blue.moderate"
                      />
                      <ChartBar
                        dataKey="actual_recovery_rate"
                        name="Actual Recovery Rate"
                        color="data.background.categorical.green.moderate"
                      />
                    </ChartBarWrapper>
                  </Box>
                </CardBody>
              </Card>
            </Box>

            <Box flex="1" flexBasis={{ base: '100%', l: 'calc(34% - 12px)' }} display="flex">
              <Card padding="spacing.5" width="100%" height="100%">
                <CardHeader>
                  <CardHeaderLeading
                    title="Action Space Distribution"
                    subtitle="Recommended actions across the evaluated split"
                  />
                </CardHeader>
                <CardBody>
                  <Box display="flex" flexDirection="column" gap="spacing.4">
                    {actionDistribution.map(([action, count]) => {
                      const pct =
                        totalTransactions > 0
                          ? Math.round((count / totalTransactions) * 100)
                          : 0;
                      return (
                        <Box key={action} display="flex" flexDirection="column" gap="spacing.1">
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Code size="small">{action}</Code>
                            <Text size="xsmall" color="surface.text.gray.subtle">
                              {count} ({pct}%)
                            </Text>
                          </Box>
                          <ProgressBar
                            type="meter"
                            variant="linear"
                            accessibilityLabel={`${action}: ${count} of ${totalTransactions} transactions`}
                            value={count}
                            min={0}
                            max={Math.max(1, totalTransactions)}
                          />
                        </Box>
                      );
                    })}
                    {actionDistribution.length === 0 && (
                      <Text size="small" color="surface.text.gray.subtle">
                        No actions recorded on this split.
                      </Text>
                    )}
                  </Box>
                </CardBody>
              </Card>
            </Box>
          </Box>

          {/* (6) Honest exceptions */}
          <Card padding="spacing.5">
            <CardHeader>
              <CardHeaderLeading
                title="Honest Exceptions"
                subtitle="Individual prediction misses on policy-allowed actions — most expensive first"
              />
            </CardHeader>
            <CardBody>
              {exceptionRows.length === 0 ? (
                <Text size="small" color="surface.text.gray.subtle">
                  No prediction misses recorded on this split.
                </Text>
              ) : (
                <Table data={{ nodes: exceptionRows }} rowDensity="compact" showStripedRows>
                  {(tableData) => (
                    <>
                      <TableHeader>
                        <TableHeaderRow>
                          <TableHeaderCell>Payment ID</TableHeaderCell>
                          <TableHeaderCell>Failure Type</TableHeaderCell>
                          <TableHeaderCell>Action</TableHeaderCell>
                          <TableHeaderCell textAlign="right">Predicted P(recovery)</TableHeaderCell>
                          <TableHeaderCell>Actual Outcome</TableHeaderCell>
                          <TableHeaderCell textAlign="right">Amount</TableHeaderCell>
                          <TableHeaderCell>Miss Type</TableHeaderCell>
                        </TableHeaderRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.map((row) => (
                          <TableRow key={row.id} item={row}>
                            <TableCell>
                              <Code size="small">{row.payment_id}</Code>
                            </TableCell>
                            <TableCell>{row.failure_type}</TableCell>
                            <TableCell>
                              <Code size="small">{row.action}</Code>
                            </TableCell>
                            <TableCell textAlign="right">
                              {row.predicted_probability.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                size="small"
                                color={row.actual_outcome === 1 ? 'positive' : 'negative'}
                              >
                                {row.actual_outcome === 1 ? 'Recovered' : 'Failed'}
                              </Badge>
                            </TableCell>
                            <TableCell textAlign="right">
                              <Amount value={row.amount} currency="INR" type="body" size="small" />
                            </TableCell>
                            <TableCell>
                              <Badge
                                size="small"
                                color={row.miss_type === 'FALSE_POSITIVE' ? 'negative' : 'notice'}
                              >
                                {row.miss_type}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </>
                  )}
                </Table>
              )}
            </CardBody>
          </Card>

          {/* (7) Confusion matrix by action */}
          <Card padding="spacing.5">
            <CardHeader>
              <CardHeaderLeading
                title="Confusion Matrix by Action"
                subtitle="Forecast (threshold 0.50) vs actual outcome, per recommended action"
              />
            </CardHeader>
            <CardBody>
              {confusionRows.length === 0 ? (
                <Text size="small" color="surface.text.gray.subtle">
                  No policy-allowed autonomous actions on this split — no confusion matrix to
                  report.
                </Text>
              ) : (
                <Table data={{ nodes: confusionRows }} rowDensity="compact">
                  {(tableData) => (
                    <>
                      <TableHeader>
                        <TableHeaderRow>
                          <TableHeaderCell>Action</TableHeaderCell>
                          <TableHeaderCell textAlign="right">True Positives</TableHeaderCell>
                          <TableHeaderCell textAlign="right">False Positives</TableHeaderCell>
                          <TableHeaderCell textAlign="right">False Negatives</TableHeaderCell>
                          <TableHeaderCell textAlign="right">True Negatives</TableHeaderCell>
                        </TableHeaderRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.map((row) => (
                          <TableRow key={row.id} item={row}>
                            <TableCell>
                              <Code size="small">{row.action}</Code>
                            </TableCell>
                            <TableCell textAlign="right">{row.tp}</TableCell>
                            <TableCell textAlign="right">{row.fp}</TableCell>
                            <TableCell textAlign="right">{row.fn}</TableCell>
                            <TableCell textAlign="right">{row.tn}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </>
                  )}
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </Box>
  );
};
