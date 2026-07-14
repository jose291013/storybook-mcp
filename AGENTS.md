# Storybook MCP working agreement

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

