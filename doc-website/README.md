# PRISM Protocol Docs Website

This folder contains the standalone PRISM Protocol documentation website. It is
built with [Mintlify](https://www.mintlify.com/) and uses local MDX files as the
source of truth.

## Structure

- `docs.json` - Mintlify site settings, branding, navigation, and footer links
- `*.mdx` - public protocol documentation pages
- `images/` - logo and favicon assets

The MDX pages contain the public protocol documentation: architecture,
financial model, operations, market design, controls, compliance posture, and
roadmap.

## Installation

Mintlify currently rejects Node 25+. Use Node 22, or another supported LTS
version, before running the docs locally. Version-manager hints are included in
`.nvmrc` and `.node-version`.

```bash
npm install
```

## Local Development

```bash
npm run dev
```

This starts Mintlify's local preview. Use `npm run dev -- --no-open` if you do
not want the browser to open automatically.

## Validate

```bash
npm run validate
```

This checks that the Mintlify docs configuration and content can be built.
