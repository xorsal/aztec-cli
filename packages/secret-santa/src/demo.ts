#!/usr/bin/env node
/**
 * Secret Santa Demo - Runs a complete 3-player game flow.
 *
 * This script demonstrates the full Secret Santa protocol:
 * 1. Deploy contract
 * 2. Create game with 3-5 participants
 * 3. Enroll Alice, Bob, and Carol
 * 4. Advance to sender registration
 * 5. Each player registers with a unique slot
 * 6. Advance to receiver claim
 * 7. Each player claims a different slot (not their own)
 * 8. Advance to completed
 * 9. Each sender retrieves and decrypts delivery data
 *
 * Usage: yarn demo [--sandbox | --devnet]
 *
 * PREREQUISITES:
 * - For sandbox: Run `aztec start --sandbox`
 * - For devnet: No prerequisites (uses sponsored fees)
 */

import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Contract, getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { Fr } from "@aztec/aztec.js/fields";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { poseidon2Hash } from "@aztec/foundation/crypto";
import { TestWallet } from "@aztec/test-wallet/server";
import { deriveSigningKey, derivePublicKeyFromSecretKey } from "@aztec/stdlib/keys";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { display, NETWORKS } from "aztec-cli";
import { SecretSantaContract, SecretSantaContractArtifact } from "./artifacts/SecretSanta.js";
import { encryptDeliveryData, decryptDeliveryData } from "./services/crypto.js";

// Parse command line args
const args = process.argv.slice(2);
const useDevnet = args.includes("--devnet");
const nodeUrl = useDevnet ? NETWORKS.devnet : NETWORKS.sandbox;

// Player passphrases (deterministic accounts)
const PLAYERS = {
  // admin: "admin-secret-santa-demo",
  // alice: "alice-secret-santa-demo",
  // bob: "bob-secret-santa-demo",
  // carol: "carol-secret-santa-demo",
  admin: "hola",
  alice: "alice",
  bob: "bob",
  carol: "carol",
};

// Delivery addresses for demo
const DELIVERY_ADDRESSES = {
  alice: "Alice: 123 North Pole Lane, Santa Village",
  bob: "Bob: 456 Snowflake Ave, Winter Town",
  carol: "Carol: 789 Reindeer Road, Elf City",
};

interface PlayerContext {
  wallet: TestWallet;
  address: AztecAddress;
  secretKey: Fr;
  slot?: number;
}

// Fixed salt for deterministic addresses (use bigint to avoid Fr cross-module issues)
const ACCOUNT_SALT = 1337n;

/**
 * Convert a passphrase string to an Fr secret key.
 */
function passphraseToSecretKey(passphrase: string): Fr {
  const paddedPassphrase = passphrase.padEnd(32, "#");
  const bytes = Buffer.from(paddedPassphrase, "utf-8");
  return Fr.fromBufferReduce(bytes);
}

/**
 * Hash the secret key using Poseidon2.
 */
async function hashSecretKey(secretKey: Fr): Promise<Fr> {
  return await poseidon2Hash([secretKey]);
}

/**
 * Register SponsoredFPC and get payment method.
 */
async function getSponsoredPaymentMethod(testWallet: TestWallet): Promise<SponsoredFeePaymentMethod> {
  const instance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(SPONSORED_FPC_SALT) }
  );

  try {
    const metadata = await testWallet.getContractMetadata(instance.address);
    if (!metadata?.isContractInitialized) {
      await testWallet.registerContract({
        instance,
        artifact: SponsoredFPCContractArtifact,
      });
    }
  } catch {
    await testWallet.registerContract({
      instance,
      artifact: SponsoredFPCContractArtifact,
    });
  }

  return new SponsoredFeePaymentMethod(instance.address);
}

/**
 * Create a player wallet from passphrase.
 */
async function createPlayer(
  testWallet: TestWallet,
  passphrase: string,
  name: string
): Promise<PlayerContext> {
  const rawKey = passphraseToSecretKey(passphrase);
  const secretKey = await hashSecretKey(rawKey);

  // Use bigint for salt to avoid Fr cross-module issues
  const account = await testWallet.createSchnorrAccount(secretKey, new Fr(ACCOUNT_SALT));
  const address = account.address;

  // Check if deployed
  const metadata = await testWallet.getContractMetadata(address);
  if (!metadata?.isContractInitialized) {
    display.step(`  Deploying ${name}'s account...`);
    const paymentMethod = await getSponsoredPaymentMethod(testWallet);
    const deployMethod = await account.getDeployMethod();
    await deployMethod
      .send({
        from: AztecAddress.ZERO,
        fee: { paymentMethod },
      })
      .wait();
  }

  display.keyValue(`${name} address`, address.toString().slice(0, 20) + "...");
  return { wallet: testWallet, address, secretKey };
}

async function main() {
  display.header("ZK Secret Santa Demo");
  display.info(`Network: ${useDevnet ? "devnet" : "sandbox"}`);
  display.info(`Node URL: ${nodeUrl}`);
  display.divider();

  // Connect to node
  display.step("Connecting to Aztec node...");
  const node = createAztecNodeClient(nodeUrl);
  await waitForNode(node);
  display.success("Connected to Aztec node!");

  // Create TestWallet
  display.step("Creating player wallets...");
  const testWallet = await TestWallet.create(node, { proverEnabled: false });

  const admin = await createPlayer(testWallet, PLAYERS.admin, "Admin");
  const alice = await createPlayer(testWallet, PLAYERS.alice, "Alice");
  const bob = await createPlayer(testWallet, PLAYERS.bob, "Bob");
  const carol = await createPlayer(testWallet, PLAYERS.carol, "Carol");

  display.success("All player wallets created!");
  display.divider();

  // ============================================================
  // STEP 1: Deploy the contract
  // ============================================================
  display.header("Step 1: Deploy Contract");
  display.step("Deploying SecretSanta contract...");

  const paymentMethod = await getSponsoredPaymentMethod(admin.wallet);
  const contract = await Contract.deploy(
    admin.wallet,
    SecretSantaContractArtifact,
    [admin.address]
  )
    .send({
      from: admin.address,
      fee: { paymentMethod },
    })
    .deployed() as SecretSantaContract;

  display.success(`Contract deployed at: ${contract.address}`);
  display.divider();

  // ============================================================
  // STEP 2: Create a game
  // ============================================================
  display.header("Step 2: Create Game");
  display.step("Creating game with 3-5 participants...");

  await (contract.methods as any)
    .create_game(3, 3)
    .send({
      from: admin.address,
      fee: { paymentMethod },
    })
    .wait();

  const gameId = (await (contract.methods as any).get_next_game_id().simulate({ from: admin.address })) - 1n;
  display.success(`Game #${gameId} created!`);
  display.keyValue("Min participants", "3");
  display.keyValue("Max participants", "5");
  display.divider();

  // ============================================================
  // STEP 3: Enroll all players
  // ============================================================
  display.header("Step 3: Enroll Players");

  for (const [name, player] of [["Alice", alice], ["Bob", bob], ["Carol", carol]] as const) {
    display.step(`${name} enrolling...`);
    const pm = await getSponsoredPaymentMethod(player.wallet);
    await (contract.withWallet(player.wallet).methods as any)
      .enroll(gameId)
      .send({
        from: player.address,
        fee: { paymentMethod: pm },
      })
      .wait();
    display.success(`${name} enrolled!`);
  }

  const participantCount = await (contract.methods as any).get_participant_count(gameId).simulate({ from: admin.address });
  display.keyValue("Total participants", participantCount.toString());
  display.divider();

  // ============================================================
  // STEP 4: Advance to sender registration
  // ============================================================
  display.header("Step 4: Advance to Sender Registration");
  display.step("Advancing game phase...");

  await (contract.methods as any)
    .advance_phase(gameId)
    .send({
      from: admin.address,
      fee: { paymentMethod },
    })
    .wait();

  display.success("Phase: Sender Registration");
  display.divider();

  // ============================================================
  // STEP 5: Each player registers with a slot
  // ============================================================
  display.header("Step 5: Register as Senders");

  // Assign slots
  alice.slot = 1;
  bob.slot = 2;
  carol.slot = 3;

  for (const [name, player] of [["Alice", alice], ["Bob", bob], ["Carol", carol]] as const) {
    display.step(`${name} registering slot ${player.slot}...`);

    // Derive encryption key from secret
    const signingKey = deriveSigningKey(player.secretKey);
    const pubKey = await derivePublicKeyFromSecretKey(signingKey);
    const encryptionKey = {
      x: new Fr(pubKey.x.toBigInt()),
      y: new Fr(pubKey.y.toBigInt()),
      is_infinite: pubKey.isInfinite,
    };

    const pm = await getSponsoredPaymentMethod(player.wallet);
    await (contract.withWallet(player.wallet).methods as any)
      .register_as_sender(gameId, player.slot, encryptionKey)
      .send({
        from: player.address,
        fee: { paymentMethod: pm },
      })
      .wait();

    display.success(`${name} registered slot ${player.slot}!`);
  }
  display.divider();

  // ============================================================
  // STEP 6: Advance to receiver claim
  // ============================================================
  display.header("Step 6: Advance to Receiver Claim");
  display.step("Advancing game phase...");

  await (contract.methods as any)
    .advance_phase(gameId)
    .send({
      from: admin.address,
      fee: { paymentMethod },
    })
    .wait();

  display.success("Phase: Receiver Claim");
  display.divider();

  // ============================================================
  // STEP 7: Each player claims a different slot
  // ============================================================
  display.header("Step 7: Claim as Receivers");

  // Alice (slot 1) claims slot 2 (Bob's) -> Alice receives from Bob
  // Bob (slot 2) claims slot 3 (Carol's) -> Bob receives from Carol
  // Carol (slot 3) claims slot 1 (Alice's) -> Carol receives from Alice
  const claims = [
    { player: alice, name: "Alice", claimSlot: 2, deliveryAddress: DELIVERY_ADDRESSES.alice },
    { player: bob, name: "Bob", claimSlot: 3, deliveryAddress: DELIVERY_ADDRESSES.bob },
    { player: carol, name: "Carol", claimSlot: 1, deliveryAddress: DELIVERY_ADDRESSES.carol },
  ];

  for (const { player, name, claimSlot, deliveryAddress } of claims) {
    display.step(`${name} claiming slot ${claimSlot}...`);

    // Get sender's encryption key for the slot
    const senderKey = await contract.methods
      .get_slot_encryption_key(gameId, BigInt(claimSlot))
      .simulate({ from: player.address });

    // Encrypt delivery address
    const encryptedData = await encryptDeliveryData(deliveryAddress, senderKey);

    const pm = await getSponsoredPaymentMethod(player.wallet);
    await (contract.withWallet(player.wallet).methods as any)
      .claim_as_receiver(gameId, claimSlot, encryptedData)
      .send({
        from: player.address,
        fee: { paymentMethod: pm },
      })
      .wait();

    display.success(`${name} claimed slot ${claimSlot}!`);
  }
  display.divider();

  // ============================================================
  // STEP 8: Complete the game
  // ============================================================
  display.header("Step 8: Complete Game");
  display.step("Advancing to completed phase...");

  await (contract.methods as any)
    .advance_phase(gameId)
    .send({
      from: admin.address,
      fee: { paymentMethod },
    })
    .wait();

  display.success("Phase: Completed!");
  display.divider();

  // ============================================================
  // STEP 9: Senders retrieve and decrypt delivery data
  // ============================================================
  display.header("Step 9: Retrieve Delivery Data");

  const retrievals = [
    { player: alice, name: "Alice", slot: 1 },
    { player: bob, name: "Bob", slot: 2 },
    { player: carol, name: "Carol", slot: 3 },
  ];

  for (const { player, name, slot } of retrievals) {
    display.step(`${name} retrieving delivery data for slot ${slot}...`);

    const deliveryData = await (contract.methods)
      .get_slot_delivery_data(gameId, BigInt(slot))
      .simulate({ from: player.address });

    // Decrypt using sender's private key
    console.log(deliveryData);
    const signingKey = deriveSigningKey(player.secretKey);
    const decryptedAddress = await decryptDeliveryData(
      [deliveryData[0], deliveryData[1], deliveryData[2], deliveryData[3], deliveryData[4], deliveryData[5], deliveryData[6], deliveryData[7]],
      signingKey
    );

    display.success(`${name} decrypted delivery address:`);
    display.keyValue("Send gift to", decryptedAddress);
  }
  display.divider();

  // ============================================================
  // Summary
  // ============================================================
  display.header("Game Summary");
  display.info("Gift exchange assignments:");
  display.keyValue("Alice (slot 1)", "sends gift to Carol");
  display.keyValue("Bob (slot 2)", "sends gift to Alice");
  display.keyValue("Carol (slot 3)", "sends gift to Bob");
  display.divider();
  display.success("Secret Santa demo completed successfully!");
}

main().catch((err) => {
  display.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
