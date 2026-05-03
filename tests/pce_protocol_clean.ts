import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { keccak_256 } from "@noble/hashes/sha3.js";

describe("pce_protocol_clean", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PceProtocolClean as Program<any>;
  const authority = provider.wallet;

  it("registers a canonical record, blocks duplicates, stores hash, and transfers authority", async () => {
    const canonicalId = `doc-${Date.now()}`;
    const entityType = "document";
    const content = Buffer.from("PCE canonical proof content v1", "utf8");

    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("record"), Buffer.from(canonicalId)],
      program.programId
    );

    await program.methods
      .registerRecord(canonicalId, entityType, content)
      .accounts({
        record: recordPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const recordAfterCreate = await program.account.record.fetch(recordPda);

    assert.equal(recordAfterCreate.canonicalId, canonicalId);
    assert.equal(recordAfterCreate.entityType, entityType);
    assert.equal(
      recordAfterCreate.authority.toBase58(),
      authority.publicKey.toBase58()
    );
    assert.equal(recordAfterCreate.version.toString(), "1");

    const expectedHash = Buffer.from(keccak_256(content));
    const onChainHash = Buffer.from(recordAfterCreate.contentHash);
    assert.equal(onChainHash.toString("hex"), expectedHash.toString("hex"));

    let duplicateFailed = false;

    try {
      await program.methods
        .registerRecord(canonicalId, entityType, content)
        .accounts({
          record: recordPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (_err) {
      duplicateFailed = true;
    }

    assert.equal(duplicateFailed, true, "Duplicate registration should fail");

    const newAuthority = Keypair.generate();

    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accounts({
        record: recordPda,
        currentAuthority: authority.publicKey,
      })
      .rpc();

    const recordAfterTransfer = await program.account.record.fetch(recordPda);

    assert.equal(
      recordAfterTransfer.authority.toBase58(),
      newAuthority.publicKey.toBase58()
    );
    assert.equal(recordAfterTransfer.version.toString(), "2");
    assert.isAtLeast(
      Number(recordAfterTransfer.updatedAt),
      Number(recordAfterTransfer.createdAt)
    );
  });
});
