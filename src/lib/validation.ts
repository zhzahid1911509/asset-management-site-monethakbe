import { z } from "zod";
export const uuid = z.string().uuid();
export const money = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,17})(\.\d{1,2})?$/,
    "Use a positive amount with at most two decimal places.",
  );
export const share = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,6})?$/)
  .refine(
    (v) => Number(v) >= 0 && Number(v) <= 100,
    "Ownership must be between 0 and 100.",
  );
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Choose a valid date.");
export const recordInput = z
  .object({
    kind: z.enum(["asset", "liability"]),
    typeCode: z.string().min(1).max(100),
    name: z.string().trim().min(2).max(160),
    notes: z.string().max(3000).default(""),
    amount: money.optional(),
    ownershipPercent: share.default("100"),
    asOf: date,
    source: z.string().trim().min(1).max(200).default("Manual estimate"),
    location: z.string().max(200).default(""),
    lender: z.string().max(200).default(""),
  })
  .refine((v) => v.kind !== "liability" || v.amount !== undefined, {
    path: ["amount"],
    message: "An outstanding balance is required.",
  });
export type RecordInput = z.infer<typeof recordInput>;
export const patchInput = z.object({
  name: z.string().trim().min(2).max(160),
  notes: z.string().max(3000),
  version: z.number().int().positive(),
});
export const valuationInput = z.object({
  amount: money,
  asOf: date,
  source: z.string().trim().min(1).max(200),
  version: z.number().int().positive(),
});
export const role = z.enum([
  "administrator",
  "asset-manager",
  "member",
  "read-only",
  "adviser",
]);

export const paymentInput = z.object({
  principal: money,
  interest: money.default("0"),
  fees: money.default("0"),
  paidOn: date,
  note: z.string().trim().max(1000).default(""),
  version: z.number().int().positive(),
});
