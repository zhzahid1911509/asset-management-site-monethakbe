import { z } from "zod";
import { reminderCategories } from "./reminders";
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const notificationDefaults = {
  enabled: false,
  categories: [...reminderCategories],
  advanceDays: [0, 1, 7],
  timeZone: "Asia/Dhaka",
  sendAt: "09:00",
  quietEnabled: true,
  quietStart: "22:00",
  quietEnd: "07:00",
  version: 0,
};
export function quietAt(time: string, start: string, end: string) {
  return start < end
    ? time >= start && time < end
    : time >= start || time < end;
}
export const notificationInput = z
  .strictObject({
    enabled: z.boolean(),
    categories: z
      .array(z.enum(reminderCategories))
      .max(7)
      .transform((v) => [...new Set(v)]),
    advanceDays: z
      .array(z.number().int().min(0).max(30))
      .min(1)
      .max(4)
      .transform((v) => [...new Set(v)].sort((a, b) => a - b)),
    timeZone: z
      .string()
      .min(1)
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid time zone."),
    sendAt: clock,
    quietEnabled: z.boolean(),
    quietStart: clock,
    quietEnd: clock,
    version: z.number().int().min(0),
  })
  .superRefine((v, ctx) => {
    if (v.enabled && !v.categories.length)
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Select at least one reminder category.",
      });
    if (
      v.quietEnabled &&
      (v.quietStart === v.quietEnd ||
        quietAt(v.sendAt, v.quietStart, v.quietEnd))
    )
      ctx.addIssue({
        code: "custom",
        path: ["sendAt"],
        message:
          "Choose a delivery time outside quiet hours; quiet hours must have different start/end times.",
      });
  });
export function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function dateDistance(from: string, to: string) {
  return Math.round(
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
      86400000,
  );
}
export function deliveryWindow(
  p: Omit<z.infer<typeof notificationInput>, "version">,
  now: Date,
) {
  const clock = localClock(now, p.timeZone);
  return {
    ...clock,
    open:
      p.enabled &&
      clock.time >= p.sendAt &&
      !(p.quietEnabled && quietAt(clock.time, p.quietStart, p.quietEnd)),
  };
}
