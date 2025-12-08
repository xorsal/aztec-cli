# aztec-cli

A CLI framework for building command-line interfaces for Aztec contracts with minimal configuration.

## Quickstart

### 1. Create a new CLI project

```bash
mkdir my-contract-cli && cd my-contract-cli
yarn init -y
yarn add aztec-cli
yarn add -D typescript tsx @types/node
```

### 2. Copy your contract artifact

**Important:** The artifact must be post-processed before use. Run `aztec-postprocess-contract` in your contract project first:

```bash
# In your contract project directory
aztec-postprocess-contract

# Then copy the processed artifact
mkdir -p src/artifacts
cp /path/to/target/my_contract-MyContract.json src/artifacts/MyContract.json
```

If you skip post-processing, you'll get: `Error: Contract's public bytecode has not been transpiled`

### 3. Create the CLI entry point

```typescript
// src/index.ts
import { createCLI } from 'aztec-cli';
import artifact from './artifacts/MyContract.json' with { type: 'json' };

const cli = createCLI({
  name: 'my-cli',
  version: '1.0.0',
  description: 'CLI for MyContract',
  configFileName: '.my-contract.json',
  artifact,
});

cli.run();
```

### 4. Add scripts to package.json

```json
{
  "type": "module",
  "scripts": {
    "cli": "tsx src/index.ts"
  }
}
```

### 5. Run your CLI

```bash
# Start the Aztec sandbox first
aztec start --sandbox

# Deploy or connect to your contract
yarn cli --sandbox -p "my-passphrase" setup

# View configuration
yarn cli info

# Call any contract function
yarn cli call get_state --view
yarn cli call my_function --arg1 value1 --arg2 value2
```

---

## Overview

Building a CLI for an Aztec contract typically requires a lot of boilerplate:
- Wallet creation from passphrases
- Network configuration (sandbox/devnet)
- Sponsored fee payment setup
- Contract deployment and connection
- Configuration persistence

**aztec-cli** provides all of this out of the box. You just provide your contract artifact, and you get a working CLI with built-in commands. Add custom commands for your contract-specific logic.

## Installation

```bash
yarn add aztec-cli
# or
npm install aztec-cli
```

## Quick Start

### Minimal CLI (Just Artifact)

```typescript
import { createCLI } from 'aztec-cli';
import artifact from './artifacts/MyContract.json' with { type: 'json' };

const cli = createCLI({
  name: 'my-contract',
  version: '1.0.0',
  description: 'CLI for MyContract',
  configFileName: '.my-contract.json',
  artifact,
});

cli.run();
```

This gives you these commands for free:

```bash
# Deploy or connect to a contract
my-contract setup

# Show configuration
my-contract info

# Call any contract function with named flags
my-contract call get_state --view
my-contract call buy_ticket --ticket-id 5 --token 0x123... --price 1000
```

### Extended CLI (With Custom Commands)

```typescript
import { createCLI, display, getSponsoredPaymentMethod } from 'aztec-cli';
import artifact from './artifacts/Raffle.json' with { type: 'json' };

// Extend base config with contract-specific fields
interface RaffleConfig extends BaseConfig {
  tokenAddress?: string;
  ticketPrice?: string;
}

const cli = createCLI<RaffleConfig>({
  name: 'raffle',
  version: '1.0.0',
  description: 'Aztec Raffle CLI',
  configFileName: '.raffle.json',
  artifact,
});

// Add custom command with domain-specific logic
cli.command('buy <ticket-id>')
   .description('Buy a raffle ticket')
   .action(async (ticketId) => {
     const { wallet, accountAddress } = await cli.getWallet();
     const contract = await cli.getContract();
     const config = cli.getConfig();

     // Custom authwit logic for token transfer
     const paymentMethod = await getSponsoredPaymentMethod(wallet);
     // ... your custom logic here

     display.success(`Ticket #${ticketId} purchased!`);
   });

cli.run();
```

## Built-in Commands

### `setup`

Deploy a new contract or connect to an existing one.

```bash
my-cli setup
# Prompts for: Deploy new / Connect to existing
# If deploying: prompts for constructor arguments (derived from ABI)
# Saves contract address to config file
```

### `info`

Show current configuration.

```bash
my-cli info
# Shows: network, node URL, contract address
```

### `call <function>`

Call any contract function by name. Arguments are passed as named flags.

```bash
# View functions (simulated, no transaction)
my-cli call get_state --view

# Mutating functions (sends transaction)
my-cli call transfer --recipient 0x123... --amount 1000

# Flags are derived from ABI parameter names (snake_case → kebab-case)
# ticket_price → --ticket-price
```

## Global Options

```bash
--sandbox       # Connect to local sandbox (localhost:8080)
--devnet        # Connect to Aztec devnet
-p, --passphrase <pass>  # Provide passphrase non-interactively
```

## API Reference

### `createCLI(options)`

Creates a new CLI builder.

```typescript
interface CLIOptions<TConfig extends BaseConfig> {
  name: string;           // CLI name (used in help)
  version: string;        // CLI version
  description: string;    // CLI description
  configFileName: string; // Config file name (e.g., '.raffle.json')
  artifact: unknown;      // Contract artifact JSON
  defaultConfig?: Partial<TConfig>;  // Default config values
}
```

### `CLIBuilder` Methods

```typescript
// Get the Commander program for custom command registration
cli.getProgram(): Command

// Get wallet context (prompts for passphrase if needed)
cli.getWallet(): Promise<WalletContext>

// Get connected contract instance
cli.getContract(): Promise<ContractBase>

// Get current config
cli.getConfig(): TConfig

// Register a custom command
cli.command(name: string): Command

// Run the CLI
cli.run(): void
```

### Core Utilities

```typescript
import {
  // Display utilities
  display,  // { success, error, info, step, header, keyValue, ... }

  // Prompt utilities
  prompts,  // { promptPassphrase, promptAddress, promptConfirm, ... }

  // Wallet utilities
  getSponsoredPaymentMethod,
  getOrDeployWallet,
  passphraseToSecretKey,

  // Contract utilities
  deployContract,
  connectToContract,

  // Config utilities
  createConfigService,

  // Network constants
  NETWORKS,  // { sandbox: '...', devnet: '...' }
} from 'aztec-cli';
```

## What's Generic vs. Contract-Specific

### Generic (Provided by Framework)

| Component | Description |
|-----------|-------------|
| Wallet | Passphrase → deterministic Schnorr account |
| Fees | Sponsored fee payment via SponsoredFPC |
| Network | Sandbox/devnet selection and URLs |
| Config | JSON persistence with local/global fallback |
| Setup | Deploy or connect to contract |
| Call | Generic function caller with named flags |

### Contract-Specific (You Implement)

| Component | Example |
|-----------|---------|
| Business logic | Escrow salt = Logic address |
| State machines | Phase names and transitions |
| Authorization | Authwit for token transfers |
| Related contracts | Token, Dripper integration |
| Key derivation | Master keys for escrow |
| Display format | Pretty-printing contract state |

## End-to-End Example: Using Generic Commands

This example shows a complete flow using only the built-in commands (no custom commands needed).

### Prerequisites

```bash
# Start Aztec sandbox
aztec start --sandbox
```

### Step 1: Setup Your CLI

```bash
# Create minimal CLI (see Quickstart above)
# Or use any contract artifact
```

### Step 2: Deploy Contract

```bash
yarn cli --sandbox -p "my-pass" setup

# Output:
# → Connecting to sandbox (http://localhost:8080)...
# ✓ Connected to sandbox
# → Initializing wallet...
# ✓ Account deployed!
#   Account: 0x1234...abcd (newly deployed)
#
# ═══ MyContract Setup ═══
#
# ? What would you like to do? Deploy a new MyContract
# ? Enter owner (AztecAddress): 0x1234...
# ? Enter initial_value (Field): 100
# → Deploying new MyContract contract...
# ✓ Contract deployed and saved to config!
#   Contract: 0x5678...efgh (newly deployed)
```

### Step 3: View Configuration

```bash
yarn cli info

# Output:
# ═══ MyContract Configuration ═══
#   Network: sandbox
#   Node URL: http://localhost:8080
#   Contract: 0x5678...efgh
# ────────────────────────────────────────
# ℹ Run 'my-cli call <function>' to call contract functions
```

### Step 4: Call View Functions

```bash
# Call any unconstrained function (simulated, no transaction)
yarn cli --sandbox -p "my-pass" call get_value --view

# Output:
# → Connecting to sandbox...
# → Initializing wallet...
# → Connecting to contract...
# → Calling get_value...
# ✓ Result:
# 100
```

### Step 5: Call Mutating Functions

```bash
# Call private/public functions (sends transaction)
yarn cli --sandbox -p "my-pass" call set_value --new-value 200

# Output:
# → Calling set_value...
# ✓ Transaction completed!
#   Status: success

# Verify the change
yarn cli --sandbox -p "my-pass" call get_value --view
# Result: 200
```

### Step 6: Complex Function Calls

```bash
# Functions with multiple parameters
yarn cli --sandbox -p "my-pass" call transfer \
  --from 0x1234... \
  --to 0x5678... \
  --amount 1000

# If you omit a parameter, you'll be prompted:
yarn cli --sandbox -p "my-pass" call transfer
# ? Enter from (AztecAddress): 0x1234...
# ? Enter to (AztecAddress): 0x5678...
# ? Enter amount (Field): 1000
```

### Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│              GENERIC CLI WORKFLOW                           │
├─────────────────────────────────────────────────────────────┤
│  1. yarn cli setup                                          │
│     └── Deploy contract or connect to existing              │
│                                                             │
│  2. yarn cli info                                           │
│     └── View saved configuration                            │
│                                                             │
│  3. yarn cli call <function> --view                         │
│     └── Read contract state (unconstrained functions)       │
│                                                             │
│  4. yarn cli call <function> --arg1 val1 --arg2 val2        │
│     └── Modify contract state (private/public functions)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Example: Raffle CLI

See `examples/raffle-cli/` for a complete example with custom commands.

### Structure

```
examples/raffle-cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── artifacts/
│   │   └── Raffle.json    # Contract artifact
│   └── commands/
│       ├── admin.ts       # close, pick-winner
│       └── player.ts      # buy, claim, balance, status
├── package.json
└── tsconfig.json
```

### Entry Point (`index.ts`)

```typescript
import { createCLI, type BaseConfig } from 'aztec-cli';
import RaffleArtifact from './artifacts/Raffle.json' with { type: 'json' };
import { registerAdminCommands } from './commands/admin.js';
import { registerPlayerCommands } from './commands/player.js';

interface RaffleConfig extends BaseConfig {
  tokenAddress?: string;
  ticketPrice?: string;
  maxTickets?: number;
}

const cli = createCLI<RaffleConfig>({
  name: 'raffle',
  version: '1.0.0',
  description: 'Aztec Raffle CLI',
  configFileName: '.raffle.json',
  artifact: RaffleArtifact,
});

// Register custom commands
registerAdminCommands(cli);
registerPlayerCommands(cli);

cli.run();
```

### Custom Command (`commands/player.ts`)

```typescript
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { TokenContract } from '@defi-wonderland/aztec-standards/artifacts/Token.js';
import { type CLIBuilder, display, getSponsoredPaymentMethod } from 'aztec-cli';

export function registerPlayerCommands(cli: CLIBuilder<RaffleConfig>): void {
  const program = cli.getProgram();

  program
    .command('buy <ticket-id>')
    .description('Buy a raffle ticket')
    .action(async (ticketIdStr: string) => {
      const ticketId = parseInt(ticketIdStr, 10);
      const { wallet, accountAddress, node } = await cli.getWallet();
      const contract = await cli.getContract();
      const config = cli.getConfig();

      // Get token contract for authwit
      const tokenContract = await TokenContract.at(
        AztecAddress.fromString(config.tokenAddress!),
        wallet,
      );

      // Create authwit for token transfer
      const nonce = Fr.random();
      const transferCall = tokenContract.methods.transfer_private_to_public(
        accountAddress,
        contract.address,
        BigInt(config.ticketPrice!),
        nonce,
      );
      const authwit = await wallet.createAuthWit(accountAddress, {
        caller: contract.address,
        action: transferCall,
      });

      // Buy ticket with authwit
      const paymentMethod = await getSponsoredPaymentMethod(wallet);
      await (contract.methods as any)
        .buy_ticket(ticketId, tokenAddress, ticketPrice, nonce)
        .send({
          from: accountAddress,
          fee: { paymentMethod },
          authWitnesses: [authwit],
        })
        .wait();

      display.success(`Ticket #${ticketId} purchased!`);
    });
}
```

### Running the Example

```bash
cd examples/raffle-cli
yarn install
yarn cli --help

# With sandbox
yarn cli --sandbox -p "my-passphrase" setup
yarn cli status
yarn cli buy 1
```

## Dependencies

- `@aztec/aztec.js`: 3.0.0-devnet.5
- `@aztec/test-wallet`: 3.0.0-devnet.5
- `commander`: ^12.1.0
- `@inquirer/prompts`: ^7.0.0
- `chalk`: ^5.3.0

## License

MIT
