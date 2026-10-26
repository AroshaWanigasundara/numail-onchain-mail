# NuMail — On-Chain Email

An end-to-end encrypted email client for the **NuMail** Substrate pallet. Subjects and bodies are encrypted in
the browser; only ciphertext, envelopes and delivery state live on chain.

**Developer:** [Arosha Wanigasundara](https://github.com/AroshaWanigasundara)
**Pallet repository:** [onchain-email](https://github.com/AroshaWanigasundara/onchain-email)

## Features

- Mailboxes with acceptance policies, retention windows and custom folders
- Hybrid RSA/AES encryption on the device; encrypted key backup and import for multiple devices
- Conversation view, delivery and read receipts, retention countdowns
- Archive folders saved as encrypted `.pst` files
- Display names and private contacts instead of wallet addresses
- Configurable WebSocket endpoint (ws:// for development, wss:// for production)

## Stack

TanStack Start (React 19, SSR on Node), Vite, Tailwind CSS 4, shadcn/ui, Polkadot.js.

## Develop

```bash
bun install
bun run dev        # http://localhost:8080
```

## Build and run

```bash
bun run build
node .output/server/index.mjs     # PORT=3001 HOST=127.0.0.1 behind nginx
```

See [`deploy/README.md`](deploy/README.md) for the nginx and systemd setup.

## Author

© Arosha Wanigasundara — [github.com/AroshaWanigasundara/numail-onchain-mail](https://github.com/AroshaWanigasundara/numail-onchain-mail)
