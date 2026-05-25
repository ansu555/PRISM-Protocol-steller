import type { Idl } from '@coral-xyz/anchor';

/**
 * Anchor program type for prism_core.
 *
 * The PRISM IDLs are loaded at runtime from JSON, so the strongly-typed
 * generator output is not used. These aliases give consumers an ergonomic
 * type name to plug into `Program<PrismCore>` and `Program<PrismAmm>`.
 */
export type PrismCore = Idl;
export type PrismAmm = Idl;
