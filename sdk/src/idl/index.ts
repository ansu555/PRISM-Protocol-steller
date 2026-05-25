import type { Idl } from '@coral-xyz/anchor';

import prismAmmIdlJson from './prism_amm.json';
import prismCoreIdlJson from './prism_core.json';

export const prismCoreIdl = prismCoreIdlJson as unknown as Idl;
export const prismAmmIdl = prismAmmIdlJson as unknown as Idl;
