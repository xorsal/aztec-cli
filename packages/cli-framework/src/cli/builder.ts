/**
 * CLI Builder - Framework for building Aztec contract CLIs.
 *
 * Provides a simple API to create CLIs with built-in commands for
 * setup, info, and generic contract function calls.
 */

import { Command } from "commander";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { ContractArtifact } from "@aztec/aztec.js/abi";
import {
  createAztecNodeClient,
  waitForNode,
  type AztecNode,
} from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import type { ContractBase } from "@aztec/aztec.js/contracts";
import type { Fr } from "@aztec/aztec.js/fields";

import {
  type BaseConfig,
  createConfigService,
  type ConfigService,
  NETWORKS,
  type NetworkName,
  getPxeDataDirectory,
  getOrDeployWallet,
  display,
  prompts,
} from "../core/index.js";
import {
  loadArtifactFromJson,
  getContractName,
  deployContract,
  connectToContract,
} from "../contract/index.js";

/**
 * Options for creating a CLI.
 */
export interface CLIOptions<TConfig extends BaseConfig> {
  /** CLI name (used in help text) */
  name: string;
  /** CLI version */
  version: string;
  /** CLI description */
  description: string;
  /** Config file name (e.g., '.raffle.json') */
  configFileName: string;
  /** Contract artifact (JSON object or ContractArtifact) */
  artifact: unknown;
  /** Default config values */
  defaultConfig?: Partial<TConfig>;
}

/**
 * Wallet context provided to commands.
 */
export interface WalletContext {
  wallet: TestWallet;
  accountAddress: AztecAddress;
  secretKey: Fr;
  node: AztecNode;
}

/**
 * CLI Builder class - main framework entry point.
 */
export class CLIBuilder<TConfig extends BaseConfig> {
  private program: Command;
  private options: CLIOptions<TConfig>;
  private artifact: ContractArtifact;
  private configService: ConfigService<TConfig>;

  // Session state
  private testWallet: TestWallet | null = null;
  private aztecNode: AztecNode | null = null;
  private cachedAccountAddress: AztecAddress | null = null;
  private cachedSecretKey: Fr | null = null;
  private globalPassphrase: string | null = null;
  private cachedContract: ContractBase | null = null;

  constructor(options: CLIOptions<TConfig>) {
    this.options = options;
    this.artifact = loadArtifactFromJson(options.artifact);

    // Create config service with defaults
    const defaultConfig: TConfig = {
      nodeUrl: NETWORKS.sandbox,
      network: "sandbox" as NetworkName,
      ...options.defaultConfig,
    } as TConfig;

    this.configService = createConfigService<TConfig>(
      options.configFileName,
      defaultConfig,
    );

    // Initialize Commander program
    this.program = new Command();
    this.program
      .name(options.name)
      .description(options.description)
      .version(options.version)
      .option("--sandbox", "Connect to local sandbox (localhost:8080)")
      .option("--devnet", "Connect to Aztec devnet")
      .option(
        "-p, --passphrase <passphrase>",
        "Passphrase for wallet (avoids interactive prompt)",
      )
      .hook("preAction", (thisCommand) => {
        const opts = thisCommand.opts();
        if (opts.sandbox) {
          this.configService.setNetwork("sandbox");
        } else if (opts.devnet) {
          this.configService.setNetwork("devnet");
        }
        if (opts.passphrase) {
          this.globalPassphrase = opts.passphrase;
        }
      });

    // Register built-in commands
    this.registerSetupCommand();
    this.registerInfoCommand();
    this.registerCallCommand();
  }

  /**
   * Get the underlying Commander program for custom command registration.
   */
  getProgram(): Command {
    return this.program;
  }

  /**
   * Get the contract artifact.
   */
  getArtifact(): ContractArtifact {
    return this.artifact;
  }

  /**
   * Get the config service.
   */
  getConfigService(): ConfigService<TConfig> {
    return this.configService;
  }

  /**
   * Get the current config.
   */
  getConfig(): TConfig {
    return this.configService.load();
  }

  /**
   * Initialize the TestWallet connection.
   */
  async initTestWallet(): Promise<{ wallet: TestWallet; node: AztecNode }> {
    if (this.testWallet && this.aztecNode) {
      return { wallet: this.testWallet, node: this.aztecNode };
    }

    const nodeUrl = this.configService.getNodeUrl();
    const network = this.configService.getNetwork();
    display.step(`Connecting to ${network} (${nodeUrl})...`);

    const node = createAztecNodeClient(nodeUrl);

    try {
      await waitForNode(node);
    } catch {
      display.error(`Failed to connect to Aztec node at ${nodeUrl}`);
      if (network === "sandbox") {
        display.info(
          "Make sure the Aztec sandbox is running: aztec start --sandbox",
        );
      } else {
        display.info(
          "Check your network connection or try --sandbox for local development",
        );
      }
      process.exit(1);
    }

    // Create TestWallet with persistent PXE data directory
    const pxeDataDirectory = getPxeDataDirectory(network);
    this.testWallet = await TestWallet.create(
      node,
      {
        dataDirectory: pxeDataDirectory,
        proverEnabled: false,
      },
      {},
    );
    this.aztecNode = node;

    display.success(`Connected to ${network}`);
    return { wallet: this.testWallet, node: this.aztecNode };
  }

  /**
   * Get wallet context, prompting for passphrase if needed.
   */
  async getWallet(): Promise<WalletContext> {
    // Use cached account if available
    if (
      this.testWallet &&
      this.cachedAccountAddress &&
      this.cachedSecretKey &&
      this.aztecNode
    ) {
      return {
        wallet: this.testWallet,
        accountAddress: this.cachedAccountAddress,
        secretKey: this.cachedSecretKey,
        node: this.aztecNode,
      };
    }

    const { wallet, node } = await this.initTestWallet();

    // Use global passphrase if set, otherwise prompt
    const passphrase =
      this.globalPassphrase || (await prompts.promptPassphrase());

    display.step("Initializing wallet...");

    const { accountAddress, secretKey, isNewDeployment } =
      await getOrDeployWallet(wallet, passphrase, true);

    if (isNewDeployment) {
      display.success("Account deployed!");
    }

    display.walletInfo(accountAddress.toString(), isNewDeployment);

    // Cache account info for this session
    this.cachedAccountAddress = accountAddress;
    this.cachedSecretKey = secretKey;

    return { wallet, accountAddress, secretKey, node };
  }

  /**
   * Get the connected contract instance.
   */
  async getContract(): Promise<ContractBase> {
    if (this.cachedContract) {
      return this.cachedContract;
    }

    const { wallet, node } = await this.getWallet();
    const contractAddress = this.configService.getContractAddress();

    display.step("Connecting to contract...");
    this.cachedContract = await connectToContract(
      wallet,
      this.artifact,
      AztecAddress.fromString(contractAddress),
      node,
    );

    return this.cachedContract;
  }

  /**
   * Register a custom command.
   */
  command(name: string): Command {
    return this.program.command(name);
  }

  /**
   * Run the CLI.
   */
  run(): void {
    this.program.parse();

    // Cleanup on exit
    process.on("SIGINT", () => {
      display.info("\nGoodbye!");
      process.exit(0);
    });
  }

  // ==================== Built-in Commands ====================

  private registerSetupCommand(): void {
    const contractName = getContractName(this.artifact);

    this.program
      .command("setup")
      .description(`Configure ${contractName} contract (deploy or connect). Deploy will prompt for constructor parameters.`)
      .option("--admin <address>", "Deploy new contract with this admin address (skips prompts)")
      .option("--connect <address>", "Connect to existing contract at address (skips prompts)")
      .action(async (options: { admin?: string; connect?: string }) => {
        try {
          await this.setupCommand(contractName, options);
        } catch (err: unknown) {
          display.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      });
  }

  private async setupCommand(
    contractName: string,
    options: { admin?: string; connect?: string } = {},
  ): Promise<void> {
    display.header(`${contractName} Setup`);

    const { wallet, accountAddress, node } = await this.getWallet();

    // Determine if we're in non-interactive mode
    const nonInteractive = options.admin || options.connect;

    // Check if we already have a contract (skip prompt if non-interactive)
    if (this.configService.hasContractAddress() && !nonInteractive) {
      const config = this.configService.load();
      display.info(`Current contract: ${config.contractAddress}`);

      const reconfigure = await prompts.promptConfirm("Reconfigure contract?");
      if (!reconfigure) {
        return;
      }
    }

    // Determine action: --admin implies deploy, --connect implies connect
    let action: "deploy" | "connect";
    if (options.admin) {
      action = "deploy";
    } else if (options.connect) {
      action = "connect";
    } else {
      action = await prompts.promptContractSetup(contractName);
    }

    if (action === "deploy") {
      // Get constructor parameters
      // Constructor is a public initializer, so it's in nonDispatchPublicFunctions, not functions
      const allFunctions = [
        ...this.artifact.functions,
        ...(this.artifact.nonDispatchPublicFunctions || []),
      ];
      const constructorFn = allFunctions.find(
        (f) => f.name === "constructor" || f.isInitializer,
      );

      let args: unknown[] = [];
      if (constructorFn && constructorFn.parameters.length > 0) {
        if (options.admin) {
          // Non-interactive: use --admin as the first parameter (assumed to be admin/owner)
          // and derive defaults for any additional params
          args = constructorFn.parameters.map((p, index) => {
            const type = this.formatType(p.type);
            // Check if this is an address type
            if (type.includes("Address") || type === "AztecAddress") {
              return AztecAddress.fromString(options.admin!);
            }
            // For other params, use sensible defaults or error
            if (type === "Field" || type.match(/^[iu]\d+$/)) {
              return 0n;
            }
            if (type === "bool") {
              return false;
            }
            throw new Error(
              `Cannot auto-fill parameter '${p.name}' of type '${type}'. Use interactive mode.`,
            );
          });
        } else {
          display.info("Enter constructor parameters:");
          const argValues = await prompts.promptFunctionArgs(
            constructorFn.parameters.map((p) => ({
              name: p.name,
              type: this.formatType(p.type),
            })),
          );

          // Parse arguments in order
          args = constructorFn.parameters.map((p) => {
            const value = argValues[p.name];
            return this.parseArgValue(value, this.formatType(p.type));
          });
        }
      }

      display.step(`Deploying new ${contractName} contract...`);
      if (options.admin) {
        display.keyValue("Admin", options.admin);
      }

      const contract = await deployContract(wallet, this.artifact, args, {
        from: accountAddress,
      });

      const contractAddress = contract.address.toString();
      this.configService.update({ contractAddress } as Partial<TConfig>);
      this.cachedContract = contract;

      display.contractInfo(contractAddress, true);
      display.success("Contract deployed and saved to config!");
    } else {
      // Get contract address from --connect or prompt
      const contractAddress = options.connect || await prompts.promptContractAddress();

      // Verify contract exists
      try {
        const contract = await connectToContract(
          wallet,
          this.artifact,
          AztecAddress.fromString(contractAddress),
          node,
        );

        this.configService.update({ contractAddress } as Partial<TConfig>);
        this.cachedContract = contract;

        display.contractInfo(contractAddress);
        display.success("Connected to contract and saved to config!");
      } catch (err: unknown) {
        display.error(
          `Failed to connect to contract: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    }
  }

  private registerInfoCommand(): void {
    this.program
      .command("info")
      .description("Show current configuration")
      .action(() => {
        try {
          this.infoCommand();
        } catch (err: unknown) {
          display.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      });
  }

  private infoCommand(): void {
    const config = this.configService.load();
    const contractName = getContractName(this.artifact);

    display.header(`${contractName} Configuration`);
    display.keyValue("Network", config.network);
    display.keyValue("Node URL", config.nodeUrl);
    display.keyValue("Contract", config.contractAddress || "(not set)");
    display.divider();

    if (config.contractAddress) {
      display.info(`Run '${this.options.name} call <function>' to call contract functions`);
    } else {
      display.info(`Run '${this.options.name} setup' to configure the contract`);
    }
    display.info("Use --sandbox or --devnet to switch networks");
  }

  private registerCallCommand(): void {
    this.program
      .command("call <function>")
      .description("Call a contract function")
      .option("--view", "Force simulation (view mode)")
      .allowUnknownOption(true)
      .action(async (functionName: string, options: Record<string, unknown>) => {
        try {
          await this.callCommand(functionName, options);
        } catch (err: unknown) {
          display.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      });
  }

  private async callCommand(
    functionName: string,
    options: Record<string, unknown>,
  ): Promise<void> {
    const { wallet, accountAddress } = await this.getWallet();
    const contract = await this.getContract();

    // Find the function in the artifact
    const fn = this.artifact.functions.find((f) => f.name === functionName);
    if (!fn) {
      display.error(
        `Function '${functionName}' not found. Available functions:`,
      );
      for (const f of this.artifact.functions) {
        if (!f.isInternal) {
          display.info(`  - ${f.name}`);
        }
      }
      process.exit(1);
    }

    // Parse arguments from command line options
    const args: unknown[] = [];
    for (const param of fn.parameters) {
      const flagName = param.name.replace(/_/g, "-");
      const value = options[flagName] as string | undefined;

      if (value === undefined) {
        // Prompt for missing argument
        const argValues = await prompts.promptFunctionArgs([
          { name: param.name, type: this.formatType(param.type) },
        ]);
        args.push(
          this.parseArgValue(argValues[param.name], this.formatType(param.type)),
        );
      } else {
        args.push(this.parseArgValue(value, this.formatType(param.type)));
      }
    }

    display.step(`Calling ${functionName}...`);

    // Get the method and call it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const methods = contract.methods as any;
    const method = methods[functionName](...args);

    // Check if this is an unconstrained (view) function
    const isView = options.view === true || String(fn.functionType) === "unconstrained";

    if (isView) {
      const result = await method.simulate({ from: accountAddress });
      display.success("Result:");
      console.log(this.formatResult(result));
    } else {
      const paymentMethod = await (
        await import("../core/wallet.js")
      ).getSponsoredPaymentMethod(wallet);
      const receipt = (await method
        .send({
          from: accountAddress,
          fee: { paymentMethod },
        })
        .wait()) as { status: unknown };

      display.success("Transaction completed!");
      display.keyValue("Status", String(receipt.status));
    }
  }

  // ==================== Helper Methods ====================

  private formatType(type: unknown): string {
    if (typeof type === "string") return type;
    if (typeof type === "object" && type !== null) {
      const t = type as Record<string, unknown>;
      if (t.kind === "struct" && t.path) {
        const path = String(t.path);
        const parts = path.split("::");
        return parts[parts.length - 1];
      }
      if (t.kind === "field") return "Field";
      if (t.kind === "integer") {
        const sign = t.sign === "signed" ? "i" : "u";
        return `${sign}${t.width}`;
      }
      if (t.kind === "boolean") return "bool";
    }
    return "unknown";
  }

  private parseArgValue(value: string, type: string): unknown {
    if (type.includes("Address") || type === "AztecAddress") {
      return AztecAddress.fromString(value);
    }
    if (type === "Field" || type.match(/^[iu]\d+$/)) {
      return BigInt(value);
    }
    if (type === "bool") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return value;
  }

  private formatResult(value: unknown): string {
    if (value === undefined || value === null) {
      return "(no return value)";
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.formatResult(v)).join(", ")}]`;
    }
    if (typeof value === "object") {
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
}

/**
 * Create a new CLI builder.
 */
export function createCLI<TConfig extends BaseConfig>(
  options: CLIOptions<TConfig>,
): CLIBuilder<TConfig> {
  return new CLIBuilder(options);
}
