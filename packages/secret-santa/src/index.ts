#!/usr/bin/env node
/**
 * Secret Santa CLI - Example using aztec-cli framework.
 *
 * This demonstrates how to use the aztec-cli framework to build
 * a privacy-preserving Secret Santa game CLI with custom commands.
 */

import { createCLI, type BaseConfig } from "aztec-cli";
import { registerAdminCommands } from "./commands/admin.js";
import { registerPlayerCommands } from "./commands/player.js";
import { registerWatchCommand } from "./commands/watch.js";
import { SecretSantaContractArtifact } from "./artifacts/SecretSanta.js";

/**
 * Secret Santa-specific configuration extending BaseConfig.
 */
export interface SecretSantaConfig extends BaseConfig {
  currentGameId?: number;
}

// Create CLI with the framework
const cli = createCLI<SecretSantaConfig>({
  name: "secret-santa",
  version: "1.0.0",
  description: "ZK Secret Santa - Privacy-preserving gift exchange on Aztec",
  configFileName: ".secret-santa.json",
  artifact: SecretSantaContractArtifact,
});

// Register custom commands
registerAdminCommands(cli);
registerPlayerCommands(cli);
registerWatchCommand(cli);

// Run the CLI
cli.run();
