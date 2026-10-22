import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { eq } from "drizzle-orm";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import * as docs from "../src/server/documents";
import { validateDocument, documentForm } from "../src/server/document-files";
import {
  scanClamAV,
  documentsConfigured,
  type DocumentIO,
} from "../src/server/document-storage";
import { AppError } from "../src/lib/errors";
let fixture: Awaited<ReturnType<typeof testDatabase>>,
  familyId: string,
  viewerId: string;
const owner = { id: "doc-owner", email: "doc-owner@example.test" },
  viewer = { id: "doc-viewer", email: "doc-viewer@example.test" },
  outsider = { id: "doc-outsider", email: "doc-outsider@example.test" };
const file = {
  bytes: Buffer.from("Family document বাংলা"),
  filename: "নথি.txt",
  mime: "text/plain",
};
const metadata = {
  title: "Family deed",
  description: "Reference",
  category: "Legal",
  tags: ["deed"],
  version: 1,
};
const blobs = new Map<string, Buffer>();
const io: DocumentIO = {
  async scan() {},
  async put(key, bytes) {
    blobs.set(key, Buffer.from(bytes));
  },
  async get(key) {
    const bytes = blobs.get(key);
    if (!bytes) throw Error("missing");
    return bytes;
  },
  async remove(key) {
    blobs.delete(key);
  },
};
const create = () =>
  service.createRecord(
    fixture.db,
    familyId,
    owner,
    {
      kind: "asset",
      typeCode: "property.apartment",
      name: "Document property",
      amount: "1000",
      asOf: "2026-01-01",
    },
    randomUUID(),
  );
const upload = (
  id: string,
  input: unknown = metadata,
  key = randomUUID(),
  storage = io,
) =>
  docs.uploadDocument(
    fixture.db,
    familyId,
    owner,
    id,
    input,
    file,
    key,
    storage,
  );
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.db
    .insert(s.user)
    .values(
      [owner, viewer, outsider].map((a) => ({
        ...a,
        name: a.id,
        emailVerified: true,
      })),
    );
  familyId = (
    await service.createFamily(fixture.db, owner, { name: "Document family" })
  ).id;
  viewerId = (
    await fixture.db
      .insert(s.memberships)
      .values({ familyId, userId: viewer.id, role: "member" })
      .returning()
  )[0].id;
});
afterAll(async () => {
  await fixture?.client.close();
});
it("uploads scanned files, returns exact bytes, audits access and preserves old versions", async () => {
  const r = await create(),
    first = await upload(r.id);
  const result = await docs.downloadDocument(
    fixture.db,
    familyId,
    owner,
    r.id,
    first.versionId,
    false,
    io,
  );
  expect(Buffer.from(await result.arrayBuffer())).toEqual(file.bytes);
  expect(result.headers.get("content-disposition")).toContain("attachment;");
  expect(result.headers.get("cache-control")).toBe("no-store");
  const second = await upload(r.id, {
    ...metadata,
    version: 2,
    documentId: first.documentId,
    title: "New title",
  });
  expect(second.documentId).toBe(first.documentId);
  const history = await docs.documentHistory(
    fixture.db,
    familyId,
    owner,
    r.id,
    first.documentId,
  );
  expect(history.versions.map((v) => v.revision)).toEqual([2, 1]);
  expect(history.events).toHaveLength(2);
  expect(
    (
      await docs.downloadDocument(
        fixture.db,
        familyId,
        owner,
        r.id,
        first.versionId,
        false,
        io,
      )
    ).status,
  ).toBe(200);
});
it("replays a completed upload without another object or revision", async () => {
  const r = await create(),
    key = randomUUID(),
    first = await upload(r.id, metadata, key),
    size = blobs.size;
  expect(await upload(r.id, metadata, key)).toEqual(first);
  expect(blobs.size).toBe(size);
  await expect(
    upload(r.id, { ...metadata, title: "Changed" }, key),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("denies outsider metadata and cross-record/cross-family downloads", async () => {
  const r = await create(),
    other = await create(),
    v = await upload(r.id);
  await expect(
    docs.listDocuments(fixture.db, familyId, outsider, r.id),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    docs.downloadDocument(
      fixture.db,
      familyId,
      owner,
      other.id,
      v.versionId,
      false,
      io,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const f = (
    await service.createFamily(fixture.db, owner, { name: "Second family" })
  ).id;
  await expect(
    docs.downloadDocument(fixture.db, f, owner, r.id, v.versionId, false, io),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("requires export permission even with view permission; deny overrides allow", async () => {
  const r = await create(),
    v = await upload(r.id);
  await service.setGrant(fixture.db, familyId, owner, r.id, {
    membershipId: viewerId,
    action: "view",
    effect: "allow",
  });
  expect(
    (await docs.listDocuments(fixture.db, familyId, viewer, r.id)).documents,
  ).toHaveLength(1);
  await expect(
    docs.downloadDocument(
      fixture.db,
      familyId,
      viewer,
      r.id,
      v.versionId,
      false,
      io,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await service.setGrant(fixture.db, familyId, owner, r.id, {
    membershipId: viewerId,
    action: "export",
    effect: "allow",
  });
  expect(
    (
      await docs.downloadDocument(
        fixture.db,
        familyId,
        viewer,
        r.id,
        v.versionId,
        false,
        io,
      )
    ).status,
  ).toBe(200);
  await service.setGrant(fixture.db, familyId, owner, r.id, {
    membershipId: viewerId,
    action: "view",
    effect: "deny",
  });
  await expect(
    docs.downloadDocument(
      fixture.db,
      familyId,
      viewer,
      r.id,
      v.versionId,
      false,
      io,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("checks permission again after the object fetch", async () => {
  const r = await create(),
    v = await upload(r.id);
  for (const action of ["view", "export"])
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: viewerId,
      action,
      effect: "allow",
    });
  await expect(
    docs.downloadDocument(
      fixture.db,
      familyId,
      viewer,
      r.id,
      v.versionId,
      false,
      {
        ...io,
        async get(key) {
          await service.setGrant(fixture.db, familyId, owner, r.id, {
            membershipId: viewerId,
            action: "export",
            effect: "deny",
          });
          return io.get(key);
        },
      },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("rejects malware before storage and never offers it for download", async () => {
  const r = await create();
  let stored = false;
  await expect(
    upload(r.id, metadata, randomUUID(), {
      ...io,
      async scan() {
        throw new AppError("UNSAFE_FILE", 422);
      },
      async put() {
        stored = true;
      },
    }),
  ).rejects.toMatchObject({ code: "UNSAFE_FILE" });
  expect(stored).toBe(false);
  const d = (await docs.listDocuments(fixture.db, familyId, owner, r.id))
      .documents[0],
    h = await docs.documentHistory(fixture.db, familyId, owner, r.id, d.id);
  expect(d.currentRevision).toBe(0);
  expect(h.versions[0].status).toBe("rejected");
  await expect(
    docs.downloadDocument(
      fixture.db,
      familyId,
      owner,
      r.id,
      h.versions[0].id,
      false,
      io,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("fails closed on scanner failure and uses terminal request keys", async () => {
  const r = await create(),
    key = randomUUID();
  await expect(
    upload(r.id, metadata, key, {
      ...io,
      async scan() {
        throw new AppError("SCAN_UNAVAILABLE", 503);
      },
    }),
  ).rejects.toMatchObject({ code: "SCAN_UNAVAILABLE" });
  await expect(upload(r.id, metadata, key)).rejects.toMatchObject({
    code: "UPLOAD_FAILED",
  });
});
it("tracks uncertain storage writes and cleans only stale unavailable objects", async () => {
  const r = await create(),
    good = await upload(r.id);
  await expect(
    upload(
      r.id,
      { ...metadata, version: 2, documentId: good.documentId },
      randomUUID(),
      {
        ...io,
        async put(k, b) {
          await io.put(k, b);
          throw Error("lost acknowledgment");
        },
      },
    ),
  ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE" });
  const h = await docs.documentHistory(
      fixture.db,
      familyId,
      owner,
      r.id,
      good.documentId,
    ),
    failed = h.versions[0];
  await fixture.db
    .update(s.documentVersions)
    .set({ updatedAt: new Date(Date.now() - 2 * 86400000) })
    .where(eq(s.documentVersions.id, failed.id));
  expect(
    (await docs.cleanupDocuments(fixture.db, false, io)).candidates,
  ).toContain(failed.id);
  expect(blobs.has(docs.objectKey({ familyId, id: failed.id }))).toBe(true);
  expect((await docs.cleanupDocuments(fixture.db, true, io)).removed).toBe(1);
  expect(blobs.has(docs.objectKey({ familyId, id: good.versionId }))).toBe(
    true,
  );
  expect(
    (
      await docs.documentHistory(
        fixture.db,
        familyId,
        owner,
        r.id,
        good.documentId,
      )
    ).versions[0].status,
  ).toBe("discarded");
});
it("cannot publish after the record changes while scanning", async () => {
  const r = await create();
  await expect(
    upload(r.id, metadata, randomUUID(), {
      ...io,
      async scan() {
        await service.editRecord(
          fixture.db,
          familyId,
          owner,
          r.id,
          { name: "Changed record", notes: "", version: 1 },
          randomUUID(),
        );
      },
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (await docs.listDocuments(fixture.db, familyId, owner, r.id)).documents[0]
      .currentRevision,
  ).toBe(0);
});
it("blocks archived records and stale metadata edits; archive/restore retains files", async () => {
  const r = await create(),
    v = await upload(r.id);
  const edit = { ...metadata, version: 2, archived: true };
  await docs.editDocument(
    fixture.db,
    familyId,
    owner,
    r.id,
    v.documentId,
    edit,
    randomUUID(),
  );
  await expect(
    upload(r.id, { ...metadata, version: 3, documentId: v.documentId }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    docs.editDocument(
      fixture.db,
      familyId,
      owner,
      r.id,
      v.documentId,
      { ...edit, archived: false },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await docs.editDocument(
    fixture.db,
    familyId,
    owner,
    r.id,
    v.documentId,
    { ...edit, version: 3, archived: false },
    randomUUID(),
  );
  await service.archiveRecord(
    fixture.db,
    familyId,
    owner,
    r.id,
    { version: 4, archived: true },
    randomUUID(),
  );
  await expect(upload(r.id, { ...metadata, version: 5 })).rejects.toMatchObject(
    { code: "CONFLICT" },
  );
  expect(
    (
      await docs.downloadDocument(
        fixture.db,
        familyId,
        owner,
        r.id,
        v.versionId,
        false,
        io,
      )
    ).status,
  ).toBe(200);
});
it("detects storage corruption and disallows active document previews", async () => {
  const r = await create(),
    v = await upload(r.id);
  await expect(
    docs.downloadDocument(
      fixture.db,
      familyId,
      owner,
      r.id,
      v.versionId,
      false,
      {
        ...io,
        async get() {
          return Buffer.from("corrupt");
        },
      },
    ),
  ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE" });
  await expect(
    docs.downloadDocument(
      fixture.db,
      familyId,
      owner,
      r.id,
      v.versionId,
      true,
      io,
    ),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
});
it("validates byte limits, UTF-8, signatures, filenames, extension and MIME", async () => {
  await expect(
    validateDocument(file.bytes, file.filename, file.mime),
  ).resolves.toMatchObject({ mime: "text/plain" });
  for (const [bytes, name, mime] of [
    [Buffer.alloc(0), "a.txt", "text/plain"],
    [Buffer.alloc(10485761), "a.txt", "text/plain"],
    [Buffer.from([0xff]), "a.txt", "text/plain"],
    [Buffer.from("a\0b"), "a.csv", "text/csv"],
    [file.bytes, "a.pdf", "application/pdf"],
    [file.bytes, "../a.txt", "text/plain"],
    [file.bytes, "a.html", "text/html"],
    [file.bytes, "a.txt", "image/png"],
  ] as const)
    await expect(validateDocument(bytes, name, mime)).rejects.toBeTruthy();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII=",
    "base64",
  );
  expect((await validateDocument(png, "a.png", "image/png")).mime).toBe(
    "image/png",
  );
});
it("parses multipart uploads and rejects duplicate files and oversized streams", async () => {
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set("file", new File([file.bytes], file.filename, { type: file.mime }));
  expect(
    (
      await documentForm(
        new Request("https://example.test", { method: "POST", body: form }),
      )
    ).bytes,
  ).toEqual(file.bytes);
  form.append("file", new File(["two"], "two.txt"));
  await expect(
    documentForm(
      new Request("https://example.test", { method: "POST", body: form }),
    ),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(
    documentForm(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=x" },
        body: new Uint8Array(10485760 + 32769),
      }),
    ),
  ).rejects.toMatchObject({ code: "TOO_LARGE" });
});
it("requires explicit service setup", () => {
  vi.stubEnv("DOCUMENT_S3_BUCKET", "");
  try {
    expect(documentsConfigured()).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});
it("sends the ClamAV INSTREAM protocol and handles clean, infected and invalid verdicts", async () => {
  for (const verdict of [
    "stream: OK\0",
    "stream: Eicar-Test FOUND\0",
    "stream: scanner error ERROR\0",
  ]) {
    let received = Buffer.alloc(0);
    const server = createServer((socket) => {
      socket.on("data", (chunk) => {
        received = Buffer.concat([received, Buffer.from(chunk)]);
        if (received.length >= 10 + 4 + file.bytes.length + 4)
          socket.end(verdict);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw Error("address");
      const promise = scanClamAV(file.bytes, "127.0.0.1", address.port);
      if (verdict.includes("OK")) await promise;
      else
        await expect(promise).rejects.toMatchObject({
          code: verdict.includes("FOUND") ? "UNSAFE_FILE" : "SCAN_UNAVAILABLE",
        });
      expect(received.subarray(0, 10).toString()).toBe("zINSTREAM\0");
      expect(received.readUInt32BE(10)).toBe(file.bytes.length);
      expect(received.subarray(14, -4)).toEqual(file.bytes);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
it("reports pending duplicate requests without starting a second upload", async () => {
  const r = await create(),
    key = randomUUID();
  const result = await upload(r.id, metadata, key, {
    ...io,
    async scan() {
      await expect(upload(r.id, metadata, key)).rejects.toMatchObject({
        code: "UPLOAD_BUSY",
      });
    },
  });
  expect(
    (
      await docs.documentHistory(
        fixture.db,
        familyId,
        owner,
        r.id,
        result.documentId,
      )
    ).versions,
  ).toHaveLength(1);
});
it("will not publish a file after upload permission is revoked", async () => {
  const r = await create();
  for (const action of ["view", "edit"])
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: viewerId,
      action,
      effect: "allow",
    });
  await expect(
    docs.uploadDocument(
      fixture.db,
      familyId,
      viewer,
      r.id,
      metadata,
      file,
      randomUUID(),
      {
        ...io,
        async scan() {
          await service.setGrant(fixture.db, familyId, owner, r.id, {
            membershipId: viewerId,
            action: "edit",
            effect: "deny",
          });
        },
      },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (await docs.listDocuments(fixture.db, familyId, owner, r.id)).documents[0]
      .currentRevision,
  ).toBe(0);
});
it("keeps failed cleanup charged and never deletes a recent upload", async () => {
  const r = await create();
  await expect(
    upload(r.id, metadata, randomUUID(), {
      ...io,
      async put() {
        throw Error("unavailable");
      },
    }),
  ).rejects.toBeTruthy();
  const d = (await docs.listDocuments(fixture.db, familyId, owner, r.id))
      .documents[0],
    v = (await docs.documentHistory(fixture.db, familyId, owner, r.id, d.id))
      .versions[0];
  expect(
    (await docs.cleanupDocuments(fixture.db, false, io)).candidates,
  ).not.toContain(v.id);
  await fixture.db
    .update(s.documentVersions)
    .set({ updatedAt: new Date(Date.now() - 2 * 86400000) })
    .where(eq(s.documentVersions.id, v.id));
  await docs.cleanupDocuments(fixture.db, true, {
    ...io,
    async remove() {
      throw Error("offline");
    },
  });
  expect(
    (await docs.documentHistory(fixture.db, familyId, owner, r.id, d.id))
      .versions[0].status,
  ).toBe("failed");
});
it("reserves quota for retained and unfinished versions", async () => {
  const r = await create(),
    v = await upload(r.id);
  // Fill the logical allowance without allocating a gigabyte of test memory.
  await fixture.db
    .insert(s.documentVersions)
    .values(
      Array.from({ length: 103 }, (_, i) => ({
        familyId,
        recordId: r.id,
        documentId: v.documentId,
        revision: i + 2,
        filename: "reserved.txt",
        mime: "text/plain",
        size: 10485760,
        sha256: "test",
        status: "failed",
        requestKey: randomUUID(),
        inputHash: "test",
        createdBy: owner.id,
      })),
    );
  try {
    await expect(
      upload(r.id, { ...metadata, version: 2 }),
    ).rejects.toMatchObject({ code: "DOCUMENT_QUOTA" });
  } finally {
    await fixture.db
      .delete(s.documentVersions)
      .where(eq(s.documentVersions.sha256, "test"));
  }
});

it("explicit disabled mode stores truthful scan metadata and preserves download permissions", async () => {
  vi.stubEnv("DOCUMENT_SCAN_MODE", "disabled");
  const scan = vi.fn(async () => { throw new AppError("SCAN_UNAVAILABLE", 503); });
  try {
    const r = await create();
    const v = await upload(r.id, metadata, randomUUID(), { ...io, scan });
    expect(scan).not.toHaveBeenCalled();
    const history = await docs.documentHistory(fixture.db, familyId, owner, r.id, v.documentId);
    expect(history.versions[0]).toMatchObject({ status: "available", scanSkipped: true, scannedAt: null });
    const response = await docs.downloadDocument(fixture.db, familyId, owner, r.id, v.versionId, false, io);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(file.bytes);
    await expect(docs.downloadDocument(fixture.db, familyId, outsider, r.id, v.versionId, false, io)).rejects.toBeInstanceOf(AppError);
    vi.stubEnv("DOCUMENT_SCAN_MODE", "required");
    const unchanged = await docs.documentHistory(fixture.db, familyId, owner, r.id, v.documentId);
    expect(unchanged.versions[0]).toMatchObject({ scanSkipped: true, scannedAt: null });
    const next = await create();
    await expect(upload(next.id, metadata, randomUUID(), { ...io, scan })).rejects.toMatchObject({ code: "SCAN_UNAVAILABLE" });
    expect(scan).toHaveBeenCalledOnce();
    await expect(fixture.db.update(s.documentVersions).set({ scannedAt: new Date() }).where(eq(s.documentVersions.id,v.versionId))).rejects.toThrow();
  } finally { vi.unstubAllEnvs(); }
});

it("disabled mode still needs storage and invalid scan policies cannot upload", async () => {
  try {
    vi.stubEnv("DOCUMENT_SCAN_MODE", "disabled");
    vi.stubEnv("DOCUMENT_S3_BUCKET", "test-bucket");
    vi.stubEnv("DOCUMENT_S3_REGION", "test-region");
    vi.stubEnv("DOCUMENT_SCAN_URL", "");
    vi.stubEnv("CLAMAV_HOST", "");
    expect(documentsConfigured()).toBe(true);
    vi.stubEnv("DOCUMENT_S3_BUCKET", "");
    expect(documentsConfigured()).toBe(false);
    vi.stubEnv("DOCUMENT_SCAN_MODE", "typo");
    const r = await create();
    await expect(upload(r.id)).rejects.toMatchObject({ code: "DOCUMENTS_NOT_CONFIGURED" });
  } finally { vi.unstubAllEnvs(); }
});
