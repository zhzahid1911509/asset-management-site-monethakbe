import { z } from "zod";
import Decimal from "decimal.js";
import { date, share, uuid } from "./validation";
export const ownershipCapacities = [
  "legal-owner",
  "beneficial-owner",
  "legal-and-beneficial",
  "manager",
  "possessor",
] as const;
export const ownerInput = z.strictObject({
  id: uuid,
  name: z.string().trim().min(1).max(120),
  capacity: z.enum(ownershipCapacities),
  legalPercent: share.optional(),
  economicPercent: share.optional(),
  includedInFamily: z.boolean(),
});
export type OwnerEntry = z.infer<typeof ownerInput>;
export const ownershipInput = z
  .strictObject({
    version: z.number().int().positive(),
    asOf: date,
    familyShare: share,
    owners: z.array(ownerInput).max(20),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((data, ctx) => {
    let legal = new Decimal(0),
      economic = new Decimal(0),
      included = new Decimal(0);
    const ids = new Set<string>();
    data.owners.forEach((o, i) => {
      const issue = (field: string, message: string) =>
        ctx.addIssue({ code: "custom", path: ["owners", i, field], message });
      if (ids.has(o.id))
        issue("id", "Each party must have a unique identifier.");
      ids.add(o.id);
      const hasLegal = ["legal-owner", "legal-and-beneficial"].includes(
        o.capacity,
      );
      const hasEconomic = ["beneficial-owner", "legal-and-beneficial"].includes(
        o.capacity,
      );
      if (o.legalPercent !== undefined && !hasLegal)
        issue(
          "legalPercent",
          "This role does not carry a legal ownership share.",
        );
      if (o.economicPercent !== undefined && !hasEconomic)
        issue("economicPercent", "This role does not carry an economic share.");
      if (
        o.includedInFamily &&
        (!hasEconomic || o.economicPercent === undefined)
      )
        issue(
          "economicPercent",
          "An included party needs an explicit economic share.",
        );
      legal = legal.plus(o.legalPercent ?? "0");
      economic = economic.plus(o.economicPercent ?? "0");
      if (o.includedInFamily)
        included = included.plus(o.economicPercent ?? "0");
    });
    if (legal.gt(100) || economic.gt(100))
      ctx.addIssue({
        code: "custom",
        path: ["owners"],
        message: "Legal and economic shares must each total no more than 100%.",
      });
    if (data.owners.length && !included.eq(data.familyShare))
      ctx.addIssue({
        code: "custom",
        path: ["familyShare"],
        message:
          "Family share must equal the included parties’ economic shares.",
      });
  });
