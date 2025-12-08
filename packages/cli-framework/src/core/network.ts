/**
 * Network configuration constants and utilities.
 */

export const NETWORKS = {
  sandbox: "http://localhost:8080",
  devnet: "https://devnet.aztec-labs.com",
} as const;

export type NetworkName = keyof typeof NETWORKS;

/**
 * PXE data directories for persistent note storage per network.
 */
export const PXE_DATA_DIRECTORIES: Record<NetworkName, string> = {
  sandbox: "pxe-data-sandbox",
  devnet: "pxe-data-devnet",
};

/**
 * Check if a string is a valid network name.
 */
export function isValidNetwork(name: string): name is NetworkName {
  return name in NETWORKS;
}

/**
 * Get the node URL for a network.
 */
export function getNetworkUrl(network: NetworkName): string {
  return NETWORKS[network];
}

/**
 * Get the PXE data directory for a network.
 */
export function getPxeDataDirectory(network: NetworkName): string {
  return PXE_DATA_DIRECTORIES[network];
}
