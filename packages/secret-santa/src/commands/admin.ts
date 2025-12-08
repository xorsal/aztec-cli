/**
 * Admin Commands - Game management operations.
 *
 * Commands: create, advance, status
 */

import {
  type CLIBuilder,
  display,
  getSponsoredPaymentMethod,
} from "aztec-cli";
import type { SecretSantaConfig } from "../index.js";
import { getGameInfo, PHASE, PHASE_NAMES, isSlotClaimed, getSlotDeliveryData } from "../services/game.js";
import { isEncryptedDataEmpty } from "../services/crypto.js";

/**
 * Register admin commands with the CLI.
 */
export function registerAdminCommands(cli: CLIBuilder<SecretSantaConfig>): void {
  const program = cli.getProgram();

  // Admin subcommand group
  const admin = program
    .command("admin")
    .description("Admin commands for game management");

  // Create game command
  admin
    .command("create")
    .description("Create a new Secret Santa game")
    .option("--min <n>", "Minimum participants", parseInt)
    .option("--max <n>", "Maximum participants", parseInt)
    .action(async (options) => {
      try {
        const { wallet, accountAddress } = await cli.getWallet();
        const contract = await cli.getContract();

        const min = options.min ?? 3;
        const max = options.max ?? 10;

        if (min < 2) {
          display.error("Minimum participants must be at least 2");
          process.exit(1);
        }

        if (max < min) {
          display.error("Maximum participants must be >= minimum");
          process.exit(1);
        }

        display.step(`Creating game with ${min}-${max} participants...`);

        const paymentMethod = await getSponsoredPaymentMethod(wallet);
        const receipt = await (contract.methods as any)
          .create_game(min, max)
          .send({
            from: accountAddress,
            fee: { paymentMethod },
          })
          .wait();

        // Get the new game ID from the contract
        const nextGameId = await (contract.methods as any)
          .get_next_game_id()
          .simulate({ from: accountAddress });
        const gameId = Number(nextGameId) - 1;

        // Save game ID to config
        cli.getConfigService().update({ currentGameId: gameId });

        display.success(`Game #${gameId} created!`);
        display.keyValue("Minimum participants", min.toString());
        display.keyValue("Maximum participants", max.toString());
        display.keyValue("Phase", "Enrollment");
        display.divider();
        display.info("Players can now enroll with: secret-santa enroll --game " + gameId);
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // Advance phase command
  admin
    .command("advance")
    .description("Advance the game to the next phase")
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

        // Get current phase
        const { phase, phaseName } = await getGameInfo(contract, BigInt(gameId), accountAddress);

        if (phase >= PHASE.COMPLETED) {
          display.error("Game is already completed");
          process.exit(1);
        }

        display.step(`Advancing game #${gameId} from ${phaseName}...`);

        const paymentMethod = await getSponsoredPaymentMethod(wallet);
        await (contract.methods as any)
          .advance_phase(BigInt(gameId))
          .send({
            from: accountAddress,
            fee: { paymentMethod },
          })
          .wait();

        const newPhaseName = PHASE_NAMES[phase + 1] || "Unknown";
        display.success(`Game #${gameId} advanced to ${newPhaseName}!`);

        // Provide guidance based on new phase
        switch (phase + 1) {
          case PHASE.SENDER_REGISTRATION:
            display.info("Players can now register slots with: secret-santa register --game " + gameId + " --slot <n>");
            break;
          case PHASE.RECEIVER_CLAIM:
            display.info("Players can now claim slots with: secret-santa claim --game " + gameId + " --slot <n>");
            break;
          case PHASE.COMPLETED:
            display.info("Game complete! Senders can view delivery data with: secret-santa delivery --game " + gameId + " --slot <n>");
            break;
        }
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // Status command
  admin
    .command("status")
    .description("View detailed game status")
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
        display.divider();

        // Show slot status if past enrollment
        if (phase >= PHASE.SENDER_REGISTRATION) {
          display.header("Slot Status");

          for (let slot = 1; slot <= maxParticipants; slot++) {
            const claimed = await isSlotClaimed(contract, BigInt(gameId), slot, accountAddress);
            let status = claimed ? "Claimed (sender registered)" : "Available";

            // Check for delivery data if in receiver claim or completed
            if (phase >= PHASE.RECEIVER_CLAIM && claimed) {
              const deliveryData = await getSlotDeliveryData(contract, BigInt(gameId), slot, accountAddress);
              if (!isEncryptedDataEmpty(deliveryData)) {
                status = "Claimed (receiver assigned)";
              }
            }

            display.keyValue(`Slot ${slot}`, status);
          }
        }
      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
