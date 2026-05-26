// Legacy IDL shim. The Soroban contracts don't use Anchor IDLs — contract
// interaction happens through the Soroban SDK's native invocation pattern.
// This file is kept so existing `import { IDL }` lines don't break.

export type PrismCore = Record<string, unknown>;
export const IDL: PrismCore = {};
