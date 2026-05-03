use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hashv;

declare_id!("64BgXcaa8rNyAzC1FMNiSLY4v3U6uewaXvEZu17HDgP3");

#[program]
pub mod pce_protocol_clean {
    use super::*;

    pub fn register_record(
        ctx: Context<RegisterRecord>,
        canonical_id: String,
        entity_type: String,
        content: Vec<u8>,
    ) -> Result<()> {
        require!(!canonical_id.trim().is_empty(), PceError::EmptyCanonicalId);
        require!(!entity_type.trim().is_empty(), PceError::EmptyEntityType);
        require!(!content.is_empty(), PceError::EmptyContent);
        require!(
            canonical_id.len() <= Record::MAX_CANONICAL_ID_LEN,
            PceError::CanonicalIdTooLong
        );
        require!(
            entity_type.len() <= Record::MAX_ENTITY_TYPE_LEN,
            PceError::EntityTypeTooLong
        );

        let now = Clock::get()?.unix_timestamp;
        let record = &mut ctx.accounts.record;
        let digest = hashv(&[&content]);

        record.canonical_id = canonical_id;
        record.entity_type = entity_type;
        record.authority = ctx.accounts.authority.key();
        record.content_hash = digest.to_bytes();
        record.created_at = now;
        record.updated_at = now;
        record.version = 1;
        record.bump = ctx.bumps.record;

        Ok(())
    }

    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let record = &mut ctx.accounts.record;

        require_keys_eq!(
            record.authority,
            ctx.accounts.current_authority.key(),
            PceError::Unauthorized
        );
        require!(
            new_authority != Pubkey::default(),
            PceError::InvalidNewAuthority
        );

        record.authority = new_authority;
        record.updated_at = Clock::get()?.unix_timestamp;
        record.version = record
            .version
            .checked_add(1)
            .ok_or(PceError::VersionOverflow)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(canonical_id: String, entity_type: String, content: Vec<u8>)]
pub struct RegisterRecord<'info> {
    #[account(
        init,
        payer = authority,
        space = Record::SPACE,
        seeds = [b"record", canonical_id.as_bytes()],
        bump
    )]
    pub record: Account<'info, Record>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(mut)]
    pub record: Account<'info, Record>,

    pub current_authority: Signer<'info>,
}

#[account]
pub struct Record {
    pub canonical_id: String,
    pub entity_type: String,
    pub authority: Pubkey,
    pub content_hash: [u8; 32],
    pub created_at: i64,
    pub updated_at: i64,
    pub version: u64,
    pub bump: u8,
}

impl Record {
    pub const MAX_CANONICAL_ID_LEN: usize = 32;
    pub const MAX_ENTITY_TYPE_LEN: usize = 32;

    pub const SPACE: usize =
        8 +  // discriminator
        4 + Self::MAX_CANONICAL_ID_LEN +
        4 + Self::MAX_ENTITY_TYPE_LEN +
        32 + // authority
        32 + // content_hash
        8 +  // created_at
        8 +  // updated_at
        8 +  // version
        1;   // bump
}

#[error_code]
pub enum PceError {
    #[msg("Canonical ID cannot be empty")]
    EmptyCanonicalId,
    #[msg("Entity type cannot be empty")]
    EmptyEntityType,
    #[msg("Content cannot be empty")]
    EmptyContent,
    #[msg("Canonical ID is too long")]
    CanonicalIdTooLong,
    #[msg("Entity type is too long")]
    EntityTypeTooLong,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid new authority")]
    InvalidNewAuthority,
    #[msg("Version overflow")]
    VersionOverflow,
}
