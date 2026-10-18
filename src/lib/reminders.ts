import { z } from "zod";
import { date, uuid } from "./validation";
export const recurrence = z.enum([
  "none",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);
export type Recurrence = z.infer<typeof recurrence>;
export const reminderCategories = [
  "maturity",
  "renewal",
  "payment",
  "maintenance",
  "valuation",
  "family-task",
  "other",
] as const;
export const reminderInput = z.strictObject({
  version: z.number().int().positive(),
  reminderId: uuid.optional(),
  title: z.string().trim().min(2).max(160),
  category: z.enum(reminderCategories),
  dueOn: date,
  recurrence: recurrence.default("none"),
  note: z.string().trim().max(1000).default(""),
});
export const reminderActionInput = z.strictObject({
  version: z.number().int().positive(),
  reminderId: uuid,
  action: z.enum(["complete", "cancel", "reopen"]),
});
// Date-only recurrence is anchored to the original day. Jan 31 -> Feb 28 -> Mar 31.
export function nextDueDate(
  dueOn: string,
  repeat: Recurrence,
  anchorDay: number,
): string | null {
  date.parse(dueOn);
  if (repeat === "none") return null;
  const d = new Date(dueOn + "T00:00:00Z");
  if (repeat === "daily" || repeat === "weekly")
    d.setUTCDate(d.getUTCDate() + (repeat === "daily" ? 1 : 7));
  else {
    const months = repeat === "monthly" ? 1 : repeat === "quarterly" ? 3 : 12;
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const end = new Date(d);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    d.setUTCDate(Math.min(anchorDay, end.getUTCDate()));
  }
  return date.parse(d.toISOString().slice(0, 10));
}
export function bangladeshToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
