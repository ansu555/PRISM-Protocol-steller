import type { Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

type AnchorProgram = Omit<Program<any>, "account" | "methods">;

type FetchableAccount<T = any> = {
  fetch(address: PublicKey): Promise<T>;
  fetchNullable(address: PublicKey): Promise<T | null>;
};

export type PrismCoreProgram = AnchorProgram & {
  methods: any;
  account: {
    globalConfig: FetchableAccount;
    vault: FetchableAccount;
    tranche: FetchableAccount;
    loan: FetchableAccount;
    ikaCollateral: FetchableAccount;
  };
};

export type PrismAmmProgram = AnchorProgram & {
  methods: any;
  account: {
    ammPool: FetchableAccount;
  };
};
