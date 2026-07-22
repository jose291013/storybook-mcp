# Storybook MCP working agreement

## Project memory

- Read `docs/current-status.md` at the start of every task to recover the current Git checkpoint, active component versions, known operational constraints, and the next verification target.
- Keep `docs/current-status.md` concise and operational. Update it when a product brick is completed, deployed, or handed to another task.
- Update `docs/product-roadmap.md` when product behavior, architecture, commerce rules, environment variables, or delivery phases change.
- When the two documents differ, treat `docs/product-roadmap.md` as the product-direction authority and verify the live deployment before changing the checkpoint recorded in `docs/current-status.md`.

## Durable product direction

- Read `docs/product-roadmap.md` before changing persistence, accounts, commerce, credits, delivery, or series behavior.
- WooCommerce owns customer accounts, checkout, payments, orders, subscriptions, and transactional commerce.
- This Node application owns book projects, generation state, private assets, child profiles, characters, and series continuity.
- Anonymous visitors may complete the questionnaire and add photos. Authentication is required only when requesting an AI preview.
- Preview authorization uses either one reserved credit or one single-use access code. Technical failures must release the reservation or allow an idempotent retry.
- Never make a rejected preview part of series canon. Series memory changes only after explicit customer validation or purchase.

## Safety and verification

- Never commit `data/jobs.json`, generated books, uploaded photos, secrets, or customer data.
- Treat child photos and generated books as private assets; production delivery must use authenticated or signed access.
- Keep local JSON storage as a development fallback only. Production persistence uses PostgreSQL and private object storage.
- Run `npm test` before publishing a pull request.
- Keep one product brick per branch and document any new environment variables in `.env.example` and the roadmap.
- Never merge a pull request or trigger a production deployment without the user's explicit confirmation. Before requesting confirmation, warn that Render may restart and interrupt any preview currently generating.

