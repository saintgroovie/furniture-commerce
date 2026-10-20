import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  DeskError,
  audit,
  entity,
  identifier,
  operation,
  requireEntity,
  type Sql,
} from "./commands";

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export function decodeAttachment(raw: unknown) {
  const c = raw as Record<string, any>;
  const id = identifier(c?.id),
    type = entity(c?.entityType),
    entityId = identifier(c?.entityId);
  if (
    typeof c.filename !== "string" ||
    !c.filename.trim() ||
    c.filename.length > 200 ||
    /[\x00-\x1f\x7f/\\]/.test(c.filename)
  )
    throw new DeskError(400, "INVALID_FILENAME", "Проверьте название файла");
  if (
    typeof c.content !== "string" ||
    c.content.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 ||
    c.content.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(c.content)
  )
    throw new DeskError(
      413,
      "FILE_TOO_LARGE",
      "Файл должен быть не больше 8 МБ",
    );
  const bytes = Buffer.from(c.content, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_ATTACHMENT_BYTES ||
    bytes.toString("base64") !== c.content
  )
    throw new DeskError(
      413,
      "FILE_TOO_LARGE",
      "Выберите непустой файл не больше 8 МБ",
    );
  // All documents download as attachments. Never trust a browser-provided MIME for inline rendering.
  return {
    id,
    type,
    entityId,
    filename: c.filename.trim(),
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mime: "application/octet-stream",
    key: c.key,
  };
}
export class PrivateFileStore {
  constructor(private root: string) {}
  async directory() {
    if (
      !this.root ||
      !path.isAbsolute(this.root) ||
      this.root !== path.resolve(this.root) ||
      this.root === process.cwd() ||
      this.root.startsWith(`${process.cwd()}${path.sep}`) ||
      this.root === path.parse(this.root).root
    )
      throw new DeskError(
        503,
        "PRIVATE_STORAGE_REQUIRED",
        "Приватное хранилище не настроено",
      );
    const stat = await lstat(this.root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      (await realpath(this.root)) !== this.root
    )
      throw new DeskError(
        503,
        "UNSAFE_STORAGE",
        "Проверьте права приватного хранилища",
      );
    return this.root;
  }
  async put(key: string, bytes: Buffer) {
    const target = path.join(await this.directory(), identifier(key));
    let file;
    try {
      file = await open(
        target,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      await file.writeFile(bytes);
      await file.sync();
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      const existing = await this.get(key);
      if (!existing.equals(bytes))
        throw new DeskError(
          409,
          "FILE_ID_REUSED",
          "Файл с таким идентификатором уже существует",
        );
    } finally {
      await file?.close();
    }
  }
  async get(key: string) {
    const target = path.join(await this.directory(), identifier(key));
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_ATTACHMENT_BYTES)
        throw new DeskError(503, "INVALID_BLOB", "Файл недоступен");
      return await file.readFile();
    } finally {
      await file.close();
    }
  }
}
export async function attachFile(
  sql: Sql,
  actor: string,
  raw: unknown,
  store: PrivateFileStore,
) {
  const f = decodeAttachment(raw);
  // Immutable generated key, never a user filename. A failed SQL commit leaves a private orphan,
  // which is safer than deleting bytes after an uncertain database commit. Reconciliation is explicit.
  const storageKey = `blob_${f.id}`;
  return operation(
    sql,
    actor,
    f.key,
    {
      type: "attachment.upload",
      id: f.id,
      entityType: f.type,
      entityId: f.entityId,
      filename: f.filename,
      sha256: f.sha256,
    },
    async (trx) => {
      await requireEntity(trx, f.type, f.entityId);
      await store.put(storageKey, f.bytes);
      const row = (
        await trx.raw(
          `insert into woodright_private_attachment
      (id, entity_type, entity_id, filename, mime_type, size, sha256, storage_key, uploaded_by)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning id, entity_type, entity_id, filename, mime_type, size, created_at`,
          [
            f.id,
            f.type,
            f.entityId,
            f.filename,
            f.mime,
            f.bytes.length,
            f.sha256,
            storageKey,
            actor,
          ],
        )
      ).rows[0];
      await audit(trx, actor, f.type, f.entityId, "attachment.uploaded", {
        attachment_id: f.id,
        size: f.bytes.length,
        sha256: f.sha256,
      });
      return { attachment: row };
    },
  );
}
export async function removeAttachment(
  sql: Sql,
  actor: string,
  raw: Record<string, any>,
) {
  const id = identifier(raw.id);
  return operation(
    sql,
    actor,
    raw.key,
    { type: "attachment.remove", id },
    async (trx) => {
      const row = (
        await trx.raw(
          `update woodright_private_attachment set deleted_at = now(), updated_at = now()
      where id = ? and deleted_at is null returning entity_type, entity_id`,
          [id],
        )
      ).rows[0];
      if (!row) throw new DeskError(404, "NOT_FOUND", "Вложение не найдено");
      await audit(
        trx,
        actor,
        row.entity_type,
        row.entity_id,
        "attachment.removed",
        { attachment_id: id },
      );
      return { id, removed: true };
    },
  );
}
