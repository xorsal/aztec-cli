/**
 * Display Utils - Colored console output helpers.
 *
 * Provides consistent formatting for CLI messages using chalk.
 */

import chalk from "chalk";

/**
 * Display a success message with green checkmark.
 */
export function success(message: string): void {
  console.log(chalk.green("✓"), message);
}

/**
 * Display an error message with red X.
 */
export function error(message: string): void {
  console.log(chalk.red("✗"), chalk.red(message));
}

/**
 * Display a warning message with yellow warning sign.
 */
export function warning(message: string): void {
  console.log(chalk.yellow("⚠"), chalk.yellow(message));
}

/**
 * Display an info message with blue info sign.
 */
export function info(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

/**
 * Display a step message with arrow.
 */
export function step(message: string): void {
  console.log(chalk.cyan("→"), message);
}

/**
 * Display a header with decoration.
 */
export function header(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(`═══ ${title} ═══`));
  console.log();
}

/**
 * Display a key-value pair.
 */
export function keyValue(key: string, value: string): void {
  console.log(`  ${chalk.gray(key + ":")} ${value}`);
}

/**
 * Display a divider line.
 */
export function divider(): void {
  console.log(chalk.gray("─".repeat(40)));
}

/**
 * Format an address for display.
 */
export function formatAddress(address: string): string {
  return address;
}

/**
 * Display wallet info after initialization.
 */
export function walletInfo(address: string, isNew: boolean): void {
  const status = isNew
    ? chalk.yellow("(newly deployed)")
    : chalk.green("(existing)");
  keyValue("Account", `${formatAddress(address)} ${status}`);
}

/**
 * Display contract info.
 */
export function contractInfo(address: string, isNew: boolean = false): void {
  const status = isNew
    ? chalk.yellow("(newly deployed)")
    : chalk.green("(connected)");
  keyValue("Contract", `${formatAddress(address)} ${status}`);
}

/**
 * Display token balance.
 */
export function balanceInfo(address: string, balance: bigint | number): void {
  keyValue("Address", formatAddress(address));
  keyValue("Balance", balance.toString());
}

/**
 * Display a table of key-value pairs.
 */
export function table(data: Record<string, string | number | bigint | boolean | undefined>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      const displayValue = typeof value === "boolean"
        ? (value ? chalk.green("Yes") : chalk.red("No"))
        : String(value);
      keyValue(key, displayValue);
    }
  }
}

/**
 * Create a colored status badge.
 */
export function badge(text: string, color: "green" | "yellow" | "red" | "blue" | "gray"): string {
  const colors = {
    green: chalk.green,
    yellow: chalk.yellow,
    red: chalk.red,
    blue: chalk.blue,
    gray: chalk.gray,
  };
  return colors[color](`[${text}]`);
}
