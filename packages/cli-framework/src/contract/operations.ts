/**
 * Contract Operations - Generic contract deployment, connection, and method calls.
 */

import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import type { AztecNode } from "@aztec/aztec.js/node";
import type { ContractArtifact } from "@aztec/aztec.js/abi";
import {
  Contract,
  type ContractBase,
  type ContractFunctionInteraction,
} from "@aztec/aztec.js/contracts";
import { TestWallet } from "@aztec/test-wallet/server";
import { getSponsoredPaymentMethod } from "../core/wallet.js";

/**
 * Options for deploying a contract.
 */
export interface DeployOptions {
  /** The account address to deploy from */
  from: AztecAddress;
  /** Optional salt for deterministic deployment */
  salt?: Fr;
}

/**
 * Deploy a contract with the given artifact and constructor arguments.
 */
export async function deployContract(
  wallet: TestWallet,
  artifact: ContractArtifact,
  args: unknown[],
  options: DeployOptions,
): Promise<ContractBase> {
  const paymentMethod = await getSponsoredPaymentMethod(wallet);

  // Use the generic Contract.deploy with artifact
  const deployMethod = Contract.deploy(wallet, artifact, args);

  const sendOptions: {
    from: AztecAddress;
    fee: { paymentMethod: typeof paymentMethod };
    contractAddressSalt?: Fr;
  } = {
    from: options.from,
    fee: { paymentMethod },
  };

  if (options.salt) {
    sendOptions.contractAddressSalt = options.salt;
  }

  const tx = deployMethod.send(sendOptions);
  const contract = await tx.deployed();

  return contract;
}

/**
 * Connect to an existing contract at the given address.
 */
export async function connectToContract(
  wallet: TestWallet,
  artifact: ContractArtifact,
  address: AztecAddress,
  node: AztecNode,
): Promise<ContractBase> {
  // Get contract instance from the node
  const instance = await node.getContract(address);
  if (!instance) {
    throw new Error(`Contract not found at ${address.toString()}`);
  }

  // Register the contract with the wallet
  await wallet.registerContract({
    instance,
    artifact,
  });

  return Contract.at(address, artifact, wallet);
}

/**
 * Check if a contract is deployed at the given address.
 */
export async function isContractDeployed(
  node: AztecNode,
  address: AztecAddress,
): Promise<boolean> {
  try {
    const instance = await node.getContract(address);
    return instance !== undefined;
  } catch {
    return false;
  }
}

/**
 * Result of calling a contract function.
 */
export interface CallResult {
  /** The return value(s) from the function */
  returnValue: unknown;
  /** Whether the call was a transaction (mutating) or simulation (view) */
  type: "transaction" | "simulation";
  /** Transaction hash if it was a transaction */
  txHash?: string;
}

/**
 * Call a contract function by name.
 *
 * @param wallet - The wallet to use for the call
 * @param contract - The contract instance
 * @param functionName - The name of the function to call
 * @param args - The arguments to pass to the function
 * @param options - Call options (from address, view mode)
 */
export async function callContractFunction(
  wallet: TestWallet,
  contract: ContractBase,
  functionName: string,
  args: unknown[],
  options: {
    from: AztecAddress;
    /** Force simulation even for mutating functions */
    simulate?: boolean;
  },
): Promise<CallResult> {
  // Get the method from the contract - methods is an object with function names as keys
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods = contract.methods as any;

  if (!(functionName in methods)) {
    throw new Error(
      `Function '${functionName}' not found in contract. Available functions: ${Object.keys(methods).join(", ")}`,
    );
  }

  const method = methods[functionName](...args) as ContractFunctionInteraction;

  // Check if this is an unconstrained (view) function
  // For now, we'll determine this by trying to simulate first
  // If simulate is explicitly requested, we always simulate
  if (options.simulate) {
    const result = await method.simulate({ from: options.from });
    return {
      returnValue: result,
      type: "simulation",
    };
  }

  // Try to send as a transaction
  try {
    const paymentMethod = await getSponsoredPaymentMethod(wallet);
    const tx = method.send({
      from: options.from,
      fee: { paymentMethod },
    });

    const receipt = await tx.wait();

    return {
      returnValue: receipt.status,
      type: "transaction",
      txHash: receipt.txHash.toString(),
    };
  } catch {
    // If sending fails, it might be an unconstrained function
    // Try simulating instead
    const result = await method.simulate({ from: options.from });
    return {
      returnValue: result,
      type: "simulation",
    };
  }
}

/**
 * Simulate a contract function (always simulates, never sends a transaction).
 */
export async function simulateContractFunction(
  contract: ContractBase,
  functionName: string,
  args: unknown[],
  from: AztecAddress,
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods = contract.methods as any;

  if (!(functionName in methods)) {
    throw new Error(
      `Function '${functionName}' not found in contract. Available functions: ${Object.keys(methods).join(", ")}`,
    );
  }

  const method = methods[functionName](...args) as ContractFunctionInteraction;
  return await method.simulate({ from });
}

/**
 * Parse a string value into the appropriate type for a contract argument.
 */
export function parseArgument(value: string, type: string): unknown {
  // Handle Address types
  if (type.includes("Address") || type === "AztecAddress") {
    return AztecAddress.fromString(value);
  }

  // Handle Field
  if (type === "Field") {
    return new Fr(BigInt(value));
  }

  // Handle integers
  if (type.match(/^[iu]\d+$/)) {
    return BigInt(value);
  }

  // Handle boolean
  if (type === "bool") {
    return value.toLowerCase() === "true" || value === "1";
  }

  // Handle arrays (basic support)
  if (type.startsWith("[") && type.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to return as string
    }
  }

  // Default: return as-is
  return value;
}

/**
 * Format a return value for display.
 */
export function formatReturnValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "(no return value)";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Fr) {
    return value.toString();
  }

  if (value instanceof AztecAddress) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return `[${value.map(formatReturnValue).join(", ")}]`;
  }

  if (typeof value === "object") {
    // Try to convert to a readable format
    try {
      return JSON.stringify(
        value,
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      );
    } catch {
      return String(value);
    }
  }

  return String(value);
}
