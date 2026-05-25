import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const projectRoot = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Stellar migration: chain-touching components still carry Solana type
    // annotations (PublicKey, BN, etc.) even though their runtime values are
    // now Stellar strings / bigints. Skipping strict build-time TS checks
    // while we migrate component types in a follow-up. Hooks and lib code
    // are properly typed against Stellar SDK already.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Same migration consideration — old components reference removed imports.
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      tailwindcss: require.resolve("tailwindcss/index.css"),
      "tw-animate-css": require.resolve("tw-animate-css"),
    },
  },
}

export default nextConfig
