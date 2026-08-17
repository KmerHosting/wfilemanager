# Contributing

Keep changes small, secure and focused on wFileManager's goal: a simple single-admin Linux file manager.

## Development

Requirements: Node.js 24+, Bun and Linux.

```bash
git clone https://github.com/KmerHosting/wfilemanager.git
cd wfilemanager
bun install --frozen-lockfile
bun run dev
```

Before opening a pull request:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

Rules:

- Never commit secrets, production databases or customer files.
- Validate filesystem paths and user-controlled input on the server.
- Preserve protections around `/proc`, `/sys`, `/dev` and `/run`.
- Keep persistent data outside versioned releases.
- Avoid adding features, dependencies or services that complicate the core product without a clear need.
- Update tests and documentation when behavior changes.

Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

Contributions are provided under the MIT License.
