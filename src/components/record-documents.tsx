"use client";
import { useEffect, useRef, useState } from "react";
import type { snapshot } from "@/server/service";
import type { listDocuments, documentHistory } from "@/server/documents";
import { api, ApiError, errorText } from "@/lib/client";
import { Button } from "./button";
type Row = Awaited<ReturnType<typeof snapshot>>["records"][number];
type Listing = Awaited<ReturnType<typeof listDocuments>>;
type History = Awaited<ReturnType<typeof documentHistory>>;
type Doc = Listing["documents"][number];
export function RecordDocuments({
  record: r,
  familyId,
  locale,
  onSaved,
}: {
  record: Row;
  familyId: string;
  locale: string;
  onSaved: () => void;
}) {
  const bn = locale === "bn",
    editable = r.canEdit && !r.archived,
    base = `families/${familyId}/records/${r.id}`;
  const [data, setData] = useState<Listing | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [selected, setSelected] = useState<Doc | null>(null),
    [history, setHistory] = useState<History | null>(null);
  const selection = useRef(0);
  const request = useRef({ fingerprint: "", key: crypto.randomUUID() });
  useEffect(() => {
    let active = true;
    api<Listing>(base + "/documents")
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [base, retry]);
  function key(fingerprint: string) {
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    return request.current.key;
  }
  async function open(doc: Doc) {
    const token = ++selection.current;
    setSelected(doc);
    setHistory(null);
    setError("");
    try {
      const value = await api<History>(base + "/documents/" + doc.id);
      if (selection.current === token) setHistory(value);
    } catch (e) {
      if (selection.current === token) setError(errorText(e));
    }
  }
  async function upload(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    try {
      const fields = new FormData(form),
        file = fields.get("file") as File;
      if (!file?.size || file.size > 10 * 1024 * 1024)
        throw new Error(
          bn
            ? "১০ MB পর্যন্ত একটি ফাইল বেছে নিন।"
            : "Choose a file up to 10 MB.",
        );
      const metadata = {
        title: fields.get("title"),
        description: fields.get("description"),
        category: fields.get("category"),
        tags: String(fields.get("tags") || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        version: r.version,
        ...(selected ? { documentId: selected.id } : {}),
      };
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      )
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const payload = new FormData();
      payload.set("file", file);
      payload.set("metadata", JSON.stringify(metadata));
      const response = await fetch("/api/" + base + "/documents", {
        method: "POST",
        body: payload,
        headers: {
          "Idempotency-Key": key(
            JSON.stringify({
              metadata,
              hash,
              name: file.name,
              mime: file.type,
            }),
          ),
        },
      });
      const result = await response.json();
      if (!response.ok)
        throw new ApiError(
          result.error?.code,
          result.error?.message || "Upload failed",
          result.error?.correlationId,
        );
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setRetry((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  async function edit(form: HTMLFormElement) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const fields = new FormData(form),
      input = {
        title: fields.get("title"),
        description: fields.get("description"),
        category: fields.get("category"),
        tags: String(fields.get("tags") || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        archived: fields.get("archived") === "on",
        version: r.version,
      };
    try {
      await api(
        base + "/documents/" + selected.id,
        "PATCH",
        input,
        key(JSON.stringify({ id: selected.id, input })),
      );
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(v: History["versions"][number]) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/" + base + "/document-files/" + v.id, {
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Download failed");
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = v.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function fields(doc: Doc | null) {
    return (
      <>
        <label>
          {bn ? "শিরোনাম" : "Title"}
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={doc?.title ?? ""}
          />
        </label>
        <div className="form-grid">
          <label>
            {bn ? "বিভাগ" : "Category"}
            <input
              name="category"
              maxLength={80}
              defaultValue={doc?.category ?? ""}
            />
          </label>
          <label>
            {bn ? "ট্যাগ (কমা দিয়ে আলাদা)" : "Tags (comma separated)"}
            <input
              name="tags"
              maxLength={409}
              defaultValue={doc?.tags.join(", ") ?? ""}
            />
          </label>
        </div>
        <label>
          {bn ? "বিবরণ" : "Description"}
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={doc?.description ?? ""}
          />
        </label>
      </>
    );
  }
  return (
    <section className="section-form record-documents">
      <h3>{bn ? "নথি ও ফাইল" : "Documents and files"}</h3>
      <p className="muted">
        {bn
          ? "PDF, PNG, JPEG, TXT ও CSV · প্রতি ফাইল সর্বোচ্চ ১০ MB। ফাইল দেখতে বা ডাউনলোড করতে Export অনুমতি প্রয়োজন।"
          : "PDF, PNG, JPEG, TXT and CSV · Up to 10 MB each. Preview and download require Export permission."}
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
              if (selected) void open(selected);
            }}
          >
            {bn ? "অবস্থা দেখুন" : "Refresh status"}
          </button>
        </div>
      )}
      {!data ? (
        <p role="status">{bn ? "লোড হচ্ছে…" : "Loading…"}</p>
      ) : (
        <>
          {!data.configured && (
            <p className="notice">
              {bn
                ? "ফাইল আপলোডের জন্য প্রশাসককে স্টোরেজ ও ভাইরাস স্ক্যানার সেটআপ করতে হবে।"
                : "An administrator must configure private storage and the document scan policy to enable uploads."}
            </p>
          )}
          {data.scanMode === "disabled" && (
            <p className="notice">
              {bn ? "ম্যালওয়্যার স্ক্যান বন্ধ আছে। নতুন ফাইল স্ক্যান ছাড়াই সংরক্ষিত হবে। শুধু বিশ্বস্ত ফাইল আপলোড ও ডাউনলোড করুন।" : "Malware scanning is disabled. New files are stored without a malware scan. Only upload and download files you trust."}
            </p>
          )}
          <label>
            {bn ? "এই রেকর্ডের নথি খুঁজুন" : "Search this record's documents"}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                bn ? "শিরোনাম, বিভাগ বা ট্যাগ" : "Title, category or tag"
              }
            />
          </label>
          <label className="owner-check">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            {bn ? "আর্কাইভসহ দেখুন" : "Include archived documents"}
          </label>
          <ul className="document-list">
            {data.documents
              .filter(
                (d) =>
                  (archived || !d.archived) &&
                  [d.title, d.description, d.category, ...d.tags]
                    .join(" ")
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void open(d)}
                  >
                    {d.title}
                  </button>
                  <small>
                    {d.archived ? " · Archived" : ""} ·{" "}
                    {d.currentRevision
                      ? `v${d.currentRevision}`
                      : bn
                        ? "ফাইল এখনো প্রস্তুত নয়"
                        : "No available file"}{" "}
                    {d.category && ` · ${d.category}`}
                  </small>
                </li>
              ))}
          </ul>
          {!data.documents.length && (
            <p>
              {bn ? "এখনো কোনো নথি যোগ করা হয়নি।" : "No documents added yet."}
            </p>
          )}
          {selected && (
            <div className="document-panel" key={selected.id}>
              <h4>{selected.title}</h4>
              <p>{selected.description}</p>
              <p className="muted">{selected.tags.join(" · ")}</p>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  selection.current++;
                  setSelected(null);
                  setHistory(null);
                  request.current = {
                    fingerprint: "",
                    key: crypto.randomUUID(),
                  };
                }}
              >
                {bn ? "বন্ধ করুন / নতুন নথি" : "Close / new document"}
              </Button>
              {history ? (
                <>
                  <h4>{bn ? "ফাইলের সংস্করণ" : "File versions"}</h4>
                  {history.versions.map((v) => (
                    <div className="metadata-revision" key={v.id}>
                      <p>
                        v{v.revision} · {v.filename} ·{" "}
                        {(v.size / 1024).toFixed(1)} KB · {v.status}
                      </p>
                      {v.scanSkipped && <p className="notice">{bn ? "ম্যালওয়্যার স্ক্যান করা হয়নি" : "Not malware-scanned"}</p>}
                      {v.errorCode && <p>{v.errorCode}</p>}
                      {v.status === "available" && r.canExport && (
                        <>
                          <Button
                            type="button"
                            disabled={busy}
                            variant="secondary"
                            onClick={() => void download(v)}
                          >
                            {bn ? "ডাউনলোড" : "Download"}
                          </Button>
                          {["image/png", "image/jpeg"].includes(v.mime) && (
                            <details>
                              <summary>
                                {bn ? "ছবি দেখুন" : "Preview image"}
                              </summary>
                              <img
                                loading="lazy"
                                src={`/api/${base}/document-files/${v.id}?preview=1`}
                                alt={v.filename}
                                className="document-preview"
                              />
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  <details>
                    <summary>
                      {bn ? "পরিবর্তনের ইতিহাস" : "Metadata history"}
                    </summary>
                    {history.events.map((event) => (
                      <div key={event.id} className="metadata-revision">
                        <strong>{event.action}</strong> ·{" "}
                        {new Date(event.createdAt).toLocaleString(
                          bn ? "bn-BD" : "en-GB",
                          { timeZone: "Asia/Dhaka" },
                        )}
                        <p>{String(event.snapshot.title ?? "")}</p>
                        <p>{String(event.snapshot.description ?? "")}</p>
                        <small>
                          {String(event.snapshot.category ?? "")} ·{" "}
                          {Array.isArray(event.snapshot.tags)
                            ? event.snapshot.tags.join(", ")
                            : ""}
                        </small>
                      </div>
                    ))}
                  </details>
                  {history.hasMore && (
                    <p>Latest 100 versions and events shown.</p>
                  )}
                </>
              ) : (
                <p role="status">
                  {bn ? "ইতিহাস লোড হচ্ছে…" : "Loading history…"}
                </p>
              )}
              {editable && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void edit(e.currentTarget);
                  }}
                >
                  <fieldset disabled={busy}>
                    <legend>
                      {bn ? "নথির তথ্য সম্পাদনা" : "Edit document metadata"}
                    </legend>
                    {fields(selected)}
                    <label className="owner-check">
                      <input
                        type="checkbox"
                        name="archived"
                        defaultChecked={selected.archived}
                      />
                      {bn ? "আর্কাইভ" : "Archived"}
                    </label>
                    <Button>{bn ? "সংরক্ষণ" : "Save metadata"}</Button>
                  </fieldset>
                </form>
              )}
            </div>
          )}
          {editable && data.configured && !selected?.archived && (
            <form
              key={selected?.id ?? "new"}
              onSubmit={(e) => {
                e.preventDefault();
                void upload(e.currentTarget);
              }}
            >
              <fieldset disabled={busy}>
                <legend>
                  {selected
                    ? bn
                      ? "নতুন সংস্করণ আপলোড"
                      : "Upload replacement version"
                    : bn
                      ? "নথি যোগ করুন"
                      : "Add document"}
                </legend>
                {fields(selected)}
                <label>
                  {bn ? "ফাইল" : "File"}
                  <input
                    name="file"
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
                    onChange={() => {
                      request.current = {
                        fingerprint: "",
                        key: crypto.randomUUID(),
                      };
                    }}
                  />
                </label>
                <p className="fine-print">
                  {bn
                    ? "পুরোনো সংস্করণ সংরক্ষিত থাকবে। আপলোড শেষ না হওয়া পর্যন্ত অপেক্ষা করুন।"
                    : "Older versions are retained. Wait for the upload to finish."}
                </p>
                <Button>
                  {busy
                    ? bn
                      ? "স্ক্যান ও সংরক্ষণ হচ্ছে…"
                      : "Scanning and saving…"
                    : bn
                      ? "আপলোড"
                      : "Upload"}
                </Button>
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}
