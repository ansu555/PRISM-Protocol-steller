use crate::ID;
use anchor_lang::prelude::*;

pub fn pool_pda(tranche_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"amm", tranche_mint.as_ref()], &ID)
}

pub fn pool_tranche_reserve_pda(tranche_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"amm_tranche", tranche_mint.as_ref()], &ID)
}

pub fn pool_quote_reserve_pda(tranche_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"amm_quote", tranche_mint.as_ref()], &ID)
}

pub fn lp_mint_pda(tranche_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"amm_lp", tranche_mint.as_ref()], &ID)
}
