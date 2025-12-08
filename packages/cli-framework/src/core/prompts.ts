/**
 * Prompts Utils - Interactive CLI input helpers.
 *
 * Uses @inquirer/prompts for user input with validation.
 */

import { input, password, select, confirm } from "@inquirer/prompts";

/**
 * Prompt for wallet passphrase (masked input).
 */
export async function promptPassphrase(): Promise<string> {
  return await password({
    message: "Enter your passphrase:",
    mask: "*",
    validate: (value) => {
      if (value.length < 4) {
        return "Passphrase must be at least 4 characters";
      }
      return true;
    },
  });
}

/**
 * Prompt for an Aztec address with validation.
 */
export async function promptAddress(
  message: string = "Enter address:",
): Promise<string> {
  return await input({
    message,
    validate: (value) => {
      if (!value.startsWith("0x") || value.length !== 66) {
        return "Invalid address format. Expected 0x followed by 64 hex characters";
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        return "Address must contain only hex characters";
      }
      return true;
    },
  });
}

/**
 * Prompt for contract address with validation.
 */
export async function promptContractAddress(): Promise<string> {
  return await promptAddress("Enter contract address:");
}

/**
 * Prompt for setup action (deploy or connect).
 */
export async function promptContractSetup(
  contractName: string = "contract",
): Promise<"deploy" | "connect"> {
  return await select({
    message: "What would you like to do?",
    choices: [
      { name: `Deploy a new ${contractName}`, value: "deploy" },
      { name: `Connect to existing ${contractName}`, value: "connect" },
    ],
  });
}

/**
 * Prompt for confirmation.
 */
export async function promptConfirm(
  message: string,
  defaultValue: boolean = false,
): Promise<boolean> {
  return await confirm({
    message,
    default: defaultValue,
  });
}

/**
 * Prompt for a string input.
 */
export async function promptString(
  message: string,
  defaultValue?: string,
  validate?: (value: string) => boolean | string,
): Promise<string> {
  return await input({
    message,
    default: defaultValue,
    validate,
  });
}

/**
 * Prompt for a number input.
 */
export async function promptNumber(
  message: string,
  defaultValue?: number,
  options?: {
    min?: number;
    max?: number;
  },
): Promise<number> {
  const result = await input({
    message,
    default: defaultValue?.toString(),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        return "Must be a valid number";
      }
      if (options?.min !== undefined && num < options.min) {
        return `Must be at least ${options.min}`;
      }
      if (options?.max !== undefined && num > options.max) {
        return `Must be at most ${options.max}`;
      }
      return true;
    },
  });
  return parseInt(result, 10);
}

/**
 * Prompt for a bigint input.
 */
export async function promptBigInt(
  message: string,
  defaultValue?: bigint,
): Promise<bigint> {
  const result = await input({
    message,
    default: defaultValue?.toString(),
    validate: (value) => {
      try {
        BigInt(value);
        return true;
      } catch {
        return "Must be a valid integer";
      }
    },
  });
  return BigInt(result);
}

/**
 * Prompt for a selection from a list of choices.
 */
export async function promptSelect<T extends string>(
  message: string,
  choices: { name: string; value: T }[],
): Promise<T> {
  return await select({
    message,
    choices,
  });
}

/**
 * Prompt for function arguments based on ABI parameter names.
 * Converts parameter names from snake_case to human-readable format.
 */
export async function promptFunctionArgs(
  params: { name: string; type: string }[],
): Promise<Record<string, string>> {
  const args: Record<string, string> = {};

  for (const param of params) {
    // Convert snake_case to readable format
    const readableName = param.name.replace(/_/g, " ");
    const message = `Enter ${readableName} (${param.type}):`;

    // Determine validation based on type
    let value: string;
    if (param.type.includes("Address") || param.type === "AztecAddress") {
      value = await promptAddress(message);
    } else if (param.type === "Field" || param.type.includes("int")) {
      value = await input({
        message,
        validate: (v) => {
          try {
            BigInt(v);
            return true;
          } catch {
            return "Must be a valid integer";
          }
        },
      });
    } else if (param.type === "bool") {
      const boolValue = await promptConfirm(message.replace(":", "?"));
      value = boolValue.toString();
    } else {
      value = await promptString(message);
    }

    args[param.name] = value;
  }

  return args;
}
