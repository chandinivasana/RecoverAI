'use client';

import React from 'react';
import { Button, Tooltip, MoonIcon, SunIcon } from '@razorpay/blade/components';
import { useColorScheme } from '../lib/AppProviders';

/** Light/dark toggle backed by Blade's colorScheme (see lib/AppProviders.tsx). */
export const ThemeToggle: React.FC = () => {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return (
    <Tooltip content={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <Button
        variant="tertiary"
        size="small"
        icon={isDark ? SunIcon : MoonIcon}
        accessibilityLabel="Toggle color scheme"
        onClick={toggleColorScheme}
      />
    </Tooltip>
  );
};
