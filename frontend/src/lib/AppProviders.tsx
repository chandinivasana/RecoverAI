'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { BladeProvider, ToastContainer } from '@razorpay/blade/components';
import { bladeTheme } from '@razorpay/blade/tokens';
import { StyledComponentsRegistry } from './StyledComponentsRegistry';

type ColorScheme = 'light' | 'dark';

const ColorSchemeContext = createContext<{
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
}>({ colorScheme: 'light', toggleColorScheme: () => {} });

export const useColorScheme = () => useContext(ColorSchemeContext);

/**
 * Root providers: Blade design system (theme tokens + color scheme) and the
 * global ToastContainer. The Razorpay dashboard is light-first; the scheme
 * toggle persists to localStorage.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem('recoverai-color-scheme');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only; reading it in an effect keeps SSR and first client render identical
    if (stored === 'dark' || stored === 'light') setColorScheme(stored);
  }, []);

  const toggleColorScheme = () => {
    setColorScheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      window.localStorage.setItem('recoverai-color-scheme', next);
      return next;
    });
  };

  return (
    <StyledComponentsRegistry>
      <ColorSchemeContext.Provider value={{ colorScheme, toggleColorScheme }}>
        {/* key forces a provider remount on scheme change — BladeProvider v12
            latches colorScheme at mount and ignores later prop updates. */}
        <BladeProvider key={colorScheme} themeTokens={bladeTheme} colorScheme={colorScheme}>
          <ToastContainer />
          {children}
        </BladeProvider>
      </ColorSchemeContext.Provider>
    </StyledComponentsRegistry>
  );
}
