# Make NuMail blockchain-authoritative

## Goal
When a real wallet is connected to a node with the NuMail pallet, mailbox contents and delivery actions must come only from blockchain storage. Local simulation remains available only for the explicit demo account or when no compatible pallet is connected.

## Changes
- Add blockchain readers that decode mailbox folders, mailbox indexes, mail items, delivery states, and folder assignments using the runtime's exact storage key order and types.
- On wallet connection, replace that account's cached mail and delivery rows with the current on-chain records; show an empty mailbox when the chain has none.
- Refresh blockchain mail after mailbox creation, sending, marking read, moving, and deleting so the interface reflects confirmed chain state.
- Make `markRead` and `moveToFolder` submit genuine extrinsics whenever blockchain mode is active; never silently fall back to local updates if chain validation or submission fails.
- Resolve the selected folder against the mailbox's stored folder bytes before moving, then pass the exact stored bytes value (for example, inbox as `0x696e626f78`) to the pallet.
- Keep mailbox creation deterministic: submit `inbox`, `sent`, and `archive` plus unique custom folders in every create-mailbox extrinsic.

## Validation
- Typecheck the changed files.
- Query the live development node to confirm storage decoding and exact folder bytes.
- Exercise Alice/Bob mailbox loading and verify that displayed mail matches blockchain storage only.
