'use client';

import React, { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

/**
 * SSR style registry for styled-components v5 (Blade's styling engine) under
 * the Next.js App Router: collects styles rendered on the server and injects
 * them into the initial HTML so Blade components paint styled on first load.
 */
export function StyledComponentsRegistry({ children }: { children: React.ReactNode }) {
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement();
    // clearTag is internal to styled-components v5 but is the documented way
    // to reset the sheet between server renders.
    (styledComponentsStyleSheet.instance as unknown as { clearTag?: () => void }).clearTag?.();
    return <>{styles}</>;
  });

  if (typeof window !== 'undefined') return <>{children}</>;

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      {children}
    </StyleSheetManager>
  );
}
