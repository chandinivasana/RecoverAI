'use client';

import React from 'react';
import {
  Box,
  Text,
  Badge,
  Counter,
  Indicator,
  Switch,
  Avatar,
  Menu,
  MenuOverlay,
  MenuHeader,
  MenuItem,
  Button,
  Tooltip,
  TopNav,
  TopNavBrand,
  TopNavContent,
  TopNavActions,
  SideNav,
  SideNavBody,
  SideNavSection,
  SideNavLink,
  SideNavFooter,
  SideNavItem,
  useTheme,
  RazorpayIcon,
  LayoutIcon,
  UserCheckIcon,
  BarChartIcon,
  ShieldIcon,
  TargetIcon,
  HistoryIcon,
  SmartphoneIcon,
  MenuIcon,
  FileTextIcon,
  SIDE_NAV_EXPANDED_L1_WIDTH_BASE,
  SIDE_NAV_EXPANDED_L1_WIDTH_XL,
} from '@razorpay/blade/components';
import { MerchantSwitcher } from './MerchantSwitcher';
import { ThemeToggle } from './ThemeToggle';

export type ActiveView = 'dashboard' | 'reviews' | 'policies' | 'replay' | 'redteam' | 'evaluation';

interface AppShellProps {
  activeTab: ActiveView;
  onSelectTab: (tab: ActiveView) => void;
  pendingReviewsCount: number;
  selectedMerchantId: string;
  onSelectMerchant: (merchantId: string) => void;
  isTestMode: boolean;
  onToggleTestMode: () => void;
  onOpenCustomerPreview: () => void;
  children: React.ReactNode;
}

// SideNavLink expects a router Link via `as` and forwards `href` to it as the
// `to` prop (it does NOT forward onClick to the anchor). The app is a
// single-page tab shell, so this shim reads the tab out of `to` ("#<tab>") and
// drives the shell state through context on click.
const NavSelectContext = React.createContext<(target: string) => void>(() => {});

const NavAnchor = React.forwardRef<
  HTMLAnchorElement,
  Record<string, unknown> & { to?: unknown; href?: unknown }
>(({ to, href, ...props }, ref) => {
  const select = React.useContext(NavSelectContext);
  const target = typeof to === 'string' ? to : typeof href === 'string' ? href : '';
  return (
    <a
      ref={ref}
      href={target || '#'}
      {...props}
      onClick={(e) => {
        e.preventDefault();
        if (target.startsWith('#')) select(target.slice(1));
      }}
    />
  );
});
NavAnchor.displayName = 'NavAnchor';

const NAV_SECTIONS: Array<{
  title: string;
  items: Array<{ tab: ActiveView; title: string; icon: React.ComponentType }>;
}> = [
  {
    title: 'Revenue Recovery',
    items: [
      { tab: 'dashboard', title: 'Dashboard', icon: LayoutIcon },
      { tab: 'reviews', title: 'Human Reviews', icon: UserCheckIcon },
      { tab: 'evaluation', title: 'Evaluation', icon: BarChartIcon },
    ],
  },
  {
    title: 'Safety & Controls',
    items: [
      { tab: 'policies', title: 'Policy Simulator', icon: ShieldIcon },
      { tab: 'redteam', title: 'Red Team Lab', icon: TargetIcon },
      { tab: 'replay', title: 'Time-Travel Replay', icon: HistoryIcon },
    ],
  },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onSelectTab,
  pendingReviewsCount,
  selectedMerchantId,
  onSelectMerchant,
  isTestMode,
  onToggleTestMode,
  onOpenCustomerPreview,
  children,
}) => {
  const { platform } = useTheme();
  const isMobile = platform === 'onMobile';
  const [isSideNavOpen, setIsSideNavOpen] = React.useState(false);

  const selectTarget = React.useCallback(
    (target: string) => {
      if (target === 'customer-preview') {
        onOpenCustomerPreview();
      } else {
        onSelectTab(target as ActiveView);
      }
      setIsSideNavOpen(false);
    },
    [onSelectTab, onOpenCustomerPreview],
  );

  const navLink = (item: { tab: ActiveView; title: string; icon: React.ComponentType }) => (
    <SideNavLink
      key={item.tab}
      as={NavAnchor}
      href={`#${item.tab}`}
      title={item.title}
      icon={item.icon as never}
      isActive={activeTab === item.tab}
      titleSuffix={
        item.tab === 'reviews' && pendingReviewsCount > 0 ? (
          <Counter value={pendingReviewsCount} color="notice" />
        ) : undefined
      }
    />
  );

  return (
    <NavSelectContext.Provider value={selectTarget}>
    <Box height="100vh" display="flex" flexDirection="column" backgroundColor="surface.background.gray.intense">
      <TopNav position="relative">
        <TopNavBrand>
          <Box display="flex" alignItems="center" gap="spacing.3" paddingX="spacing.4">
            {isMobile ? (
              <Button
                variant="tertiary"
                size="small"
                icon={MenuIcon}
                accessibilityLabel="Open navigation"
                onClick={() => setIsSideNavOpen(true)}
              />
            ) : null}
            <RazorpayIcon size="large" color="interactive.icon.primary.normal" />
            <Text size="large" weight="semibold">
              RecoverAI
            </Text>
            <Badge color="information" size="small">
              Track 3 · Revenue Recovery
            </Badge>
          </Box>
        </TopNavBrand>
        <TopNavContent>
          <Box />
        </TopNavContent>
        <TopNavActions>
          <MerchantSwitcher selectedMerchantId={selectedMerchantId} onSelectMerchant={onSelectMerchant} />
          {pendingReviewsCount > 0 ? (
            <Tooltip content="Pending human reviews">
              <Button
                variant="tertiary"
                size="small"
                icon={UserCheckIcon}
                accessibilityLabel="Open pending reviews"
                onClick={() => selectTarget('reviews')}
              />
            </Tooltip>
          ) : null}
          <ThemeToggle />
          <Menu openInteraction="click">
            <Avatar size="medium" name="Risk Officer" />
            <MenuOverlay>
              <MenuHeader title="Risk Officer" subtitle="Merchant Ops Admin" />
              <MenuItem
                title="Customer checkout preview"
                leading={<SmartphoneIcon size="small" />}
                onClick={onOpenCustomerPreview}
              />
              <MenuItem
                title="Project docs (docs/PRD.md)"
                leading={<FileTextIcon size="small" />}
                onClick={() => window.open('https://github.com/chandinivasana/RecoverAI', '_blank')}
              />
            </MenuOverlay>
          </Menu>
        </TopNavActions>
      </TopNav>

      <Box flex="1" position="relative" overflow="hidden">
        <SideNav
          position="absolute"
          isOpen={isSideNavOpen}
          onDismiss={() => setIsSideNavOpen(false)}
        >
          <SideNavBody>
            {NAV_SECTIONS.map((section) => (
              <SideNavSection key={section.title} title={section.title}>
                {section.items.map(navLink)}
              </SideNavSection>
            ))}
          </SideNavBody>
          <SideNavFooter>
            <SideNavItem
              as="label"
              title="Test Mode"
              leading={
                <Indicator
                  color={isTestMode ? 'notice' : 'positive'}
                  emphasis="intense"
                  accessibilityLabel={isTestMode ? 'Test mode on' : 'Live mode'}
                />
              }
              backgroundColor={isTestMode ? 'feedback.background.notice.subtle' : undefined}
              trailing={
                <Switch
                  accessibilityLabel="Toggle test mode"
                  size="small"
                  isChecked={isTestMode}
                  onChange={() => onToggleTestMode()}
                />
              }
            />
            <SideNavLink
              as={NavAnchor}
              href="#customer-preview"
              title="Customer Preview"
              icon={SmartphoneIcon as never}
            />
          </SideNavFooter>
        </SideNav>

        <Box
          marginLeft={{
            base: 'spacing.0',
            m: `${SIDE_NAV_EXPANDED_L1_WIDTH_BASE}px`,
            xl: `${SIDE_NAV_EXPANDED_L1_WIDTH_XL}px`,
          }}
          height="100%"
          overflowY="auto"
          backgroundColor="surface.background.gray.intense"
        >
          <Box maxWidth="1440px" marginX="auto" padding={{ base: 'spacing.4', m: 'spacing.6' }}>
            {children}
          </Box>
          <Box
            borderTopWidth="thin"
            borderTopColor="surface.border.gray.muted"
            paddingY="spacing.3"
            paddingX="spacing.6"
            display="flex"
            flexDirection={{ base: 'column', m: 'row' }}
            alignItems="center"
            justifyContent="space-between"
            gap="spacing.2"
          >
            <Box display="flex" alignItems="center" gap="spacing.2">
              <Indicator color="positive" accessibilityLabel="Engine online" />
              <Text size="xsmall" color="surface.text.gray.muted">
                RecoverAI Engine · AI proposes → Policy validates → System executes → Audit records → Metrics measure
              </Text>
            </Box>
            <Text size="xsmall" color="surface.text.gray.muted">
              DPDP Act (2023) aware · Tamper-evident audit chain · Track 3: AI Revenue Recovery
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
    </NavSelectContext.Provider>
  );
};
