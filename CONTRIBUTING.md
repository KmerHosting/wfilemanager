# Contributing

> [!NOTE]
> Keep changes small, secure and focused on wFileManager's goal: a simple local Linux file manager.

## Development

```bash
git clone https://github.com/KmerHosting/wfilemanager.git
cd wfilemanager
bun install --frozen-lockfile
bun run dev
```

## Before a pull request

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

> [!WARNING]
> Never commit secrets, production databases or customer files. Keep filesystem protections intact and report vulnerabilities privately through [SECURITY.md](./SECURITY.md).
