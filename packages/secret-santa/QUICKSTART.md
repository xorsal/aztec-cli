# ZK Secret Santa - Quickstart Guide

A privacy-preserving Secret Santa game built on Aztec. Players can participate in gift exchanges without anyone knowing who sends gifts to whom.

## Prerequisites

**For Sandbox (local development):**
```bash
aztec start --sandbox
```

**For Devnet:**
No prerequisites - uses sponsored fees.

## Installation

```bash
cd aztec-cli/examples/secret-santa
yarn install
```

## Quick Demo

Run the automated demo that executes a complete 3-player game:

```bash
# Local sandbox
yarn demo

# Devnet
yarn demo --devnet
```

## Manual CLI Flow

### 1. Setup (Deploy Contract)

Deploy a new contract or connect to an existing one:

```bash
# Deploy on sandbox
yarn cli --sandbox -p "hola" setup

# Deploy on devnet
yarn cli --devnet -p "admin" setup
```

**Note:** When deploying, you'll be prompted for an `admin` address. Enter the wallet address of the account that will manage games (typically your own address, shown after wallet initialization).

### 2. Create a Game (Admin)

Create a new game with participant limits:

```bash
yarn cli -p "hola" admin create --min 3 --max 3
```

This creates Game #1 and saves it as the current game.

### 3. Players Enroll

Each player enrolls using their passphrase:

```bash
yarn cli -p "alice" enroll --game 1 && \
yarn cli -p "bob" enroll --game 1 && \
yarn cli -p "carl" enroll --game 1
```

### 4. Advance to Sender Registration (Admin)

Once enough players have enrolled:

```bash
yarn cli -p "admin" admin advance --game 1
```

### 5. Players Register Slots

Each player claims a slot and publishes their encryption key:

```bash
yarn cli -p "hola1" register --game 1 --slot 1 && \
yarn cli -p "hola2" register --game 1 --slot 2 && \
yarn cli -p "hola3" register --game 1 --slot 3
```

### 6. Advance to Receiver Claim (Admin)

```bash
yarn cli -p "hola" admin advance --game 1
```

### 7. Players Claim as Receivers

Each player selects a slot to receive from (cannot be their own slot):

```bash
# Alice claims slot 2 (Bob's slot) - Alice will receive from Bob
yarn cli -p "alice" claim --game 1 --slot 2
# You'll be prompted for your delivery address

# Bob claims slot 3 (Carol's slot) - Bob will receive from Carol
yarn cli -p "bob" claim --game 1 --slot 3

# Carol claims slot 1 (Alice's slot) - Carol will receive from Alice
yarn cli -p "carol" claim --game 1 --slot 1
```

The contract cryptographically verifies you're not claiming your own slot.

### 8. Complete the Game (Admin)

```bash
yarn cli -p "hola" admin advance --game 1
```

### 9. Senders View Delivery Data

Each sender retrieves and decrypts their recipient's address:

```bash
yarn cli -p "hola1" delivery --game 1 --slot 1
# Alice sees Carol's delivery address

yarn cli -p "hola2" delivery --game 1 --slot 2
# Bob sees Alice's delivery address

yarn cli -p "hola3" delivery --game 1 --slot 3
# Carol sees Bob's delivery address
```

```
yarn cli -p "hola1" delivery --game 1 --slot 1 && \
yarn cli -p "hola2" delivery --game 1 --slot 2 && \
yarn cli -p "hola3" delivery --game 1 --slot 3



```

## Game Status Commands

View game status at any time:

```bash
# Player view
yarn cli -p "alice" status --game 1

# Admin detailed view
yarn cli -p "admin" admin status --game 1

# Current configuration
yarn cli -p "admin" info
```

## Protocol Overview

1. **Enrollment**: Players join the game privately
2. **Sender Registration**: Players claim unique slots and publish encryption keys
3. **Receiver Claim**: Players select who sends them gifts (with encrypted delivery address)
4. **Completed**: Senders decrypt delivery addresses and ship gifts

### Privacy Guarantees

- **Who owns which slot**: Private (known only to owner)
- **Who sends to whom**: Private (protected by nullifiers)
- **Delivery addresses**: Private (encrypted with recipient's key)

### Security

- The contract uses `check_nullifier_exists` to cryptographically prevent self-selection
- Only the sender can decrypt delivery data for their slot
- ECIES encryption (Grumpkin ECDH + AES-128-CBC)

## CLI Options

```
Global Options:
  --sandbox           Connect to local sandbox (default)
  --devnet            Connect to devnet
  -p, --passphrase    Passphrase for wallet (deterministic account)

Commands:
  setup               Deploy or connect to contract
  info                Show current configuration
  status              View game status
  enroll              Enroll in a game
  register            Register as sender (claim slot)
  claim               Claim as receiver (select gift sender)
  delivery            View delivery data for your slot

Admin Commands:
  admin create        Create a new game
  admin advance       Advance game phase
  admin status        View detailed game status
```

## Framework Benefits

This example demonstrates the `aztec-cli` framework which provides:

- Built-in wallet management (passphrase-based deterministic accounts)
- `setup`, `info` commands out of the box
- Configuration persistence
- Display utilities
- Network switching
- Sponsored fee handling

Custom code is only needed for game-specific logic (ECIES encryption, phase validation).


```
yarn cli --sandbox -p "admin" setup

yarn cli -p "hola" admin create --min 3 --max 3

GAME=2

yarn cli -p "alice" enroll --game $GAME && \
yarn cli -p "bob" enroll --game $GAME && \
yarn cli -p "carl" enroll --game $GAME

yarn cli -p "hola" admin advance --game 1


yarn cli -p "alice" register --game $GAME --slot 1 && \
yarn cli -p "bob" register --game $GAME --slot 2 && \
yarn cli -p "carl" register --game $GAME --slot 3
```