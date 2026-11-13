# API descriptions for AI agents and tools (AGT)

For someone asking an AI agent to write an integration, and for the tools it uses. OpenAPI stays the source for tools, as it's too large for an agent to read whole. An MCP server, for an AI using a person's data directly, isn't part of this.

- **AGT-1** **Pages an agent can fetch as it needs them.** `pnpm generate` splits the API reference into small Markdown pages: an overview, the data model, and one for each API group with the types it uses, without requirement IDs.
  - `llms.txt` lists them, separating what API keys can use from what they can't.
  - The docs site publishes them at `lawfive.dev/llms.txt` and `lawfive.dev/agents/`.
  - A test checks their links and that no group's page outgrows a single fetch (50,000 characters).
- **AGT-2** **Worked examples**, in [schema/guides/](../../schema/guides/): reading matches with their venues and officials, keeping a copy up to date, saving without overwriting someone else's change, and checking webhooks. They're published with the pages, and as a page for people on the docs site. The server's tests run their code as written, on an API key with only the access each one says it needs.
- **AGT-3** **Each server describes itself.** `GET /v1/openapi.json`, with no sign-in, is the API as OpenAPI 3.1 for that server's version and address, compressed for clients that accept it, and open to pages on other sites. `openApiUrl` in `GET /v1/meta` gives its address. It's limited to 60 requests a minute by address (SEC-2).

## Status

Everything above is built, and the examples run against the server.

Not built yet: a trial by a real agent starting from `llms.txt`.
