"use client";
import { useEffect, useRef, useState } from "react";
import type {
  listReminders,
  reminderHistory,
  snapshot,
} from "@/server/service";
import { api, errorText } from "@/lib/client";
import {
  bangladeshToday,
  reminderCategories,
  type Recurrence,
} from "@/lib/reminders";
import { Button } from "./button";
type Result = Awaited<ReturnType<typeof listReminders>>;
type Row = Result["reminders"][number];
type RecordRow = Awaited<ReturnType<typeof snapshot>>["records"][number];
type Draft = {
  recordId: string;
  title: string;
  category: (typeof reminderCategories)[number];
  dueOn: string;
  recurrence: Recurrence;
  note: string;
};
const categories: Record<string, [string, string]> = {
  maturity: ["Maturity", "মেয়াদপূর্তি"],
  renewal: ["Renewal", "নবায়ন"],
  payment: ["Payment", "পরিশোধ"],
  maintenance: ["Maintenance", "রক্ষণাবেক্ষণ"],
  valuation: ["Valuation review", "মূল্যায়ন পর্যালোচনা"],
  "family-task": ["Family responsibility", "পারিবারিক দায়িত্ব"],
  other: ["Other", "অন্যান্য"],
};
const recurrences: Record<Recurrence, [string, string]> = {
  none: ["Once", "একবার"],
  daily: ["Daily", "দৈনিক"],
  weekly: ["Weekly", "সাপ্তাহিক"],
  monthly: ["Monthly", "মাসিক"],
  quarterly: ["Quarterly", "ত্রৈমাসিক"],
  yearly: ["Yearly", "বার্ষিক"],
};
const actions: Record<string, [string, string]> = {
  created: ["Created", "তৈরি"],
  updated: ["Updated", "হালনাগাদ"],
  complete: ["Occurrence completed", "নির্ধারিত কাজ সম্পন্ন"],
  cancel: ["Cancelled", "বাতিল"],
  reopen: ["Reopened", "পুনরায় চালু"],
};
function ReminderHistory({
  row,
  familyId,
  bn,
}: {
  row: Row;
  familyId: string;
  bn: boolean;
}) {
  const [open, setOpen] = useState(false),
    [history, setHistory] = useState<Awaited<
      ReturnType<typeof reminderHistory>
    > | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    api<Awaited<ReturnType<typeof reminderHistory>>>(
      `families/${familyId}/records/${row.recordId}/reminders/${row.id}`,
    )
      .then((v) => {
        if (active) setHistory(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [open, familyId, row.recordId, row.id, row.recordVersion, retry]);
  return (
    <div className="reminder-history">
      <button
        type="button"
        className="text-link"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {bn ? "ইতিহাস" : "History"}
      </button>
      {open &&
        (error ? (
          <p role="alert">
            {error}
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              {bn ? "আবার চেষ্টা" : "Retry"}
            </button>
          </p>
        ) : !history ? (
          <p role="status">{bn ? "লোড হচ্ছে…" : "Loading…"}</p>
        ) : (
          <>
            <ol>
              {history.events.map((e) => (
                <li key={e.id}>
                  <strong>{actions[e.action]?.[bn ? 1 : 0] ?? e.action}</strong>{" "}
                  · {e.snapshot.dueOn}
                  <p>{e.snapshot.title}</p>
                  {e.snapshot.note && <p>{e.snapshot.note}</p>}
                  <small>
                    {new Date(e.createdAt).toLocaleString(
                      bn ? "bn-BD" : "en-GB",
                      { timeZone: "Asia/Dhaka" },
                    )}
                  </small>
                </li>
              ))}
            </ol>
            {history.hasMore && (
              <p>
                {bn
                  ? "সর্বশেষ ১০০টি পরিবর্তন দেখানো হচ্ছে।"
                  : "Showing the latest 100 changes."}
              </p>
            )}
          </>
        ))}
    </div>
  );
}
export function Reminders({
  familyId,
  records,
  locale,
  onChanged,
  onOpenRecord,
}: {
  familyId: string;
  records: RecordRow[];
  locale: string;
  onChanged: () => void;
  onOpenRecord: (id: string) => void;
}) {
  const bn = locale === "bn",
    editable = records.filter((r) => r.canEdit && !r.archived);
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState<Row | null>(null),
    [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    recordId: editable[0]?.id ?? "",
    title: "",
    category: "other",
    dueOn: bangladeshToday(),
    recurrence: "none",
    note: "",
  });
  const [clock, setClock] = useState(bangladeshToday());
  const request = useRef({ fingerprint: "", key: crypto.randomUUID() });
  useEffect(() => {
    let active = true;
    api<Result>(`families/${familyId}/reminders`)
      .then((v) => {
        if (active) setResult(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [familyId]);
  useEffect(() => {
    const tick = () => setClock(bangladeshToday());
    const timer = setInterval(tick, 60000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  async function send(recordId: string, path: string, data: unknown) {
    const fingerprint = JSON.stringify({ recordId, path, data });
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await api(
        `families/${familyId}/records/${recordId}/${path}`,
        "POST",
        data,
        request.current.key,
      );
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const reminders = result?.reminders ?? [];
  const active = reminders.filter((r) => r.status === "active" && !r.archived);
  const due = active.filter((r) => r.dueOn <= clock);
  const visible = reminders.filter((r) =>
    filter === "all"
      ? true
      : filter === "due"
        ? r.status === "active" && !r.archived && r.dueOn <= clock
        : r.status === "active" && !r.archived,
  );
  const selected = records.find((r) => r.id === draft.recordId);
  function begin(row?: Row) {
    setEditing(row ?? null);
    setShowForm(true);
    setDraft(
      row
        ? {
            recordId: row.recordId,
            title: row.title,
            category: row.category as Draft["category"],
            dueOn: row.dueOn,
            recurrence: row.recurrence as Recurrence,
            note: row.note,
          }
        : {
            recordId: editable[0]?.id ?? "",
            title: "",
            category: "other",
            dueOn: clock,
            recurrence: "none",
            note: "",
          },
    );
    setError("");
  }
  return (
    <section className="panel reminders-panel">
      <div className="reminders-heading">
        <div>
          <h2>
            {bn ? "পরিবারের করণীয় ও রিমাইন্ডার" : "Family tasks and reminders"}
          </h2>
          <p className="muted">
            {bn
              ? "অ্যাপে দেখা যায় · তারিখ বাংলাদেশের সময় অনুযায়ী · ইমেইল বা পুশ পাঠানো হয় না।"
              : "In-app reminders · Dates use Bangladesh time · Email and push delivery are not enabled."}
          </p>
        </div>
        <Button variant="secondary" disabled={busy} onClick={onChanged}>
          {bn ? "রিফ্রেশ" : "Refresh"}
        </Button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="reminders-toolbar">
        <span className="pill">
          {bn ? "আজ বা বকেয়া" : "Due / overdue"}: {due.length}
        </span>
        <span className="pill">
          {bn ? "সক্রিয়" : "Active"}: {active.length}
        </span>
        {editable.length > 0 && (
          <Button disabled={busy} onClick={() => begin()}>
            {bn ? "রিমাইন্ডার যোগ করুন" : "Add reminder"}
          </Button>
        )}
      </div>
      {!editable.length && (
        <p className="notice">
          {bn
            ? "রিমাইন্ডার যোগ করতে সক্রিয় রেকর্ডে সম্পাদনার অনুমতি দরকার।"
            : "To add a reminder, you need edit access to an active record."}
        </p>
      )}
      {showForm && (
        <form
          className="reminder-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected)
              void send(draft.recordId, "reminders", {
                ...draft,
                recordId: undefined,
                version: editing?.recordVersion ?? selected.version,
                reminderId: editing?.id,
              });
          }}
        >
          <h3>
            {editing
              ? bn
                ? "রিমাইন্ডার সম্পাদনা"
                : "Edit reminder"
              : bn
                ? "নতুন রিমাইন্ডার"
                : "New reminder"}
          </h3>
          <fieldset disabled={busy}>
            <label>
              {bn ? "সম্পর্কিত রেকর্ড" : "Related record"}
              <select
                required
                disabled={!!editing}
                value={draft.recordId}
                onChange={(e) =>
                  setDraft({ ...draft, recordId: e.target.value })
                }
              >
                <option value="">{bn ? "নির্বাচন করুন" : "Choose"}</option>
                {editable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {bn ? "শিরোনাম" : "Title"}
              <input
                required
                minLength={2}
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                {bn ? "ধরন" : "Category"}
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as Draft["category"],
                    })
                  }
                >
                  {reminderCategories.map((c) => (
                    <option key={c} value={c}>
                      {categories[c][bn ? 1 : 0]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {bn ? "নির্ধারিত তারিখ" : "Due date"}
                <input
                  type="date"
                  required
                  value={draft.dueOn}
                  onChange={(e) =>
                    setDraft({ ...draft, dueOn: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              {bn ? "পুনরাবৃত্তি" : "Repeat"}
              <select
                value={draft.recurrence}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    recurrence: e.target.value as Recurrence,
                  })
                }
              >
                {Object.entries(recurrences).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label[bn ? 1 : 0]}
                  </option>
                ))}
              </select>
            </label>
            <p className="fine-print">
              {bn
                ? "সম্পন্ন করলে পরবর্তী তারিখ তৈরি হবে। বকেয়া কাজ স্বয়ংক্রিয়ভাবে বাদ যাবে না।"
                : "Completing an occurrence advances to the next scheduled date. Missed occurrences are not skipped automatically."}
            </p>
            <label>
              {bn ? "নোট" : "Note"}
              <textarea
                maxLength={1000}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </label>
            <div className="reminder-actions">
              <Button disabled={!selected}>
                {bn ? "সংরক্ষণ" : "Save reminder"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                {bn ? "ফর্ম বন্ধ করুন" : "Close form"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <label className="reminder-filter">
        {bn ? "দেখান" : "Show"}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="active">{bn ? "সক্রিয়" : "Active"}</option>
          <option value="due">{bn ? "আজ ও বকেয়া" : "Due and overdue"}</option>
          <option value="all">{bn ? "সব ও ইতিহাস" : "All and history"}</option>
        </select>
      </label>
      {!result && !error ? (
        <p role="status">{bn ? "লোড হচ্ছে…" : "Loading…"}</p>
      ) : !visible.length ? (
        <p className="notice">
          {bn
            ? "এই তালিকায় কোনো রিমাইন্ডার নেই।"
            : "No reminders in this view."}
        </p>
      ) : (
        <div className="reminder-list">
          {visible.map((r) => (
            <article key={r.id} className="reminder-card">
              <div className="reminders-heading">
                <h3>{r.title}</h3>
                <span className="pill">
                  {r.archived
                    ? bn
                      ? "রেকর্ড আর্কাইভ করা"
                      : "Record archived"
                    : r.status === "completed"
                      ? bn
                        ? "সম্পন্ন"
                        : "Completed"
                      : r.status === "cancelled"
                        ? bn
                          ? "বাতিল"
                          : "Cancelled"
                        : r.dueOn < clock
                          ? bn
                            ? "বকেয়া"
                            : "Overdue"
                          : r.dueOn === clock
                            ? bn
                              ? "আজ"
                              : "Today"
                            : bn
                              ? "আসন্ন"
                              : "Upcoming"}
                </span>
              </div>
              <p>
                <strong>{r.dueOn}</strong> ·{" "}
                {categories[r.category]?.[bn ? 1 : 0]} ·{" "}
                {recurrences[r.recurrence as Recurrence]?.[bn ? 1 : 0]}
              </p>
              <button
                className="text-link"
                type="button"
                onClick={() => onOpenRecord(r.recordId)}
              >
                {r.recordName}
              </button>
              {r.note && <p>{r.note}</p>}
              {r.canEdit && (
                <div className="reminder-actions">
                  {r.status === "active" ? (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void send(r.recordId, "reminder-actions", {
                            version: r.recordVersion,
                            reminderId: r.id,
                            action: "complete",
                          })
                        }
                      >
                        {bn ? "সম্পন্ন করুন" : "Complete occurrence"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => begin(r)}
                      >
                        {bn ? "সম্পাদনা" : "Edit"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void send(r.recordId, "reminder-actions", {
                            version: r.recordVersion,
                            reminderId: r.id,
                            action: "cancel",
                          })
                        }
                      >
                        {bn ? "বাতিল" : "Cancel reminder"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void send(r.recordId, "reminder-actions", {
                          version: r.recordVersion,
                          reminderId: r.id,
                          action: "reopen",
                        })
                      }
                    >
                      {bn ? "পুনরায় চালু" : "Reopen"}
                    </Button>
                  )}
                </div>
              )}
              <ReminderHistory row={r} familyId={familyId} bn={bn} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
