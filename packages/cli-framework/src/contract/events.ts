/**
 * Event utilities for fetching and decoding public logs from Aztec contracts.
 * Handles pagination properly via maxLogsHit and afterLog cursor.
 */

import type { AztecNode } from "@aztec/aztec.js/node";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  EventSelector,
  decodeFromAbi,
  type EventMetadataDefinition,
} from "@aztec/stdlib/abi";

/**
 * Options for fetching public events.
 */
export interface EventFetchOptions {
  /** Start block (default: 0) */
  fromBlock?: number;
  /** End block (default: current + 1) */
  toBlock?: number;
  /** Filter by contract address (recommended for efficiency) */
  contractAddress?: AztecAddress;
}

/**
 * Fetch and decode public events with proper pagination.
 *
 * Scans from fromBlock to toBlock, handling maxLogsHit by continuing
 * with afterLog cursor until all matching events are retrieved.
 *
 * @param node - The Aztec node client
 * @param eventMetadata - Event metadata from contract artifact (e.g., MyContract.events.MyEvent)
 * @param options - Fetch options (block range, contract address filter)
 * @returns Array of decoded events of type T
 *
 * @example
 * ```typescript
 * const events = await getPublicEvents<SlotClaimedEvent>(
 *   node,
 *   SecretSantaContract.events.SlotClaimed,
 *   { contractAddress: contract.address }
 * );
 * ```
 */
export async function getPublicEvents<T>(
  node: AztecNode,
  eventMetadata: EventMetadataDefinition,
  options: EventFetchOptions = {},
): Promise<T[]> {
  const allEvents: T[] = [];
  const fromBlock = options.fromBlock ?? 0;
  const toBlock = options.toBlock ?? (await node.getBlockNumber()) + 1;

  // Use afterLog for pagination - start with undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let afterLog: any = undefined;

  while (true) {
    const response = await node.getPublicLogs({
      fromBlock,
      toBlock,
      afterLog,
      contractAddress: options.contractAddress,
    });

    const { logs, maxLogsHit } = response;

    // Decode matching events
    // Event logs have fieldNames.length + 1 fields (data fields + selector)
    const expectedLength = eventMetadata.fieldNames.length + 1;

    for (const log of logs) {
      // Skip logs with wrong field count
      if (log.log.fields.length !== expectedLength) continue;

      // Check event selector (last field)
      const logFields = log.log.getEmittedFields();
      const selectorField = logFields[logFields.length - 1];

      if (
        !EventSelector.fromField(selectorField).equals(
          eventMetadata.eventSelector,
        )
      ) {
        continue;
      }

      try {
        const decoded = decodeFromAbi(
          [eventMetadata.abiType],
          log.log.fields,
        ) as T;
        allEvents.push(decoded);
      } catch {
        // Skip malformed events
      }
    }

    // Check if we need to continue pagination
    if (!maxLogsHit || logs.length === 0) break;

    // Set cursor for next page
    afterLog = logs[logs.length - 1].id;
  }

  return allEvents;
}
