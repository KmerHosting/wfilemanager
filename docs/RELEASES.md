# wFileManager release procedure

wFileManager production servers install prebuilt releases. They never run `bun install`, TypeScript,
Vite or a local application build.

## Release pipeline

1. CI validates the source on `main`.
2. GitHub Actions installs development dependencies and builds the production `.output` directory.
3. The workflow packages `.output`, `package.json` and the deployment scripts into
   `wfilemanager-VERSION.tar.gz`.
4. SHA-256 and archive size are published with the GitHub release.
5. The stable release channel is synchronized only after the GitHub release exists.
6. Production clients download those exact prebuilt bytes.

## Client update

```bash
sudo systemctl start wfilemanager-updater@install.service
sudo journalctl -u wfilemanager-updater@install.service -f
```

The updater performs only:

```text
download → verify → extract → atomic switch → restart → health check
```

A failed health check restores the previous release automatically.

## Rollback

```bash
sudo systemctl start wfilemanager-updater@rollback.service
```

Two releases are retained locally by default: current and previous.
