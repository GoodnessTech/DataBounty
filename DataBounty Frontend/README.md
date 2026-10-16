# DataBounty

DataBounty is a premium React/Vite frontend for a data marketplace where providers publish datasets, APIs, and live feeds and buyers review transparent access terms.

## Routes

- `/` — landing page and product discovery
- `/marketplace` — searchable, filterable product catalog
- `/marketplace/:id` — product details, schema, pricing, and access review
- `/provider` — provider workspace
- `/buyer` — buyer workspace
- `/publish` — four-step listing wizard
- `/activity` — activity history empty state
- `/analytics` — usage and performance empty state

## Architecture

The current frontend uses typed in-memory development fixtures so the UI can be reviewed without pretending that marketplace activity, payments, balances, or transaction confirmations are real. Shared marketplace cards, pricing terms, route navigation, dashboard panels, form steps, wallet dialog, and feedback messages are kept in one cohesive app shell.

## Integration points

- Wallet connection is an explicit boundary and does not fake an address or transaction.
- Purchase, request access, and publish actions surface ready-for-integration feedback only.
- Replace the product fixture collection with a Supabase-backed catalog and connect the publish action to a server-enforced listing flow.
- Add the BOT Chain wallet adapter and contract configuration only after validating authoritative chain documentation. Keep contract calls separate from visual components.

## Environment

No private credentials or contract addresses are included. Add only public, non-sensitive runtime configuration for the eventual wallet and backend adapters.
