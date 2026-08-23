import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  // Blade styles via styled-components v5: the SWC transform adds stable
  // classnames + SSR support (paired with lib/StyledComponentsRegistry.tsx).
  compiler: {
    styledComponents: true,
  },
};

export default nextConfig;
