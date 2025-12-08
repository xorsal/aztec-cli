# aztec-cli

A CLI framework for building command-line interfaces for Aztec contracts with minimal configuration.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- Yarn 1.x
- Aztec sandbox running locally (or access to devnet)

### Setup (Monorepo)

```bash
# Clone and enter the directory
cd aztec-cli

# Install dependencies
yarn install

# Build the framework (required before running any CLI)
yarn build
```

This builds both packages:
1. `aztec-cli` - The core framework
2. `secret-santa-cli` - Example CLI using the framework

### Run the Secret Santa CLI

```bash
# From aztec-cli root
cd packages/secret-santa

# Run the CLI
yarn cli --help
```

Or from the monorepo root:
```bash
yarn workspace secret-santa-cli cli --help
```

### Quick Demo

Make sure you have an Aztec sandbox running:
```bash
aztec start --sandbox
```

Then run the demo script which walks through a complete game:
```bash
cd packages/secret-santa
yarn demo
```

---

## Secret Santa CLI Commands

The Secret Santa CLI demonstrates the framework with a privacy-preserving gift exchange game.

### Admin Commands

```bash
# Create a new game
yarn cli --sandbox -p "admin-pass" admin create --min 3 --max 10

# View game status
yarn cli --sandbox -p "admin-pass" admin status --game 0

# Advance to next phase
yarn cli --sandbox -p "admin-pass" admin advance --game 0
```

### Player Commands

```bash
# Enroll in a game (during Enrollment phase)
yarn cli --sandbox -p "player-pass" enroll --game 0

# Register as sender / claim a slot (during Sender Registration phase)
yarn cli --sandbox -p "player-pass" register --game 0 --slot 1

# Claim as receiver (during Receiver Claim phase)
yarn cli --sandbox -p "player-pass" claim --game 0 --slot 2

# View delivery data (after game completion)
yarn cli --sandbox -p "player-pass" delivery --game 0 --slot 1

# Check game status
yarn cli --sandbox -p "player-pass" status --game 0
```

### Watch Events

```bash
# Watch game events in real-time
yarn cli --sandbox -p "player-pass" watch --game 0
```

### Game Flow

```
1. ENROLLMENT        → Players enroll in the game
2. SENDER_REGISTRATION → Players claim slots and publish encryption keys
3. RECEIVER_CLAIM    → Players claim slots and submit encrypted delivery addresses
4. COMPLETED         → Senders decrypt delivery addresses and ship gifts
```

---

## Building Your Own CLI

### 1. Create a new CLI project

```bash
mkdir my-contract-cli && cd my-contract-cli
yarn init -y
yarn add aztec-cli
yarn add -D typescript tsx @types/node
```

### 2. Copy your contract artifact

**Important:** The artifact must be post-processed before use:

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

## Built-in Commands

Every CLI built with aztec-cli gets these commands for free:

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

---

## Adding Custom Commands

Extend your CLI with domain-specific commands:

```typescript
import { createCLI, display, getSponsoredPaymentMethod, type BaseConfig } from 'aztec-cli';
import artifact from './artifacts/MyContract.json' with { type: 'json' };

// Extend base config with contract-specific fields
interface MyConfig extends BaseConfig {
  tokenAddress?: string;
}

const cli = createCLI<MyConfig>({
  name: 'my-cli',
  version: '1.0.0',
  description: 'My Aztec CLI',
  configFileName: '.my-cli.json',
  artifact,
});

// Add custom command
cli.command('my-action')
   .description('Do something custom')
   .option('--amount <n>', 'Amount to use', parseInt)
   .action(async (options) => {
     const { wallet, accountAddress } = await cli.getWallet();
     const contract = await cli.getContract();
     const config = cli.getConfig();

     display.step('Executing custom action...');

     const paymentMethod = await getSponsoredPaymentMethod(wallet);
     await (contract.methods as any)
       .my_function(options.amount)
       .send({
         from: accountAddress,
         fee: { paymentMethod },
       })
       .wait();

     display.success('Action completed!');
   });

cli.run();
```

---

## API Reference

### `createCLI(options)`

Creates a new CLI builder.

```typescript
interface CLIOptions<TConfig extends BaseConfig> {
  name: string;           // CLI name (used in help)
  version: string;        // CLI version
  description: string;    // CLI description
  configFileName: string; // Config file name (e.g., '.my-cli.json')
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

// Get config service for updates
cli.getConfigService(): ConfigService<TConfig>

// Register a custom command
cli.command(name: string): Command

// Run the CLI
cli.run(): void
```

### Core Utilities

```typescript
import {
  // Display utilities
  display,  // { success, error, info, warning, step, header, keyValue, divider }

  // Prompt utilities
  prompts,  // { promptPassphrase, promptAddress, promptConfirm, promptString, promptNumber }

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

---

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
| Business logic | Game phases, state machines |
| Authorization | Authwit for token transfers |
| Related contracts | Token integration |
| Key derivation | Encryption keys |
| Display format | Pretty-printing contract state |

---

## Project Structure

```
aztec-cli/
├── packages/
│   ├── cli-framework/     # Core framework (aztec-cli package)
│   │   └── src/
│   │       ├── cli/       # CLI builder
│   │       ├── core/      # Config, network, wallet, display, prompts
│   │       └── contract/  # Artifact loading, deploy/connect
│   │
│   └── secret-santa/      # Example CLI (secret-santa-cli package)
│       └── src/
│           ├── commands/  # Admin, player, watch commands
│           ├── services/  # Game logic, crypto, events
│           └── artifacts/ # Contract artifact
│
├── package.json           # Monorepo root
└── README.md
```

## Troubleshooting

### "Cannot find module 'aztec-cli'"

The framework hasn't been built. Run from the monorepo root:
```bash
yarn build
```

### "Contract's public bytecode has not been transpiled"

Your contract artifact needs post-processing:
```bash
# In your contract project
aztec-postprocess-contract
```

### Connection errors

Make sure the Aztec sandbox is running:
```bash
aztec start --sandbox
```

---

## License

MIT
