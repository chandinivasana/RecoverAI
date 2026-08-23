'use client';

import React, { useEffect, useState } from 'react';
import {
  Amount,
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  CardHeaderCounter,
  CardHeaderIcon,
  CardHeaderLeading,
  Code,
  ProgressBar,
  Spinner,
  Text,
  TrendingDownIcon,
  TrendingUpIcon,
} from '@razorpay/blade/components';
import { fetchExperiments } from '../lib/api';

// No props today — the widget owns its data fetch (/api/analytics/experiments).
type ABExperimentWidgetProps = Record<string, never>;

interface ExperimentVariant {
  name: string;
  attempts: number;
  recovered: number;
  recovery_rate_percent: number;
  revenue_recovered: number;
}

interface Experiment {
  experiment_id: string;
  title: string;
  status: string;
  sample_size: number;
  variant_a: ExperimentVariant;
  variant_b: ExperimentVariant;
  chi2_statistic: number | null;
  stat_significance_p_value: number | null;
  lift_percent: number;
  conclusion: string;
  data_source?: string;
}

type BadgeColor = 'positive' | 'negative' | 'notice' | 'information' | 'neutral';

type WidgetState = 'loading' | 'error' | 'ready';

const statusBadgeColor = (status: string): BadgeColor => {
  if (status === 'COLLECTING') return 'notice';
  if (status === 'RUNNING') return 'information';
  return 'neutral';
};

const VariantStats = ({ variant }: { variant: ExperimentVariant }): React.ReactElement => (
  <Box
    flex={1}
    flexBasis={{ base: '100%', s: 'calc(50% - 6px)' }}
    backgroundColor="surface.background.gray.intense"
    borderRadius="medium"
    padding="spacing.3"
    display="flex"
    flexDirection="column"
    gap="spacing.2"
  >
    <Text variant="caption" size="small" color="surface.text.gray.subtle" truncateAfterLines={1}>
      {variant.name}
    </Text>
    <Text variant="body" size="large" weight="semibold">
      {variant.recovery_rate_percent}%
    </Text>
    <ProgressBar
      type="meter"
      variant="linear"
      value={variant.recovery_rate_percent}
      accessibilityLabel={`${variant.name} recovery rate ${variant.recovery_rate_percent}%`}
    />
    <Box display="flex" alignItems="baseline" gap="spacing.2" flexWrap="wrap">
      <Text variant="caption" size="small" color="surface.text.gray.subtle">
        {variant.recovered}/{variant.attempts} recovered
      </Text>
      <Amount value={variant.revenue_recovered} currency="INR" type="body" size="xsmall" />
    </Box>
  </Box>
);

export const ABExperimentWidget: React.FC<ABExperimentWidgetProps> = () => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [state, setState] = useState<WidgetState>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchExperiments()
      .then((data: Experiment[]) => {
        if (cancelled) return;
        setExperiments(Array.isArray(data) ? data : []);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The synthetic-data disclosure comes from the API response — surfaced
  // verbatim, never hardcoded in the UI.
  const disclosures = Array.from(
    new Set(experiments.map((exp) => exp.data_source).filter(Boolean)),
  ) as string[];

  return (
    <Card padding="spacing.5" width="100%">
      <CardHeader>
        <CardHeaderLeading
          title="Live A/B Strategy Performance Experiments"
          subtitle="Section 8 / Strategy Optimization"
          prefix={<CardHeaderIcon icon={TrendingUpIcon} />}
          suffix={
            state === 'ready' && experiments.length > 0 ? (
              <CardHeaderCounter value={experiments.length} />
            ) : undefined
          }
        />
      </CardHeader>
      <CardBody>
        {state === 'loading' && (
          <Spinner accessibilityLabel="Loading experiments" label="Loading experiments" color="primary" />
        )}

        {state === 'error' && (
          <Text variant="caption" size="small" color="surface.text.gray.subtle">
            Experiments unavailable — the analytics service could not be reached.
          </Text>
        )}

        {state === 'ready' && experiments.length === 0 && (
          <Text variant="caption" size="small" color="surface.text.gray.subtle">
            No experiments reported by the analytics service yet.
          </Text>
        )}

        {state === 'ready' && experiments.length > 0 && (
          <Box display="flex" flexDirection="column" gap="spacing.4">
            <Box display="flex" flexWrap="wrap" gap="spacing.4">
              {experiments.map((exp) => {
                const hasBothCohorts = exp.variant_a.attempts > 0 && exp.variant_b.attempts > 0;
                const liftColor: BadgeColor =
                  exp.lift_percent > 0 ? 'positive' : exp.lift_percent < 0 ? 'negative' : 'neutral';
                return (
                  <Box
                    key={exp.experiment_id}
                    flex={1}
                    flexBasis={{ base: '100%', m: 'calc(50% - 8px)' }}
                    backgroundColor="surface.background.gray.subtle"
                    borderRadius="medium"
                    padding="spacing.4"
                    display="flex"
                    flexDirection="column"
                    gap="spacing.3"
                  >
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      gap="spacing.3"
                      flexWrap="wrap"
                    >
                      <Box display="flex" flexDirection="column" gap="spacing.1">
                        <Box>
                          <Code size="small">{exp.experiment_id}</Code>
                        </Box>
                        <Text variant="body" size="small" weight="semibold">
                          {exp.title}
                        </Text>
                      </Box>
                      <Box display="flex" gap="spacing.2" alignItems="center" flexWrap="wrap">
                        <Badge size="small" color={statusBadgeColor(exp.status)}>
                          {exp.status}
                        </Badge>
                        {hasBothCohorts && (
                          <Badge
                            size="small"
                            color={liftColor}
                            icon={
                              exp.lift_percent > 0
                                ? TrendingUpIcon
                                : exp.lift_percent < 0
                                ? TrendingDownIcon
                                : undefined
                            }
                          >
                            {`${exp.lift_percent > 0 ? '+' : ''}${exp.lift_percent}% lift`}
                          </Badge>
                        )}
                      </Box>
                    </Box>

                    <Box display="flex" flexWrap="wrap" gap="spacing.3">
                      <VariantStats variant={exp.variant_a} />
                      <VariantStats variant={exp.variant_b} />
                    </Box>

                    {(exp.stat_significance_p_value != null || exp.chi2_statistic != null) && (
                      <Box display="flex" gap="spacing.2" flexWrap="wrap">
                        {exp.stat_significance_p_value != null && (
                          <Code size="small">{`p = ${exp.stat_significance_p_value}`}</Code>
                        )}
                        {exp.chi2_statistic != null && (
                          <Code size="small">{`chi² = ${exp.chi2_statistic}`}</Code>
                        )}
                      </Box>
                    )}

                    <Text variant="body" size="small" color="surface.text.gray.subtle">
                      {exp.conclusion}
                    </Text>
                  </Box>
                );
              })}
            </Box>

            {disclosures.map((disclosure) => (
              <Text
                key={disclosure}
                variant="caption"
                size="small"
                color="surface.text.gray.muted"
              >
                {disclosure}
              </Text>
            ))}
          </Box>
        )}
      </CardBody>
    </Card>
  );
};
