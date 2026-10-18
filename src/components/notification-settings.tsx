"use client";
import { useEffect, useState } from "react";
import type { notificationSettings } from "@/server/notifications";
import { notificationDefaults, notificationInput } from "@/lib/notifications";
import { reminderCategories } from "@/lib/reminders";
import { api, errorText } from "@/lib/client";
import { Button } from "./button";
type Result = Awaited<ReturnType<typeof notificationSettings>>;
const names = {
  maturity: "মেয়াদপূর্তি",
  renewal: "নবায়ন",
  payment: "পরিশোধ",
  maintenance: "রক্ষণাবেক্ষণ",
  valuation: "মূল্যায়ন",
  "family-task": "পারিবারিক দায়িত্ব",
  other: "অন্যান্য",
};
const statuses: Record<string, string> = {
  pending: "Queued",
  processing: "Sending",
  sent: "Accepted by email provider",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
};
export function NotificationSettings({
  familyId,
  locale,
}: {
  familyId: string;
  locale: string;
}) {
  const bn = locale === "bn",
    path = `families/${familyId}/notifications`;
  const [result, setResult] = useState<Result | null>(null),
    [draft, setDraft] = useState<Result["preferences"]>(notificationDefaults),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api<Result>(path)
      .then((value) => {
        if (active) {
          setResult(value);
          setDraft(value.preferences);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [path, reload]);
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = notificationInput.safeParse(draft);
      if (!parsed.success)
        throw new Error(parsed.error.issues.map((x) => x.message).join(" "));
      const response = await api<{ version: number }>(path, "PUT", parsed.data);
      setDraft((old) => ({ ...old, version: response.version }));
      setResult((old) =>
        old
          ? {
              ...old,
              preferences: { ...parsed.data, version: response.version },
            }
          : old,
      );
      setMessage(
        bn
          ? "আপনার রিমাইন্ডার সেটিংস সংরক্ষিত হয়েছে।"
          : "Your reminder settings were saved.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel span-two notification-settings">
      <h2>{bn ? "ইমেইল রিমাইন্ডার" : "Email reminders"}</h2>
      <p className="muted">
        {bn
          ? "এই সেটিংস শুধু এই পরিবারের জন্য আপনার নিজের ইমেইলে প্রযোজ্য। অন্য সদস্যদের সেটিংস বদলাবে না।"
          : "These settings apply to your own email for this family only. Each member chooses their own preferences."}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => setReload((n) => n + 1)}
      >
        {bn ? "সেটিংস ও অবস্থা রিফ্রেশ" : "Reload settings and status"}
      </Button>
      {!result ? (
        <p role="status">{bn ? "লোড হচ্ছে…" : "Loading…"}</p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={busy}>
              <label className="owner-check">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft({ ...draft, enabled: e.target.checked })
                  }
                />
                {bn
                  ? "আমাকে রিমাইন্ডার ইমেইল পাঠান"
                  : "Send me reminder emails"}
              </label>
              <p className="fine-print">
                {bn
                  ? "যাচাইকৃত ইমেইলে পাঠানো হবে। ইমেইলে ব্যক্তিগত রেকর্ডের নাম, অর্থের পরিমাণ বা নথি থাকবে না।"
                  : "Messages go to your verified email. Record names, amounts and document details are kept out of the email."}
              </p>
              <fieldset>
                <legend>
                  {bn ? "রিমাইন্ডারের বিভাগ" : "Reminder categories"}
                </legend>
                <div className="notification-checks">
                  {reminderCategories.map((category) => (
                    <label className="owner-check" key={category}>
                      <input
                        type="checkbox"
                        checked={draft.categories.includes(category)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            categories: e.target.checked
                              ? [...draft.categories, category]
                              : draft.categories.filter((c) => c !== category),
                          })
                        }
                      />
                      {bn ? names[category] : category.replaceAll("-", " ")}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>
                  {bn
                    ? "কত দিন আগে (সর্বোচ্চ ৪টি)"
                    : "Advance notice (up to 4 choices)"}
                </legend>
                <div className="notification-checks">
                  {[0, 1, 3, 7, 14, 30].map((day) => (
                    <label className="owner-check" key={day}>
                      <input
                        type="checkbox"
                        checked={draft.advanceDays.includes(day)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            advanceDays: e.target.checked
                              ? [...draft.advanceDays, day]
                              : draft.advanceDays.filter((d) => d !== day),
                          })
                        }
                      />
                      {day === 0
                        ? bn
                          ? "নির্ধারিত দিনে"
                          : "On due date"
                        : `${day} ${bn ? "দিন আগে" : "days before"}`}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="form-grid">
                <label>
                  {bn ? "টাইম জোন" : "Time zone"}
                  <input
                    required
                    list="notification-zones"
                    value={draft.timeZone}
                    onChange={(e) =>
                      setDraft({ ...draft, timeZone: e.target.value })
                    }
                  />
                  <datalist id="notification-zones">
                    {[
                      "Asia/Dhaka",
                      "Asia/Kolkata",
                      "Asia/Dubai",
                      "Europe/London",
                      "America/New_York",
                      "UTC",
                    ].map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                </label>
                <label>
                  {bn ? "পছন্দের সময়" : "Preferred send time"}
                  <input
                    required
                    type="time"
                    value={draft.sendAt}
                    onChange={(e) =>
                      setDraft({ ...draft, sendAt: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="owner-check">
                <input
                  type="checkbox"
                  checked={draft.quietEnabled}
                  onChange={(e) =>
                    setDraft({ ...draft, quietEnabled: e.target.checked })
                  }
                />
                {bn ? "নীরব সময় চালু" : "Enable quiet hours"}
              </label>
              <div className="form-grid">
                <label>
                  {bn ? "নীরব সময় শুরু" : "Quiet hours start"}
                  <input
                    required
                    type="time"
                    value={draft.quietStart}
                    onChange={(e) =>
                      setDraft({ ...draft, quietStart: e.target.value })
                    }
                  />
                </label>
                <label>
                  {bn ? "নীরব সময় শেষ" : "Quiet hours end"}
                  <input
                    required
                    type="time"
                    value={draft.quietEnd}
                    onChange={(e) =>
                      setDraft({ ...draft, quietEnd: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="fine-print">
                {bn
                  ? "নীরব সময়ের বাইরে পাঠানোর সময় বেছে নিন। নির্ধারিত দিনে ওই সময়ের পর পাঠানো হয়; বিলম্ব হতে পারে। মিস হওয়া আগের দিনের ইমেইল পরে পাঠানো হয় না।"
                  : "Choose a send time outside quiet hours. Messages are queued at or after that time on the scheduled day; delays are possible. Missed days are not backfilled."}
              </p>
              <Button disabled={busy}>
                {busy
                  ? bn
                    ? "সংরক্ষণ হচ্ছে…"
                    : "Saving…"
                  : bn
                    ? "পছন্দ সংরক্ষণ"
                    : "Save preferences"}
              </Button>
            </fieldset>
          </form>
          <h3>
            {bn ? "সাম্প্রতিক ইমেইলের অবস্থা" : "Recent reminder email status"}
          </h3>
          <p className="fine-print">
            {bn
              ? "ইমেইল সেবাদাতা গ্রহণ করেছে মানেই ইনবক্সে পৌঁছেছে এমন নয়।"
              : "Provider acceptance does not confirm inbox delivery. Reload to update statuses."}
          </p>
          {!result.deliveries.length ? (
            <p>
              {bn
                ? "এখনো কোনো রিমাইন্ডার ইমেইল কিউতে নেই।"
                : "No reminder emails queued yet."}
            </p>
          ) : (
            <ul className="notification-history">
              {result.deliveries.map((d) => (
                <li key={d.id}>
                  <strong>{d.reminderTitle}</strong>
                  <p>
                    {d.recordName} · {d.dueOn} · {d.advanceDays}{" "}
                    {bn ? "দিন আগে" : "days before"}
                  </p>
                  <span className="pill">
                    {statuses[d.status ?? ""] ?? "Queued"}
                  </span>
                  <small>
                    {" "}
                    ·{" "}
                    {new Date(d.createdAt).toLocaleString(
                      bn ? "bn-BD" : "en-GB",
                      { timeZone: result.preferences.timeZone },
                    )}
                  </small>
                  {d.errorCode && <p className="fine-print">{d.errorCode}</p>}
                </li>
              ))}
            </ul>
          )}
          {result.hasMore && (
            <p>
              {bn
                ? "সর্বশেষ ১০০টি প্রচেষ্টা দেখানো হচ্ছে, অনুমতি অনুযায়ী।"
                : "Showing the latest 100 attempts, filtered by your current permissions."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
