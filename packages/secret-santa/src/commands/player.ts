/**
 * Player Commands - Game participant operations.
 *
 * Commands: enroll, register, claim, delivery, status
 */

import { deriveSigningKey } from "@aztec/stdlib/keys";
import {
  type CLIBuilder,
  display,
  prompts,
  getSponsoredPaymentMethod,
} from "aztec-cli";
import type { SecretSantaConfig } from "../index.js";
import {
  getGameInfo,
  getEncryptionPublicKey,
  isSlotClaimed,
  getSlotEncryptionKey,
  getSlotDeliveryData,
  PHASE,
  PHASE_NAMES,
} from "../services/game.js";
import { getClaimedSlotsFromEvents } from "../services/events.js";
import {
  encryptDeliveryData,
  decryptDeliveryData,
  isEncryptedDataEmpty,
} from "../services/crypto.js";

/**
 * Register player commands with the CLI.
 */
export function registerPlayerCommands(cli: CLIBuilder<SecretSantaConfig>): void {
  const program = cli.getProgram();

  // Enroll command
  program
    .command("enroll")
    .description("Enroll in a Secret Santa game")
    .option("--game <id>", "Game ID", parseInt)
    .action(async (options) => {
      try {
        const { wallet, accountAddress } = await cli.getWallet();
        const contract = await cli.getContract();
        const config = cli.getConfig();

        const gameId = options.game ?? config.currentGameId;
        if (!gameId) {
          display.error("No game ID specified. Use --game <id>");
          process.exit(1);
        }

        // Check phase
        const { phase, phaseName } = await getGameInfo(contract, BigInt(gameId), accountAddress);
        if (phase !== PHASE.ENROLLMENT) {
          display.error(`Cannot enroll. Game is in ${phaseName} phase.`);
          process.exit(1);
        }

        display.step(`Enrolling in game #${gameId}...`);

        const paymentMethod = await getSponsoredPaymentMethod(wallet);
        await (contract.methods as any)
          .enroll(BigInt(gameId))
          .send({
            from: accountAddress,
            fee: { paymentMethod },
          })
          .wait();

        display.success(`Enrolled in game #${gameId}!`);
        display.info("Wait for the admin to advance to Sender Registration phase.");
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // Register as sender command
  program
    .command("register")
    .description("Register as sender (claim a slot)")
    .option("--game <id>", "Game ID", parseInt)
    .option("--slot <n>", "Slot number to claim", parseInt)
    .action(async (options) => {
      try {
        const { wallet, accountAddress, secretKey } = await cli.getWallet();
        const contract = await cli.getContract();
        const config = cli.getConfig();

        const gameId = options.game ?? config.currentGameId;
        if (!gameId) {
          display.error("No game ID specified. Use --game <id>");
          process.exit(1);
        }

        // Check phase and get game info
        const { phase, phaseName, maxParticipants } = await getGameInfo(contract, BigInt(gameId), accountAddress);
        if (phase !== PHASE.SENDER_REGISTRATION) {
          display.error(`Cannot register as sender. Game is in ${phaseName} phase.`);
          process.exit(1);
        }

        // Scan events to find already claimed slots
        const { node } = await cli.getWallet();
        display.step("Scanning for claimed slots...");
        const { senderSlots: claimedSlots } = await getClaimedSlotsFromEvents(
          node,
          contract.address,
          BigInt(gameId)
        );

        // Calculate available slots (1 to maxParticipants)
        const allSlots = Array.from({ length: maxParticipants }, (_, i) => i + 1);
        const availableSlots = allSlots.filter(s => !claimedSlots.includes(s));

        // Get slot
        let slot = options.slot;
        if (!slot) {
          // Show slot status
          display.header("Slot Status");
          if (claimedSlots.length > 0) {
            display.keyValue("Claimed", claimedSlots.sort((a, b) => a - b).join(", "));
          }
          if (availableSlots.length > 0) {
            display.keyValue("Available", availableSlots.join(", "));
          } else {
            display.error("No slots available!");
            process.exit(1);
          }
          display.divider();

          slot = await prompts.promptNumber("Choose a slot number to claim:");
        }

        // Verify slot is available
        if (claimedSlots.includes(slot)) {
          display.error(`Slot ${slot} is already claimed. Available: ${availableSlots.join(", ")}`);
          process.exit(1);
        }
        if (slot < 1 || slot > maxParticipants) {
          display.error(`Invalid slot. Must be between 1 and ${maxParticipants}.`);
          process.exit(1);
        }

        // Derive encryption public key from secret key
        display.step("Deriving encryption key...");
        const encryptionKey = await getEncryptionPublicKey(secretKey);

        display.step(`Registering as sender for slot ${slot}...`);

        const paymentMethod = await getSponsoredPaymentMethod(wallet);
        await (contract.methods as any)
          .register_as_sender(BigInt(gameId), slot, encryptionKey)
          .send({
            from: accountAddress,
            fee: { paymentMethod },
          })
          .wait();

        display.success(`Registered as sender for slot ${slot}!`);
        display.keyValue("Your slot", slot.toString());
        display.info("Your encryption key has been published. Wait for Receiver Claim phase.");
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // Claim as receiver command
  program
    .command("claim")
    .description("Claim as receiver (select a slot to receive from)")
    .option("--game <id>", "Game ID", parseInt)
    .option("--slot <n>", "Slot number to claim", parseInt)
    .action(async (options) => {
      try {
        const { wallet, accountAddress, node } = await cli.getWallet();
        const contract = await cli.getContract();
        const config = cli.getConfig();

        const gameId = options.game ?? config.currentGameId;
        if (!gameId) {
          display.error("No game ID specified. Use --game <id>");
          process.exit(1);
        }

        // Check phase
        const { phase, phaseName } = await getGameInfo(contract, BigInt(gameId), accountAddress);
        if (phase !== PHASE.RECEIVER_CLAIM) {
          display.error(`Cannot claim as receiver. Game is in ${phaseName} phase.`);
          process.exit(1);
        }

        // Scan events to find slot status
        display.step("Scanning for slot status...");
        const { senderSlots, receiverSlots } = await getClaimedSlotsFromEvents(
          node,
          contract.address,
          BigInt(gameId)
        );

        // Calculate available slots (sender claimed but no receiver yet)
        const availableSlots = senderSlots.filter(s => !receiverSlots.includes(s));
        const takenSlots = receiverSlots;

        // Get target slot
        let targetSlot = options.slot;
        if (!targetSlot) {
          // Show slot status
          display.header("Slot Status");
          if (availableSlots.length > 0) {
            display.keyValue("Available (has sender)", availableSlots.sort((a, b) => a - b).join(", "));
          } else {
            display.error("No slots available to claim!");
            process.exit(1);
          }
          if (takenSlots.length > 0) {
            display.keyValue("Already claimed", takenSlots.sort((a, b) => a - b).join(", "));
          }
          display.divider();

          targetSlot = await prompts.promptNumber("Choose a slot to claim as receiver:");
        }

        // Verify slot is available
        if (!senderSlots.includes(targetSlot)) {
          display.error(`Slot ${targetSlot} has no sender. Available: ${availableSlots.join(", ")}`);
          process.exit(1);
        }
        if (receiverSlots.includes(targetSlot)) {
          display.error(`Slot ${targetSlot} already has a receiver. Available: ${availableSlots.join(", ")}`);
          process.exit(1);
        }

        // Get sender's encryption key for the slot
        const senderKey = await getSlotEncryptionKey(contract, BigInt(gameId), targetSlot, accountAddress);
        display.info(`Slot ${targetSlot} sender's public key found.`);

        // Get delivery address from user
        const deliveryAddress = await prompts.promptString(
          "Enter your delivery address (where to receive your gift):"
        );

        // Encrypt delivery address using the sender's public key
        display.step("Encrypting delivery address with sender's public key...");

        let encryptedDeliveryData: [any, any, any, any, any, any, any, any];
        try {
          encryptedDeliveryData = await encryptDeliveryData(deliveryAddress, senderKey);
          display.success("Delivery address encrypted!");
        } catch (err: any) {
          display.error(`Encryption failed: ${err.message}`);
          process.exit(1);
        }

        display.step(`Claiming slot ${targetSlot} as receiver...`);

        // The contract uses check_nullifier_exists to verify we're NOT the sender
        // of this slot. If we try to claim our own slot, the contract will reject.
        const paymentMethod = await getSponsoredPaymentMethod(wallet);
        await (contract.methods as any)
          .claim_as_receiver(
            BigInt(gameId),
            targetSlot,
            encryptedDeliveryData
          )
          .send({
            from: accountAddress,
            fee: { paymentMethod },
          })
          .wait();

        display.success(`Claimed slot ${targetSlot} as receiver!`);
        display.info("Your encrypted delivery address has been stored.");
        display.info(`The sender of slot ${targetSlot} will send you a gift!`);
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // View delivery data command
  program
    .command("delivery")
    .description("View delivery data for your slot (senders only)")
    .option("--game <id>", "Game ID", parseInt)
    .option("--slot <n>", "Your sender slot number", parseInt)
    .action(async (options) => {
      try {
        const { accountAddress, secretKey } = await cli.getWallet();
        const contract = await cli.getContract();
        const config = cli.getConfig();

        const gameId = options.game ?? config.currentGameId;
        if (!gameId) {
          display.error("No game ID specified. Use --game <id>");
          process.exit(1);
        }

        // Check phase
        const { phase, phaseName } = await getGameInfo(contract, BigInt(gameId), accountAddress);
        if (phase < PHASE.RECEIVER_CLAIM) {
          display.error(`No delivery data yet. Game is in ${phaseName} phase.`);
          process.exit(1);
        }

        // Get slot
        let slot = options.slot;
        if (!slot) {
          slot = await prompts.promptNumber("Enter your sender slot number:");
        }

        display.step(`Retrieving delivery data for slot ${slot}...`);

        const deliveryData = await getSlotDeliveryData(contract, BigInt(gameId), slot, accountAddress);

        if (isEncryptedDataEmpty(deliveryData)) {
          display.warning(`No delivery data found for slot ${slot}.`);
          display.info("The receiver may not have claimed this slot yet.");
          return;
        }

        display.header("Encrypted Delivery Data");
        display.keyValue("Ephemeral PubKey X", deliveryData[0].toString().slice(0, 20) + "...");
        display.keyValue("Ephemeral PubKey Y", deliveryData[1].toString().slice(0, 20) + "...");
        display.keyValue("Ciphertext (6 fields)", `${deliveryData[2].toString().slice(0, 12)}... (112 bytes)`);

        // Decrypt using the sender's private key
        display.step("Decrypting with your private key...");

        try {
          // Derive the encryption private key from the secret key
          const encryptionPrivateKey = deriveSigningKey(secretKey);

          const decryptedAddress = await decryptDeliveryData(deliveryData, encryptionPrivateKey);

          display.header("Decrypted Delivery Data");
          display.success("Decryption successful!");
          display.keyValue("Delivery Address", decryptedAddress);
          display.divider();
          display.info("Ship your gift to this address!");
        } catch (decryptErr: any) {
          display.warning("Decryption failed. This could mean:");
          display.info("  - You're not the sender of this slot");
          display.info("  - The data wasn't encrypted with your public key");
          display.info("  - The encrypted data is corrupted");
          display.keyValue("Error", decryptErr.message);
        }
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // Status command (shows game state)
  program
    .command("status")
    .description("View game status")
    .option("--game <id>", "Game ID", parseInt)
    .action(async (options) => {
      try {
        const { accountAddress } = await cli.getWallet();
        const contract = await cli.getContract();
        const config = cli.getConfig();

        const gameId = options.game ?? config.currentGameId;
        if (!gameId) {
          display.error("No game ID specified. Use --game <id>");
          process.exit(1);
        }

        const { phase, phaseName, participantCount, maxParticipants } = await getGameInfo(
          contract,
          BigInt(gameId),
          accountAddress
        );

        display.header(`Game #${gameId} Status`);
        display.keyValue("Phase", phaseName);
        display.keyValue("Participants", `${participantCount} / ${maxParticipants}`);

        // Provide guidance based on current phase
        display.divider();
        switch (phase) {
          case PHASE.ENROLLMENT:
            display.info("Use 'secret-santa enroll' to join this game.");
            break;
          case PHASE.SENDER_REGISTRATION:
            display.info("Use 'secret-santa register --slot <n>' to claim a slot.");
            break;
          case PHASE.RECEIVER_CLAIM:
            display.info("Use 'secret-santa claim --slot <n>' to select who sends you a gift.");
            break;
          case PHASE.COMPLETED:
            display.info("Game complete! Use 'secret-santa delivery --slot <n>' to see your recipient's address.");
            break;
        }
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
