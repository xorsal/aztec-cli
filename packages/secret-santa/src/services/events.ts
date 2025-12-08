/**
 * Events Service - Fetch and decode public events from the contract.
 */

import type { AztecNode } from "@aztec/aztec.js/node";
import { EventSelector, decodeFromAbi, type EventMetadataDefinition } from "@aztec/stdlib/abi";
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
 * Fetch decoded public events from the node.
 */
async function getDecodedPublicEvents<T>(
  node: AztecNode,
  eventMetadataDef: EventMetadataDefinition,
  fromBlock: number,
  toBlock: number,
): Promise<T[]> {
  const { logs } = await node.getPublicLogs({
    fromBlock,
    toBlock,
  });

  const decodedEvents = logs
    .map(log => {
      // +1 for the event selector
      const expectedLength = eventMetadataDef.fieldNames.length + 1;
      if (log.log.fields.length !== expectedLength) {
        return undefined;
      }

      const logFields = log.log.getEmittedFields();
      // Event selector is in the last field
      if (!EventSelector.fromField(logFields[logFields.length - 1]).equals(eventMetadataDef.eventSelector)) {
        return undefined;
      }

      return decodeFromAbi([eventMetadataDef.abiType], log.log.fields) as T;
    })
    .filter(log => log !== undefined) as T[];

  return decodedEvents;
}

/**
 * Get SlotClaimed events from a block range.
 */
export async function getSlotClaimedEvents(
  node: AztecNode,
  fromBlock: number,
  toBlock: number,
): Promise<SlotClaimedEvent[]> {
  return getDecodedPublicEvents<SlotClaimedEvent>(
    node,
    SecretSantaContract.events.SlotClaimed,
    fromBlock,
    toBlock,
  );
}

/**
 * Get ReceiverClaimed events from a block range.
 */
export async function getReceiverClaimedEvents(
  node: AztecNode,
  fromBlock: number,
  toBlock: number,
): Promise<ReceiverClaimedEvent[]> {
  return getDecodedPublicEvents<ReceiverClaimedEvent>(
    node,
    SecretSantaContract.events.ReceiverClaimed,
    fromBlock,
    toBlock,
  );
}

/**
 * Get all claimed slots for a game from events (faster than N+1 queries).
 */
export async function getClaimedSlotsFromEvents(
  node: AztecNode,
  gameId: bigint,
  fromBlock: number = 0,
  toBlock?: number,
): Promise<{ senderSlots: number[]; receiverSlots: number[] }> {
  const currentBlock = toBlock ?? await node.getBlockNumber();

  const [slotClaimedEvents, receiverClaimedEvents] = await Promise.all([
    getSlotClaimedEvents(node, fromBlock, currentBlock + 1),
    getReceiverClaimedEvents(node, fromBlock, currentBlock + 1),
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
