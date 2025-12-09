/**
 * Events Service - Fetch and decode public events from the contract.
 *
 * Uses the cli-framework's getPublicEvents utility which handles:
 * - Proper pagination via maxLogsHit and afterLog cursor
 * - Contract address filtering at the node level
 */

import type { AztecNode } from "@aztec/aztec.js/node";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import { getPublicEvents } from "aztec-cli";
import { SecretSantaContract } from "../artifacts/SecretSanta.js";

// Event types
export interface SlotClaimedEvent {
  game_id: bigint;
  slot: bigint;
}

export interface ReceiverClaimedEvent {
  game_id: bigint;
  slot: bigint;
}

/**
 * Get SlotClaimed events from the contract.
 *
 * @param node - Aztec node client
 * @param contractAddress - Contract address to filter events
 * @param fromBlock - Start block (default: 0)
 * @param toBlock - End block (default: current)
 */
export async function getSlotClaimedEvents(
  node: AztecNode,
  contractAddress: AztecAddress,
  fromBlock: number = 0,
  toBlock?: number,
): Promise<SlotClaimedEvent[]> {
  return getPublicEvents<SlotClaimedEvent>(
    node,
    SecretSantaContract.events.SlotClaimed,
    { fromBlock, toBlock, contractAddress },
  );
}

/**
 * Get ReceiverClaimed events from the contract.
 *
 * @param node - Aztec node client
 * @param contractAddress - Contract address to filter events
 * @param fromBlock - Start block (default: 0)
 * @param toBlock - End block (default: current)
 */
export async function getReceiverClaimedEvents(
  node: AztecNode,
  contractAddress: AztecAddress,
  fromBlock: number = 0,
  toBlock?: number,
): Promise<ReceiverClaimedEvent[]> {
  return getPublicEvents<ReceiverClaimedEvent>(
    node,
    SecretSantaContract.events.ReceiverClaimed,
    { fromBlock, toBlock, contractAddress },
  );
}

/**
 * Get all claimed slots for a game from events.
 *
 * Scans the blockchain for SlotClaimed and ReceiverClaimed events
 * from the contract, then filters by game ID.
 *
 * @param node - Aztec node client
 * @param contractAddress - Contract address to filter events
 * @param gameId - Game ID to filter events
 * @param fromBlock - Start block (default: 0)
 * @param toBlock - End block (default: current)
 */
export async function getClaimedSlotsFromEvents(
  node: AztecNode,
  contractAddress: AztecAddress,
  gameId: bigint,
  fromBlock: number = 0,
  toBlock?: number,
): Promise<{ senderSlots: number[]; receiverSlots: number[] }> {
  const currentBlock = toBlock ?? await node.getBlockNumber();

  // Fetch both event types (these are separate HTTP requests, not PXE calls)
  const [slotClaimedEvents, receiverClaimedEvents] = await Promise.all([
    getSlotClaimedEvents(node, contractAddress, fromBlock, currentBlock + 1),
    getReceiverClaimedEvents(node, contractAddress, fromBlock, currentBlock + 1),
  ]);

  // Filter by game ID
  const senderSlots = slotClaimedEvents
    .filter(e => e.game_id === gameId)
    .map(e => Number(e.slot));

  const receiverSlots = receiverClaimedEvents
    .filter(e => e.game_id === gameId)
    .map(e => Number(e.slot));

  return { senderSlots, receiverSlots };
}
