/**
 * Aztec CLI Framework
 *
 * Build CLIs for Aztec contracts with minimal configuration.
 *
 * @example
 * ```typescript
 * import { createCLI } from 'aztec-cli';
 * import artifact from './artifacts/MyContract.json';
 *
 * const cli = createCLI({
 *   name: 'my-contract',
 *   version: '1.0.0',
 *   description: 'CLI for MyContract',
 *   configFileName: '.my-contract.json',
 *   artifact,
 * });
 *
 * // Add custom commands
 * cli.command('custom')
 *    .description('Custom command')
 *    .action(async () => {
 *      const { wallet, accountAddress } = await cli.getWallet();
 *      // Custom logic
 *    });
 *
 * cli.run();
 * ```
 */

// CLI Builder
export { CLIBuilder, createCLI, type CLIOptions, type WalletContext } from "./cli/index.js";

// Core utilities
export {
  // Network
  NETWORKS,
  type NetworkName,
  PXE_DATA_DIRECTORIES,
  isValidNetwork,
  getNetworkUrl,
  getPxeDataDirectory,
  // Wallet
  registerSponsoredFPC,
  getSponsoredPaymentMethod,
  passphraseToSecretKey,
  hashSecretKey,
  createAccountFromPassphrase,
  getOrDeployWallet,
  // Config
  type BaseConfig,
  type ConfigService,
  createConfigService,
  createDefaultConfig,
  // Display & Prompts
  display,
  prompts,
} from "./core/index.js";

// Contract utilities
export {
  // Artifact
  type FunctionInfo,
  type ParameterInfo,
  loadArtifactFromJson,
  getContractName,
  getArtifactFunctions,
  getCallableFunctions,
  getViewFunctions,
  getMutatingFunctions,
  getConstructorInfo,
  findFunction,
  isViewFunction,
  parameterToFlag,
  flagToParameter,
  // Operations
  type DeployOptions,
  type CallResult,
  deployContract,
  connectToContract,
  isContractDeployed,
  callContractFunction,
  simulateContractFunction,
  parseArgument,
  formatReturnValue,
  // Events
  type EventFetchOptions,
  getPublicEvents,
} from "./contract/index.js";
