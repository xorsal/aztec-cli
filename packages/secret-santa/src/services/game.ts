/**
 * Game Service - Phase constants and helper functions for Secret Santa
 */

import { Fr } from "@aztec/aztec.js/fields";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import type { ContractBase } from "@aztec/aztec.js/contracts";
import { deriveSigningKey, derivePublicKeyFromSecretKey } from "@aztec/stdlib/keys";

/**
 * Game phases
 */
export const PHASE = {
  ENROLLMENT: 1,
  SENDER_REGISTRATION: 2,
  RECEIVER_CLAIM: 3,
  COMPLETED: 4,
} as const;

/**
 * Human-readable phase names
 */
export const PHASE_NAMES: Record<number, string> = {
  1: "Enrollment",
  2: "Sender Registration",
  3: "Receiver Claim",
  4: "Completed",
};

/**
 * Get game information from the contract.
 */
export async function getGameInfo(
  contract: ContractBase,
  gameId: bigint,
  caller: AztecAddress
): Promise<{
  phase: number;
  phaseName: string;
  participantCount: number;
  maxParticipants: number;
}> {
  const methods = contract.methods as any;

  const [phase, participantCount, maxParticipants] = await Promise.all([
    methods.get_game_phase(gameId).simulate({ from: caller }),
    methods.get_participant_count(gameId).simulate({ from: caller }),
    methods.get_max_participants(gameId).simulate({ from: caller }),
  ]);

  return {
    phase: Number(phase),
    phaseName: PHASE_NAMES[Number(phase)] || "Unknown",
    participantCount: Number(participantCount),
    maxParticipants: Number(maxParticipants),
  };
}

/**
 * Derive the encryption public key from the secret key.
 * This is used for encrypting delivery data in the Secret Santa protocol.
 */
export async function getEncryptionPublicKey(
  secretKey: Fr
): Promise<{ x: Fr; y: Fr; is_infinite: boolean }> {
  const signingKey = deriveSigningKey(secretKey);
  const publicKey = await derivePublicKeyFromSecretKey(signingKey);

  return {
    x: new Fr(publicKey.x.toBigInt()),
    y: new Fr(publicKey.y.toBigInt()),
    is_infinite: publicKey.isInfinite,
  };
}

/**
 * Check if a slot is claimed in a game.
 */
export async function isSlotClaimed(
  contract: ContractBase,
  gameId: bigint,
  slot: number,
  caller: AztecAddress
): Promise<boolean> {
  const methods = contract.methods as any;
  return await methods.is_slot_claimed(gameId, slot).simulate({ from: caller });
}

/**
 * Get the encryption public key for a slot.
 */
export async function getSlotEncryptionKey(
  contract: ContractBase,
  gameId: bigint,
  slot: number,
  caller: AztecAddress
): Promise<{ x: bigint; y: bigint; is_infinite: boolean }> {
  const methods = contract.methods as any;
  return await methods.get_slot_encryption_key(gameId, BigInt(slot)).simulate({ from: caller });
}

/**
 * Get the encrypted delivery data for a slot.
 */
export async function getSlotDeliveryData(
  contract: ContractBase,
  gameId: bigint,
  slot: number,
  caller: AztecAddress
): Promise<[bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]> {
  const methods = contract.methods as any;
  const data = await methods.get_slot_delivery_data(gameId, BigInt(slot)).simulate({ from: caller });
  return [data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]];
}
