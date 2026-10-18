import { and, eq, desc, sql, inArray, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Db } from "../db";
import * as s from "../db/schema";
import {
  authorized,
  audit,
  mutate,
  bumpActiveRecord,
  type Actor,
} from "./service";
import {
  documentUpload,
  documentEdit,
  FAMILY_DOCUMENT_QUOTA,
} from "../lib/documents";
import { uuid } from "../lib/validation";
import { AppError } from "../lib/errors";
import { validateDocument } from "./document-files";
import {
  documentIO,
  documentsConfigured,
  type DocumentIO,
} from "./document-storage";
const digest = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");
export const objectKey = (v: { familyId: string; id: string }) =>
  `documents/${v.familyId}/${v.id}`;
const scope = (familyId: string, recordId: string) =>
  and(eq(s.documents.familyId, familyId), eq(s.documents.recordId, recordId));
export async function listDocuments(
  db: Db,
  familyId: string,
  a: Actor,
  recordId: string,
) {
  await authorized(db, familyId, a, recordId, "view");
  const documents = await db
    .select()
    .from(s.documents)
    .where(scope(familyId, recordId))
    .orderBy(desc(s.documents.createdAt))
    .limit(101);
  return {
    configured: documentsConfigured(),
    documents: documents.slice(0, 100),
    hasMore: documents.length > 100,
  };
}
export async function documentHistory(
  db: Db,
  familyId: string,
  a: Actor,
  recordId: string,
  documentId: string,
) {
  await authorized(db, familyId, a, recordId, "view");
  uuid.parse(documentId);
  const [doc] = await db
    .select()
    .from(s.documents)
    .where(and(scope(familyId, recordId), eq(s.documents.id, documentId)));
  if (!doc) throw new AppError("NOT_FOUND", 404);
  const versions = await db
    .select({
      id: s.documentVersions.id,
      revision: s.documentVersions.revision,
      filename: s.documentVersions.filename,
      mime: s.documentVersions.mime,
      size: s.documentVersions.size,
      status: s.documentVersions.status,
      errorCode: s.documentVersions.errorCode,
      createdAt: s.documentVersions.createdAt,
      scannedAt: s.documentVersions.scannedAt,
    })
    .from(s.documentVersions)
    .where(eq(s.documentVersions.documentId, documentId))
    .orderBy(desc(s.documentVersions.revision))
    .limit(101);
  const events = await db
    .select()
    .from(s.documentEvents)
    .where(eq(s.documentEvents.documentId, documentId))
    .orderBy(desc(s.documentEvents.createdAt))
    .limit(101);
  return {
    versions: versions.slice(0, 100),
    events: events.slice(0, 100),
    hasMore: versions.length > 100 || events.length > 100,
  };
}
export async function uploadDocument(
  db: Db,
  familyId: string,
  a: Actor,
  recordId: string,
  raw: unknown,
  file: { bytes: Buffer; filename: string; mime: string },
  key: string,
  io?: DocumentIO,
) {
  await authorized(db, familyId, a, recordId, "edit");
  const input = documentUpload.parse(raw);
  uuid.parse(key);
  const metadata = await validateDocument(file.bytes, file.filename, file.mime);
  const inputHash = digest(JSON.stringify({ recordId, input, metadata }));
  const storage = io ?? documentIO();
  const reserved = await db.transaction(async (q) => {
    const { r } = await authorized(q, familyId, a, recordId, "edit");
    await q.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"document-quota:" + familyId},0))`,
    );
    const [existing] = await q
      .select()
      .from(s.documentVersions)
      .where(
        and(
          eq(s.documentVersions.familyId, familyId),
          eq(s.documentVersions.createdBy, a.id),
          eq(s.documentVersions.requestKey, key),
        ),
      );
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new AppError("IDEMPOTENCY_CONFLICT", 409);
      if (existing.status === "available")
        return { version: existing, done: true };
      throw new AppError(
        ["pending", "scanning"].includes(existing.status)
          ? "UPLOAD_BUSY"
          : "UPLOAD_FAILED",
        409,
      );
    }
    if (r.archived || r.version !== input.version)
      throw new AppError("CONFLICT", 409);
    const [usage] = await q
      .select({
        bytes: sql<string>`coalesce(sum(${s.documentVersions.size}),0)`,
      })
      .from(s.documentVersions)
      .where(
        and(
          eq(s.documentVersions.familyId, familyId),
          inArray(s.documentVersions.status, [
            "pending",
            "scanning",
            "available",
            "failed",
          ]),
        ),
      );
    if (Number(usage.bytes) + metadata.size > FAMILY_DOCUMENT_QUOTA)
      throw new AppError("DOCUMENT_QUOTA", 409);
    let documentId = input.documentId;
    if (documentId) {
      const [doc] = await q
        .select()
        .from(s.documents)
        .where(and(scope(familyId, recordId), eq(s.documents.id, documentId)))
        .for("update");
      if (!doc || doc.archived) throw new AppError("NOT_FOUND", 404);
    } else {
      const [count] = await q
        .select({ n: sql<number>`count(*)::int` })
        .from(s.documents)
        .where(scope(familyId, recordId));
      if (count.n >= 100) throw new AppError("DOCUMENT_LIMIT", 409);
      const [doc] = await q
        .insert(s.documents)
        .values({
          familyId,
          recordId,
          title: input.title,
          description: input.description,
          category: input.category,
          tags: input.tags,
          createdBy: a.id,
        })
        .returning();
      documentId = doc.id;
    }
    const [latest] = await q
      .select({ revision: s.documentVersions.revision })
      .from(s.documentVersions)
      .where(eq(s.documentVersions.documentId, documentId))
      .orderBy(desc(s.documentVersions.revision))
      .limit(1);
    const [version] = await q
      .insert(s.documentVersions)
      .values({
        familyId,
        recordId,
        documentId,
        revision: (latest?.revision ?? 0) + 1,
        ...metadata,
        requestKey: key,
        inputHash,
        createdBy: a.id,
      })
      .returning();
    await audit(q, familyId, a, "document.upload-started", recordId);
    return { version, done: false };
  });
  const v = reserved.version;
  if (reserved.done)
    return { id: recordId, documentId: v.documentId, versionId: v.id };
  try {
    await db
      .update(s.documentVersions)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(
        and(
          eq(s.documentVersions.id, v.id),
          eq(s.documentVersions.status, "pending"),
        ),
      );
    await storage.scan(file.bytes);
    // Fail expired requests before starting storage, and again before publication.
    if (Date.now() - v.createdAt.getTime() > 120000)
      throw new AppError("UPLOAD_FAILED", 409);
    await storage.put(objectKey(v), file.bytes);
    await db.transaction(async (q) => {
      await authorized(q, familyId, a, recordId, "edit");
      const [current] = await q
        .select()
        .from(s.documentVersions)
        .where(eq(s.documentVersions.id, v.id))
        .for("update");
      if (
        current.status !== "scanning" ||
        Date.now() - v.createdAt.getTime() > 120000
      )
        throw new AppError("UPLOAD_FAILED", 409);
      const [doc] = await q
        .select()
        .from(s.documents)
        .where(eq(s.documents.id, v.documentId))
        .for("update");
      if (doc.archived) throw new AppError("CONFLICT", 409);
      await bumpActiveRecord(q, familyId, recordId, input.version);
      const snapshot = {
        title: input.title,
        description: input.description,
        category: input.category,
        tags: input.tags,
        currentRevision: v.revision,
      };
      await q
        .update(s.documents)
        .set({ ...snapshot, updatedAt: new Date() })
        .where(eq(s.documents.id, v.documentId));
      await q
        .update(s.documentVersions)
        .set({
          status: "available",
          scannedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(s.documentVersions.id, v.id));
      await q
        .insert(s.documentEvents)
        .values({
          familyId,
          recordId,
          documentId: v.documentId,
          action: "uploaded",
          snapshot,
          createdBy: a.id,
        });
      await audit(q, familyId, a, "document.uploaded", recordId);
    });
    return { id: recordId, documentId: v.documentId, versionId: v.id };
  } catch (error) {
    const code =
      error instanceof AppError ? error.code : "DOCUMENT_UNAVAILABLE";
    // A lost commit acknowledgement must never downgrade an available version.
    await db
      .update(s.documentVersions)
      .set({
        status: code === "UNSAFE_FILE" ? "rejected" : "failed",
        errorCode: code,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(s.documentVersions.id, v.id),
          inArray(s.documentVersions.status, ["pending", "scanning"]),
        ),
      );
    throw error instanceof AppError
      ? error
      : new AppError("DOCUMENT_UNAVAILABLE", 503);
  }
}
export async function editDocument(
  db: Db,
  familyId: string,
  a: Actor,
  recordId: string,
  documentId: string,
  raw: unknown,
  key: string,
) {
  uuid.parse(documentId);
  const input = documentEdit.parse(raw);
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "document-edit", recordId, documentId, input },
    async (q) => {
      await authorized(q, familyId, a, recordId, "edit");
      const [doc] = await q
        .select()
        .from(s.documents)
        .where(and(scope(familyId, recordId), eq(s.documents.id, documentId)))
        .for("update");
      if (!doc) throw new AppError("NOT_FOUND", 404);
      await bumpActiveRecord(q, familyId, recordId, input.version);
      const { version: _, ...snapshot } = input;
      await q
        .update(s.documents)
        .set({ ...snapshot, updatedAt: new Date() })
        .where(eq(s.documents.id, documentId));
      const action =
        doc.archived !== input.archived
          ? input.archived
            ? "archived"
            : "restored"
          : "updated";
      await q
        .insert(s.documentEvents)
        .values({
          familyId,
          recordId,
          documentId,
          action,
          snapshot,
          createdBy: a.id,
        });
      await audit(q, familyId, a, "document." + action, recordId);
      return { id: recordId };
    },
  );
}
export async function downloadDocument(
  db: Db,
  familyId: string,
  a: Actor,
  recordId: string,
  versionId: string,
  preview = false,
  io?: DocumentIO,
) {
  await authorized(db, familyId, a, recordId, "export");
  uuid.parse(versionId);
  const [v] = await db
    .select()
    .from(s.documentVersions)
    .where(
      and(
        eq(s.documentVersions.id, versionId),
        eq(s.documentVersions.familyId, familyId),
        eq(s.documentVersions.recordId, recordId),
        eq(s.documentVersions.status, "available"),
      ),
    );
  if (!v || !v.scannedAt) throw new AppError("NOT_FOUND", 404);
  if (preview && !["image/png", "image/jpeg"].includes(v.mime))
    throw new AppError("INVALID_FILE", 422);
  let bytes: Buffer;
  try {
    bytes = await (io ?? documentIO()).get(objectKey(v));
  } catch (error) {
    throw error instanceof AppError
      ? error
      : new AppError("DOCUMENT_UNAVAILABLE", 503);
  }
  if (bytes.length !== v.size || digest(bytes) !== v.sha256)
    throw new AppError("DOCUMENT_UNAVAILABLE", 503);
  // Recheck after external I/O so a revoked membership cannot start a download.
  await authorized(db, familyId, a, recordId, "export");
  await audit(
    db,
    familyId,
    a,
    preview ? "document.previewed" : "document.downloaded",
    recordId,
  );
  const name = encodeURIComponent(v.filename).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16),
  );
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": preview ? v.mime : "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="document"; filename*=UTF-8''${name}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
// Operator-only: only known nonavailable objects older than 24h; never list or delete unrelated keys.
export async function cleanupDocuments(db: Db, apply = false, io?: DocumentIO) {
  const cutoff = new Date(Date.now() - 86400000);
  const candidates = await db
    .select()
    .from(s.documentVersions)
    .where(
      and(
        inArray(s.documentVersions.status, ["pending", "scanning", "failed"]),
        lt(s.documentVersions.updatedAt, cutoff),
      ),
    )
    .limit(100);
  if (!apply) return { candidates: candidates.map((v) => v.id), removed: 0 };
  const storage = io ?? documentIO();
  let removed = 0;
  for (const v of candidates) {
    const claimed = await db
      .update(s.documentVersions)
      .set({
        status: "failed",
        errorCode: "UPLOAD_EXPIRED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(s.documentVersions.id, v.id),
          inArray(s.documentVersions.status, ["pending", "scanning", "failed"]),
          lt(s.documentVersions.updatedAt, cutoff),
        ),
      )
      .returning();
    if (!claimed.length) continue;
    try {
      await storage.remove(objectKey(v));
      await db
        .update(s.documentVersions)
        .set({ status: "discarded", updatedAt: new Date() })
        .where(
          and(
            eq(s.documentVersions.id, v.id),
            eq(s.documentVersions.status, "failed"),
          ),
        );
      removed++;
    } catch {
      /* Keep quota charged; a later cleanup retries. */
    }
  }
  return { candidates: candidates.map((v) => v.id), removed };
}
