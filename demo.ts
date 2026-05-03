import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

function line(title: string) {
  console.log(`\n=== ${title} ===`);
}

function ok(message: string) {
  console.log(`✔ ${message}`);
}

function info(label: string, value: unknown) {
  console.log(`${label}:`, value);
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace["pceProtocolClean"] as any;
  const authority = provider.wallet;

  const canonicalId = `doc-${Date.now()}`;
  const entityType = "document";
  const content = Buffer.from("PCE canonical proof demo content v1", "utf8");

  const [recordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), Buffer.from(canonicalId)],
    program.programId
  );

  line("PCE DEMO START");
  info("Program ID", program.programId.toBase58());
  info("Authority", authority.publicKey.toBase58());
  info("Canonical ID", canonicalId);
  info("Entity Type", entityType);
  info("Record PDA", recordPda.toBase58());

  line("STEP 1 - REGISTER RECORD");

  await program.methods
    .registerRecord(canonicalId, entityType, content)
    .accounts({
      record: recordPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  ok("Record created on-chain");

  line("STEP 2 - FETCH AND VERIFY");

  const recordAfterCreate = await program.account["record"].fetch(recordPda);
  const expectedHash = Buffer.from(keccak_256(content)).toString("hex");
  const onChainHash = Buffer.from(recordAfterCreate.contentHash).toString("hex");

  info("Stored canonical_id", recordAfterCreate.canonicalId);
  info("Stored entity_type", recordAfterCreate.entityType);
  info("Stored authority", recordAfterCreate.authority.toBase58());
  info("Stored version", recordAfterCreate.version.toString());
  info("Stored created_at", recordAfterCreate.createdAt.toString());
  info("Stored updated_at", recordAfterCreate.updatedAt.toString());
  info("Stored content_hash", onChainHash);

  if (onChainHash !== expectedHash) {
    throw new Error("Hash mismatch between local content and on-chain record");
  }

  ok("On-chain hash matches content");

  line("STEP 3 - ATTEMPT DUPLICATE");

  let duplicateBlocked = false;

  try {
    await program.methods
      .registerRecord(canonicalId, entityType, content)
      .accounts({
        record: recordPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (err) {
    duplicateBlocked = true;
    ok("Duplicate registration blocked");
    info("Duplicate error", err instanceof Error ? err.message : String(err));
  }

  if (!duplicateBlocked) {
    throw new Error("Duplicate registration was not blocked");
  }

  line("STEP 4 - TRANSFER AUTHORITY");

  const newAuthority = Keypair.generate();

  await program.methods
    .transferAuthority(newAuthority.publicKey)
    .accounts({
      record: recordPda,
      currentAuthority: authority.publicKey,
    })
    .rpc();

  ok("Authority transferred");

  line("STEP 5 - FETCH FINAL STATE");

  const recordAfterTransfer = await program.account["record"].fetch(recordPda);

  info("New authority", recordAfterTransfer.authority.toBase58());
  info("New version", recordAfterTransfer.version.toString());
  info("Updated at", recordAfterTransfer.updatedAt.toString());

  if (recordAfterTransfer.authority.toBase58() !== newAuthority.publicKey.toBase58()) {
    throw new Error("Authority transfer failed");
  }

  if (recordAfterTransfer.version.toString() !== "2") {
    throw new Error("Version did not increment to 2");
  }

  ok("Final state verified");

  line("PCE DEMO COMPLETE");
  console.log("✔ Canonical uniqueness enforced");
  console.log("✔ Content proof stored on-chain");
  console.log("✔ Duplicate blocked");
  console.log("✔ Authority transferred");
  console.log("✔ Versioned state transition confirmed");
}

main().catch((err) => {
  console.error("\nDEMO FAILED");
  console.error(err);
  process.exit(1);
});
