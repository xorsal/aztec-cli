/**
 * Config Service Factory - Parameterized configuration persistence.
 *
 * Creates a config service with a custom config file name and schema.
 * Stores configuration in JSON files (local or global).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { type NetworkName, NETWORKS } from "./network.js";

/**
 * Base configuration interface that all configs must extend.
 */
export interface BaseConfig {
  nodeUrl: string;
  network: NetworkName;
  contractAddress?: string;
}

/**
 * Configuration service interface.
 */
export interface ConfigService<T extends BaseConfig> {
  load(): T;
  save(config: T, useGlobal?: boolean): void;
  update(updates: Partial<T>): T;
  clear(): void;
  hasContractAddress(): boolean;
  getContractAddress(): string;
  getNodeUrl(): string;
  getNetwork(): NetworkName;
  setNetwork(network: NetworkName): T;
}

/**
 * Create a configuration service for a specific config file.
 *
 * @param fileName - The config file name (e.g., '.raffle.json')
 * @param defaultConfig - Default configuration values
 * @returns A ConfigService instance
 */
export function createConfigService<T extends BaseConfig>(
  fileName: string,
  defaultConfig: T,
): ConfigService<T> {
  const localConfigPath = join(process.cwd(), fileName);
  const globalConfigPath = join(homedir(), fileName);

  /**
   * Get the config file path to use.
   * Prefers local config if it exists, otherwise uses global.
   */
  function getConfigPath(): string {
    if (existsSync(localConfigPath)) {
      return localConfigPath;
    }
    return globalConfigPath;
  }

  /**
   * Load configuration from file.
   * Returns default config if file doesn't exist.
   */
  function load(): T {
    const configPath = getConfigPath();

    try {
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, "utf-8");
        const loaded = JSON.parse(content);
        return { ...defaultConfig, ...loaded };
      }
    } catch (error) {
      console.warn(`Warning: Could not load config from ${configPath}`);
    }

    return { ...defaultConfig };
  }

  /**
   * Save configuration to file.
   * Saves to local config path by default.
   */
  function save(config: T, useGlobal: boolean = false): void {
    const configPath = useGlobal ? globalConfigPath : localConfigPath;

    try {
      // Ensure directory exists
      const dir = dirname(configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (error) {
      throw new Error(`Failed to save config to ${configPath}: ${error}`);
    }
  }

  /**
   * Update specific config values without overwriting everything.
   */
  function update(updates: Partial<T>): T {
    const current = load();
    const updated = { ...current, ...updates };
    save(updated);
    return updated;
  }

  /**
   * Clear the current configuration file.
   */
  function clear(): void {
    save(defaultConfig);
  }

  /**
   * Check if a contract address is configured.
   */
  function hasContractAddress(): boolean {
    const config = load();
    return !!config.contractAddress;
  }

  /**
   * Get the configured contract address or throw if not set.
   */
  function getContractAddress(): string {
    const config = load();
    if (!config.contractAddress) {
      throw new Error(
        "No contract address configured. Run 'setup' command first.",
      );
    }
    return config.contractAddress;
  }

  /**
   * Get the configured node URL.
   */
  function getNodeUrl(): string {
    const config = load();
    return config.nodeUrl;
  }

  /**
   * Get the current network name.
   */
  function getNetwork(): NetworkName {
    const config = load();
    return config.network;
  }

  /**
   * Set the network (sandbox or devnet).
   */
  function setNetwork(network: NetworkName): T {
    return update({
      network,
      nodeUrl: NETWORKS[network],
    } as Partial<T>);
  }

  return {
    load,
    save,
    update,
    clear,
    hasContractAddress,
    getContractAddress,
    getNodeUrl,
    getNetwork,
    setNetwork,
  };
}

/**
 * Create default base config for a given network.
 */
export function createDefaultConfig(network: NetworkName = "sandbox"): BaseConfig {
  return {
    nodeUrl: NETWORKS[network],
    network,
  };
}
