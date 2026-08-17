import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Document, Folder, Renew, TrashCan } from "@carbon/icons-react";
import {
  Button,
  InlineLoading,
  Modal,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { formatBytes, formatRelative } from "@/lib/format";
import { localApi, type TrashItem } from "@/lib/local-api";
import { useNotifications } from "@/lib/notifications";

export const Route = createFileRoute("/_app/trash")({
  head: () => ({ meta: [{ title: "Trash — wFileManager" }] }),
  component: Trash,
});

function Trash() {
  const { notify } = useNotifications();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<TrashItem | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await localApi.trash.list();
      setItems(result.items);
      setTotalSize(result.totalSize);
    } catch (cause) {
      notify({
        kind: "error",
        title: "Unable to load trash",
        subtitle: cause instanceof Error ? cause.message : "The trash index could not be read.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.originalPath.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const restore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await localApi.trash.restore(item.id);
      notify({ kind: "success", title: "Item restored", subtitle: item.originalPath });
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Restore failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to restore this item.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDelete = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await localApi.trash.delete(item.id);
      notify({ kind: "success", title: "Permanently deleted", subtitle: item.name });
      setDeleteItem(null);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Permanent deletion failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to delete this item.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const emptyTrash = async () => {
    setBusyId("__all__");
    try {
      const result = await localApi.trash.empty();
      notify({
        kind: "success",
        title: "Trash emptied",
        subtitle: `${result.deletedItems} item(s) permanently deleted.`,
      });
      setEmptyOpen(false);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Unable to empty trash",
        subtitle: cause instanceof Error ? cause.message : "The operation did not complete.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="wfm-page" aria-labelledby="trash-title">
      <header className="wfm-page__header">
        <div>
          <h1 id="trash-title" className="wfm-page__heading">
            Trash
          </h1>
          <p className="wfm-page__description">
            {items.length} item(s), {formatBytes(totalSize)}. Restore items or delete them permanently.
          </p>
        </div>
        <div className="wfm-page__actions">
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            onClick={() => void load()}
            disabled={loading || Boolean(busyId)}
          >
            Refresh
          </Button>
          <Button
            kind="danger"
            size="sm"
            renderIcon={TrashCan}
            disabled={!items.length || Boolean(busyId)}
            onClick={() => setEmptyOpen(true)}
          >
            Empty trash
          </Button>
        </div>
      </header>

      <div className="wfm-explorer-toolbar">
        <Search
          id="trash-search"
          labelText="Search trash"
          placeholder="Search by name or original path"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="wfm-table-wrap">
        <TableContainer title="Deleted items" description={`${filtered.length} visible item(s)`}>
          <Table size="lg">
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Original path</TableHeader>
                <TableHeader>Size</TableHeader>
                <TableHeader>Deleted</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <InlineLoading description="Loading trash…" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    {items.length ? "No matching items." : "Trash is empty."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => {
                  const busy = busyId === item.id;
                  const Icon = item.kind === "directory" ? Folder : Document;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="wfm-button-row">
                          <Icon size={16} />
                          <span>{item.name}</span>
                          <Tag type="cool-gray" size="sm">
                            {item.kind === "directory" ? "Folder" : "File"}
                          </Tag>
                        </div>
                      </TableCell>
                      <TableCell className="wfm-mono">{item.originalPath}</TableCell>
                      <TableCell>{formatBytes(item.size)}</TableCell>
                      <TableCell>{formatRelative(item.deletedAt)}</TableCell>
                      <TableCell>
                        <div className="wfm-table-actions">
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Renew}
                            disabled={busy || Boolean(busyId && !busy)}
                            onClick={() => void restore(item)}
                          >
                            {busy ? "Restoring…" : "Restore"}
                          </Button>
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            disabled={Boolean(busyId)}
                            onClick={() => setDeleteItem(item)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <Modal
        open={Boolean(deleteItem)}
        danger
        size="sm"
        modalHeading="Permanently delete this item?"
        modalLabel={deleteItem?.name}
        primaryButtonText="Permanently delete"
        secondaryButtonText="Cancel"
        primaryButtonDisabled={!deleteItem || Boolean(busyId)}
        onRequestClose={() => setDeleteItem(null)}
        onRequestSubmit={() => deleteItem && void permanentlyDelete(deleteItem)}
      >
        This action cannot be undone. The item will no longer be recoverable from wFileManager.
      </Modal>

      <Modal
        open={emptyOpen}
        danger
        size="sm"
        modalHeading="Empty the entire trash?"
        primaryButtonText="Permanently delete all"
        secondaryButtonText="Cancel"
        primaryButtonDisabled={Boolean(busyId)}
        onRequestClose={() => setEmptyOpen(false)}
        onRequestSubmit={() => void emptyTrash()}
      >
        {items.length} item(s), totaling {formatBytes(totalSize)}, will be permanently removed. This
        action cannot be undone.
      </Modal>
    </section>
  );
}
