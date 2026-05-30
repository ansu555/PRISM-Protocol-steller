import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      tailwindcss: require.resolve('tailwindcss/index.css'),
      'tw-animate-css': require.resolve('tw-animate-css'),
    },
  },
};

export default nextConfig;
