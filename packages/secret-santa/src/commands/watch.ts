/**
 * Watch Command - Real-time monitoring of game events.
 *
 * Polls for new blocks and displays slot claim notifications.
 */

import { type CLIBuilder, display } from "aztec-cli";
import type { SecretSantaConfig } from "../index.js";
import { getSlotClaimedEvents, getReceiverClaimedEvents } from "../services/events.js";
import { getGameInfo, PHASE_NAMES } from "../services/game.js";

/**
 * Register the watch command with the CLI.
 */
export function registerWatchCommand(cli: CLIBuilder<SecretSantaConfig>): void {
  const program = cli.getProgram();

  program
    .command("watch")
    .description("Watch game events in real-time")
    .option("--game <id>", "Game ID to watch", parseInt)
    .option("--interval <ms>", "Polling interval in milliseconds", parseInt)
    .action(async (options) => {
      try {
        const { accountAddress, node } = await cli.getWallet();
        const contract = await cli.getContract();
        const config = cli.getConfig();

        const gameId = options.game ?? config.currentGameId;
        if (!gameId) {
          display.error("No game ID specified. Use --game <id>");
          process.exit(1);
        }

        const interval = options.interval ?? 5000; // Default 5 seconds

        // Get initial game info
        const { phase, phaseName, participantCount, maxParticipants } = await getGameInfo(
          contract,
          BigInt(gameId),
          accountAddress
        );

        display.header(`Watching Game #${gameId}`);
        display.keyValue("Phase", phaseName);
        display.keyValue("Participants", `${participantCount} / ${maxParticipants}`);
        display.keyValue("Polling interval", `${interval}ms`);
        display.divider();
        display.info("Watching for events... (Ctrl+C to stop)\n");

        // Track last seen block
        let lastBlock = await node.getBlockNumber();
        let lastPhase = phase;

        // Track claimed slots
        const claimedSenderSlots = new Set<number>();
        const claimedReceiverSlots = new Set<number>();

        // Polling loop
        const poll = async () => {
          try {
            const currentBlock = await node.getBlockNumber();

            if (currentBlock > lastBlock) {
              // Fetch events from new blocks
              const [slotEvents, receiverEvents] = await Promise.all([
                getSlotClaimedEvents(node, contract.address, lastBlock + 1, currentBlock + 1),
                getReceiverClaimedEvents(node, contract.address, lastBlock + 1, currentBlock + 1),
              ]);

              // Filter by game ID and process new events
              for (const event of slotEvents) {
                if (event.game_id === BigInt(gameId)) {
                  const slot = Number(event.slot);
                  if (!claimedSenderSlots.has(slot)) {
                    claimedSenderSlots.add(slot);
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`[${timestamp}] 🎁 Slot ${slot} claimed by sender (block ${currentBlock})`);
                  }
                }
              }

              for (const event of receiverEvents) {
                if (event.game_id === BigInt(gameId)) {
                  const slot = Number(event.slot);
                  if (!claimedReceiverSlots.has(slot)) {
                    claimedReceiverSlots.add(slot);
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`[${timestamp}] 📬 Slot ${slot} claimed by receiver (block ${currentBlock})`);
                  }
                }
              }

              // Check for phase changes
              const { phase: newPhase } = await getGameInfo(contract, BigInt(gameId), accountAddress);
              if (newPhase !== lastPhase) {
                const newPhaseName = PHASE_NAMES[newPhase] || "Unknown";
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] 📢 Phase changed: ${PHASE_NAMES[lastPhase]} → ${newPhaseName}`);
                lastPhase = newPhase;
              }

              lastBlock = currentBlock;
            }
          } catch (err) {
            // Silently retry on transient errors
          }
        };

        // Start polling
        const intervalId = setInterval(poll, interval);

        // Handle Ctrl+C
        process.on("SIGINT", () => {
          clearInterval(intervalId);
          console.log("\n");
          display.info("Stopped watching.");
          display.divider();
          display.keyValue("Sender slots claimed", claimedSenderSlots.size.toString());
          display.keyValue("Receiver slots claimed", claimedReceiverSlots.size.toString());
          process.exit(0);
        });

        // Initial poll
        await poll();

      } catch (err: unknown) {
        display.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
