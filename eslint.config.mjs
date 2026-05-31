import nextVitals from "eslint-config-next/core-web-vitals"

const config = [
  ...nextVitals,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  {
    ignores: [
      "contracts/target/**",
      "doc-website/build/**",
      "doc-website/.docusaurus/**",
      "marketing-video/build/**",
      "pitch-deck-*.html",
    ],
  },
]

export default config
