'use client';

import React, { useState, useEffect } from 'react';
import {
  ActionList,
  ActionListItem,
  Alert,
  Amount,
  ArrowUpRightIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardFooterTrailing,
  CardHeader,
  CardHeaderLeading,
  ChartArea,
  ChartAreaWrapper,
  ChartCartesianGrid,
  ChartLegend,
  ChartTooltip,
  ChartXAxis,
  ChartYAxis,
  Dropdown,
  DropdownOverlay,
  Heading,
  Link,
  SearchInput,
  SelectInput,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRow,
  Text,
  TrendingUpIcon,
  ZapIcon,
  useToast,
} from '@razorpay/blade/components';
import type { TableData } from '@razorpay/blade/components';
import { DashboardKPIs, PaymentItem, StrategyStat, AuditEvent, AnomalyItem } from '../types';
import {
  fetchKPIs, fetchTimeseries, fetchStrategies, fetchPayments,
  fetchAgentFeed, fetchAnomalies, processFullRecovery, batchProcessRecoveries
} from '../lib/api';
import { AgentActivityFeed } from './AgentActivityFeed';
import { ABExperimentWidget } from './ABExperimentWidget';

interface TimeseriesPoint {
  date: string;
  revenue_at_risk: number;
  revenue_recovered: number;
  failed_count: number;
  recovered_count: number;
  // Index signature so the shape satisfies Blade's chart data contract.
  [key: string]: string | number;
}

interface DashboardProps {
  onSelectPayment: (paymentId: string) => void;
  onNavigateToReviews: () => void;
  merchantId?: string; // '' or undefined = all merchants
}

type FeedbackColor = 'positive' | 'negative' | 'notice' | 'information' | 'neutral';

type StrategyRow = StrategyStat & { id: string };
type PaymentRow = PaymentItem & { id: string };

// Status color language (consistent across the app):
// recovered → positive · failed → negative · escalated_to_human → notice
// processing_recovery → information · stopped / permanently_failed → neutral gray
const STATUS_BADGE_CONFIG: Record<string, { label: string; color: FeedbackColor }> = {
  recovered: { label: 'Recovered', color: 'positive' },
  failed: { label: 'Failed', color: 'negative' },
  escalated_to_human: { label: 'Escalated', color: 'notice' },
  processing_recovery: { label: 'Processing', color: 'information' },
  stopped: { label: 'Stopped', color: 'neutral' },
  permanently_failed: { label: 'Perm. Failed', color: 'neutral' },
};

const ANOMALY_SEVERITY_COLOR: Record<AnomalyItem['severity'], FeedbackColor> = {
  HIGH: 'negative',
  MEDIUM: 'notice',
  LOW: 'information',
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const Dashboard: React.FC<DashboardProps> = ({ onSelectPayment, onNavigateToReviews, merchantId }) => {
  const toast = useToast();

  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [strategies, setStrategies] = useState<StrategyStat[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [feed, setFeed] = useState<AuditEvent[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [dismissedAnomalies, setDismissedAnomalies] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [singleProcessing, setSingleProcessing] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const loadData = async () => {
    try {
      const [kpiRes, tsRes, stratRes, payRes, feedRes, anomRes] = await Promise.all([
        fetchKPIs(merchantId || undefined),
        fetchTimeseries(merchantId || undefined),
        fetchStrategies(merchantId || undefined),
        fetchPayments({ status: statusFilter || undefined, payment_method: methodFilter || undefined, merchant_id: merchantId || undefined, search: search || undefined, limit: 15 }),
        fetchAgentFeed(15),
        fetchAnomalies(),
      ]);
      setKpis(kpiRes);
      setTimeseries(tsRes);
      setStrategies(stratRes);
      setPayments(payRes.payments || []);
      setFeed(feedRes || []);
      setAnomalies(anomRes || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; setters run post-await
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData identity changes each render; polling is keyed by the filters
  }, [statusFilter, methodFilter, search, merchantId]);

  const handleRunSingleRecovery = async (paymentId: string) => {
    setSingleProcessing(paymentId);
    try {
      await processFullRecovery(paymentId);
      await loadData();
    } catch (err) {
      toast.show({ content: `Error running recovery: ${errorMessage(err)}`, color: 'negative' });
    } finally {
      setSingleProcessing(null);
    }
  };

  const handleBatchProcess = async () => {
    setBatchProcessing(true);
    try {
      await batchProcessRecoveries(10, 'dev');
      await loadData();
    } catch (err) {
      toast.show({ content: `Batch recovery error: ${errorMessage(err)}`, color: 'negative' });
    } finally {
      setBatchProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_BADGE_CONFIG[status] ?? { label: 'Failed', color: 'negative' as FeedbackColor };
    return (
      <Badge size="small" color={config.color}>
        {config.label}
      </Badge>
    );
  };

  const visibleAnomalies = anomalies.filter((a) => !dismissedAnomalies.has(a.error_code));

  const strategyTableData: TableData<StrategyRow> = {
    nodes: strategies.map((st) => ({ ...st, id: st.strategy })),
  };

  const paymentsTableData: TableData<PaymentRow> = {
    nodes: payments.map((p) => ({ ...p, id: p.payment_id })),
  };

  return (
    <Box display="flex" flexDirection="column" gap="spacing.5">
      {/* Gateway telemetry anomalies (from API, dismissable per error code) */}
      {visibleAnomalies.length > 0 && (
        <Box display="flex" flexDirection="column" gap="spacing.3">
          {visibleAnomalies.map((anomaly) => (
            <Alert
              key={anomaly.error_code}
              title={`Gateway Telemetry Alert: ${anomaly.error_code}`}
              description={`${anomaly.message} Recommended action: ${anomaly.recommended_action}`}
              color={ANOMALY_SEVERITY_COLOR[anomaly.severity] ?? 'notice'}
              emphasis="subtle"
              isFullWidth
              isDismissible
              onDismiss={() =>
                setDismissedAnomalies((prev) => {
                  const next = new Set(prev);
                  next.add(anomaly.error_code);
                  return next;
                })
              }
            />
          ))}
        </Box>
      )}

      {/* KPI stat cards */}
      <Box
        display="grid"
        gridTemplateColumns={{ base: '1fr', s: 'repeat(2, 1fr)', l: 'repeat(4, 1fr)' }}
        gap="spacing.4"
      >
        {/* Revenue at Risk */}
        <Card padding="spacing.5">
          <CardBody>
            <Box display="flex" flexDirection="column" gap="spacing.2">
              <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                REVENUE AT RISK
              </Text>
              <Amount
                value={kpis ? Number(kpis.revenue_at_risk) : 0}
                currency="INR"
                type="heading"
                size="xlarge"
                weight="semibold"
                suffix="none"
              />
              <Text size="xsmall" color="surface.text.gray.muted">
                {kpis?.total_failed_transactions || 0} failed transactions
              </Text>
            </Box>
          </CardBody>
        </Card>

        {/* Revenue Recovered */}
        <Card padding="spacing.5">
          <CardBody>
            <Box display="flex" flexDirection="column" gap="spacing.2">
              <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                REVENUE RECOVERED
              </Text>
              <Amount
                value={kpis ? Number(kpis.revenue_recovered) : 0}
                currency="INR"
                type="heading"
                size="xlarge"
                weight="semibold"
                suffix="none"
                color="feedback.text.positive.intense"
              />
              <Text size="xsmall" color="feedback.text.positive.intense">
                {kpis?.recovered_transactions_count || 0} settled autonomously
              </Text>
            </Box>
          </CardBody>
        </Card>

        {/* Recovery Rate */}
        <Card padding="spacing.5">
          <CardBody>
            <Box display="flex" flexDirection="column" gap="spacing.2">
              <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                RECOVERY RATE
              </Text>
              <Box display="flex" flexDirection="row" alignItems="center" gap="spacing.3">
                <Heading size="xlarge" color="feedback.text.information.intense">
                  {kpis?.recovery_rate_percent ?? 0}%
                </Heading>
                <TrendingUpIcon size="medium" color="feedback.icon.information.intense" />
              </Box>
              <Text size="xsmall" color="surface.text.gray.muted">
                Primary optimization metric
              </Text>
            </Box>
          </CardBody>
        </Card>

        {/* Human Escalations */}
        <Card
          padding="spacing.5"
          onClick={onNavigateToReviews}
          shouldScaleOnHover
          accessibilityLabel="View pending human escalations"
        >
          <CardBody>
            <Box display="flex" flexDirection="column" gap="spacing.2">
              <Box display="flex" flexDirection="row" justifyContent="space-between" alignItems="center">
                <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                  HUMAN ESCALATIONS
                </Text>
                <ArrowUpRightIcon size="small" color="surface.icon.gray.muted" />
              </Box>
              <Heading size="xlarge" color="feedback.text.notice.intense">
                {kpis?.pending_human_escalations || 0}
              </Heading>
              <Text size="xsmall" weight="medium" color="feedback.text.notice.intense">
                Pending operator review
              </Text>
            </Box>
          </CardBody>
        </Card>
      </Box>

      {/* Main split: revenue chart + live agent decision feed */}
      <Box
        display="grid"
        gridTemplateColumns={{ base: '1fr', l: '2fr 1fr' }}
        gap="spacing.4"
        alignItems="stretch"
      >
        <Card padding="spacing.5">
          <CardHeader>
            <CardHeaderLeading
              title="Revenue Recovery Performance"
              subtitle="Failed volume at risk vs. actual settled recovery (INR)"
            />
          </CardHeader>
          <CardBody>
            {/* Explicitly sized block container: the chart's ResponsiveContainer
                collapses to -1x-1 inside an unsized flex CardBody. */}
            <Box width="100%" height="280px" display="block">
              <ChartAreaWrapper data={timeseries} width="100%" height="100%">
              <ChartCartesianGrid />
              <ChartXAxis dataKey="date" />
              <ChartYAxis
                tickFormatter={(value: number) =>
                  value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : `₹${value}`
                }
              />
              <ChartTooltip />
              <ChartLegend />
              <ChartArea
                dataKey="revenue_at_risk"
                name="Revenue at Risk"
                type="monotone"
                color="data.background.categorical.red.strong"
              />
              <ChartArea
                dataKey="revenue_recovered"
                name="Revenue Recovered"
                type="monotone"
                color="data.background.categorical.green.strong"
              />
              </ChartAreaWrapper>
            </Box>
          </CardBody>
          <CardFooter>
            <CardFooterTrailing
              actions={{
                primary: {
                  text: batchProcessing ? 'Executing Batch…' : 'Batch Process 10 Txns',
                  onClick: handleBatchProcess,
                  isLoading: batchProcessing,
                  icon: ZapIcon,
                },
              }}
            />
          </CardFooter>
        </Card>

        {/* Live decision feed (migrated separately) */}
        <AgentActivityFeed events={feed} onSelectPayment={onSelectPayment} />
      </Box>

      {/* Recovery strategy performance table */}
      <Card padding="spacing.5">
        <CardHeader>
          <CardHeaderLeading
            title="Strategy Attribution & Efficiency (Section 23)"
            subtitle="Bounded action yield and settled recovery metrics"
          />
        </CardHeader>
        <CardBody>
          <Box overflowX="auto">
            <Table data={strategyTableData} rowDensity="compact">
              {(tableData) => (
                <>
                  <TableHeader>
                    <TableHeaderRow>
                      <TableHeaderCell>Strategy Rail</TableHeaderCell>
                      <TableHeaderCell>Attempts</TableHeaderCell>
                      <TableHeaderCell>Settled</TableHeaderCell>
                      <TableHeaderCell>Conversion</TableHeaderCell>
                      <TableHeaderCell textAlign="right">Recovered Amount</TableHeaderCell>
                    </TableHeaderRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.map((st) => (
                      <TableRow key={st.id} item={st}>
                        <TableCell>
                          <Text size="small" weight="medium">{st.strategy}</Text>
                        </TableCell>
                        <TableCell>
                          <Text size="small" color="surface.text.gray.muted">{st.attempts}</Text>
                        </TableCell>
                        <TableCell>
                          <Text size="small" weight="semibold" color="feedback.text.positive.intense">
                            {st.recoveries}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Text size="small" weight="semibold" color="feedback.text.information.intense">
                            {st.recovery_rate_percent}%
                          </Text>
                        </TableCell>
                        <TableCell textAlign="right">
                          <Amount value={Number(st.revenue_recovered)} currency="INR" weight="semibold" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </>
              )}
            </Table>
          </Box>
        </CardBody>
      </Card>

      {/* Live A/B strategy performance experiments (migrated separately) */}
      <ABExperimentWidget />

      {/* Transactions data table */}
      <Card padding="spacing.5">
        <CardHeader>
          <CardHeaderLeading
            title="Payment Events & Transaction Stream"
            subtitle="Failed payment ingestion log and agent action states"
          />
        </CardHeader>
        <CardBody>
          <Box display="flex" flexDirection="column" gap="spacing.4">
            {/* Filters */}
            <Box display="flex" flexDirection="row" flexWrap="wrap" gap="spacing.3" alignItems="flex-end">
              <Box minWidth="240px">
                <SearchInput
                  label="Search"
                  placeholder="Search ID, customer..."
                  value={search}
                  onChange={({ value }) => setSearch(value ?? '')}
                  onClearButtonClick={() => setSearch('')}
                />
              </Box>

              <Box minWidth="180px">
                <Dropdown selectionType="single">
                  <SelectInput
                    label="Status"
                    placeholder="All Statuses"
                    value={statusFilter || 'all'}
                    onChange={({ values }) =>
                      setStatusFilter(values[0] === 'all' ? '' : values[0] ?? '')
                    }
                  />
                  <DropdownOverlay>
                    <ActionList>
                      <ActionListItem title="All Statuses" value="all" />
                      <ActionListItem title="Failed" value="failed" />
                      <ActionListItem title="Recovered" value="recovered" />
                      <ActionListItem title="Escalated" value="escalated_to_human" />
                      <ActionListItem title="Stopped" value="stopped" />
                    </ActionList>
                  </DropdownOverlay>
                </Dropdown>
              </Box>

              <Box minWidth="180px">
                <Dropdown selectionType="single">
                  <SelectInput
                    label="Method"
                    placeholder="All Methods"
                    value={methodFilter || 'all'}
                    onChange={({ values }) =>
                      setMethodFilter(values[0] === 'all' ? '' : values[0] ?? '')
                    }
                  />
                  <DropdownOverlay>
                    <ActionList>
                      <ActionListItem title="All Methods" value="all" />
                      <ActionListItem title="UPI" value="upi" />
                      <ActionListItem title="Card" value="card" />
                      <ActionListItem title="NetBanking" value="netbanking" />
                      <ActionListItem title="EMI" value="emi" />
                    </ActionList>
                  </DropdownOverlay>
                </Dropdown>
              </Box>
            </Box>

            <Box overflowX="auto">
              <Table data={paymentsTableData} rowDensity="compact">
                {(tableData) => (
                  <>
                    <TableHeader>
                      <TableHeaderRow>
                        <TableHeaderCell>Payment ID</TableHeaderCell>
                        <TableHeaderCell>Customer</TableHeaderCell>
                        <TableHeaderCell>Method</TableHeaderCell>
                        <TableHeaderCell>Amount</TableHeaderCell>
                        <TableHeaderCell>Diagnostic Failure Reason</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell textAlign="right">Action</TableHeaderCell>
                      </TableHeaderRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((p) => (
                        <TableRow key={p.id} item={p}>
                          <TableCell>
                            <Link
                              variant="button"
                              size="small"
                              onClick={() => onSelectPayment(p.payment_id)}
                            >
                              {p.payment_id}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Text size="small">{p.customer_name}</Text>
                          </TableCell>
                          <TableCell>
                            <Text size="xsmall" color="surface.text.gray.muted">
                              {(p.payment_method || '').toUpperCase()}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <Amount value={Number(p.amount)} currency="INR" weight="semibold" />
                          </TableCell>
                          <TableCell>
                            <Text size="xsmall" color="surface.text.gray.muted" truncateAfterLines={1}>
                              {p.failure_reason}
                            </Text>
                          </TableCell>
                          <TableCell>{getStatusBadge(p.status)}</TableCell>
                          <TableCell textAlign="right">
                            {p.status === 'failed' ? (
                              <Button
                                size="xsmall"
                                variant="primary"
                                icon={ZapIcon}
                                isLoading={singleProcessing === p.payment_id}
                                onClick={() => handleRunSingleRecovery(p.payment_id)}
                              >
                                Recover
                              </Button>
                            ) : (
                              <Button
                                size="xsmall"
                                variant="secondary"
                                onClick={() => onSelectPayment(p.payment_id)}
                              >
                                Inspect
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}
              </Table>
            </Box>
          </Box>
        </CardBody>
      </Card>
    </Box>
  );
};
