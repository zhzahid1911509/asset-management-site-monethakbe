import { z } from "zod";
import { date, money, share } from "./validation";
export type DetailField = {
  key: string;
  en: string;
  bn: string;
  type:
    | "text"
    | "date"
    | "money"
    | "decimal"
    | "percent"
    | "year"
    | "last4"
    | "select";
  options?: readonly string[];
};
const field = (
  key: string,
  en: string,
  bn: string,
  type: DetailField["type"] = "text",
  options?: readonly string[],
): DetailField => ({ key, en, bn, type, options });
const acquisition = [
  field("acquiredOn", "Acquisition date", "অর্জনের তারিখ", "date"),
  field("cost", "Acquisition cost (BDT)", "অর্জনমূল্য (৳)", "money"),
];
export const detailFields: Record<string, readonly DetailField[]> = {
  cash: [
    field("institution", "Institution", "প্রতিষ্ঠান"),
    field(
      "accountLast4",
      "Account reference (last 4 characters only)",
      "হিসাবের শেষ ৪ অক্ষর",
      "last4",
    ),
    field("holder", "Account holder", "হিসাবধারী"),
    field("openedOn", "Opening date", "খোলার তারিখ", "date"),
    field("maturesOn", "Maturity date", "মেয়াদপূর্তির তারিখ", "date"),
    field(
      "interestRate",
      "Annual interest rate (%)",
      "বার্ষিক সুদের হার (%)",
      "percent",
    ),
    field(
      "maturityAmount",
      "Estimated maturity amount (BDT)",
      "আনুমানিক মেয়াদপূর্তি মূল্য (৳)",
      "money",
    ),
  ],
  investments: [
    field("institution", "Broker / institution", "ব্রোকার / প্রতিষ্ঠান"),
    field("symbol", "Symbol / reference", "প্রতীক / রেফারেন্স"),
    field("units", "Units", "ইউনিট", "decimal"),
    ...acquisition,
    field("fees", "Acquisition fees (BDT)", "অর্জন ফি (৳)", "money"),
    field(
      "dividends",
      "Recorded dividends (BDT)",
      "নথিভুক্ত লভ্যাংশ (৳)",
      "money",
    ),
  ],
  property: [
    field("division", "Division", "বিভাগ"),
    field("district", "District", "জেলা"),
    field("upazila", "Upazila", "উপজেলা"),
    field("address", "Address / locality", "ঠিকানা / এলাকা"),
    field("mouza", "Mouza", "মৌজা"),
    field("jlNumber", "JL number", "জেএল নম্বর"),
    field("dagNumber", "Dag / plot number", "দাগ / প্লট নম্বর"),
    field("khatian", "Khatian reference", "খতিয়ান রেফারেন্স"),
    field("deedNumber", "Deed number", "দলিল নম্বর"),
    field("registeredOn", "Registration date", "নিবন্ধনের তারিখ", "date"),
    field("registryOffice", "Registration office", "নিবন্ধন অফিস"),
    field("mutation", "Mutation / namjari reference", "নামজারি রেফারেন্স"),
    field(
      "landTax",
      "Land development tax reference",
      "ভূমি উন্নয়ন কর রেফারেন্স",
    ),
    field("holdingTax", "Holding tax reference", "হোল্ডিং কর রেফারেন্স"),
    field("landClass", "Land classification", "জমির শ্রেণি"),
    field("area", "Area", "জমির পরিমাণ", "decimal"),
    field(
      "areaUnit",
      "Area unit (no automatic conversion)",
      "একক (স্বয়ংক্রিয় রূপান্তর নয়)",
      "select",
      [
        "decimal/shotok",
        "katha",
        "bigha",
        "acre",
        "square-feet",
        "square-metre",
      ],
    ),
    field(
      "unitDefinition",
      "Local unit definition / source",
      "স্থানীয় এককের সংজ্ঞা / উৎস",
    ),
    ...acquisition,
  ],
  vehicles: [
    field("registration", "Registration number", "নিবন্ধন নম্বর"),
    field("model", "Make / model", "ব্র্যান্ড / মডেল"),
    field("year", "Model year", "মডেলের বছর", "year"),
    field("chassis", "Chassis number", "চ্যাসিস নম্বর"),
    field("engine", "Engine number", "ইঞ্জিন নম্বর"),
    ...acquisition,
    field("fitnessExpiresOn", "Fitness expiry", "ফিটনেস মেয়াদ", "date"),
    field(
      "taxTokenExpiresOn",
      "Tax token expiry",
      "ট্যাক্স টোকেন মেয়াদ",
      "date",
    ),
    field("insuranceExpiresOn", "Insurance expiry", "বীমার মেয়াদ", "date"),
    field(
      "serviceDueOn",
      "Next service date",
      "পরবর্তী সার্ভিসের তারিখ",
      "date",
    ),
  ],
  valuables: [
    field("quantity", "Quantity", "পরিমাণ", "decimal"),
    field("weight", "Weight", "ওজন", "decimal"),
    field("weightUnit", "Weight unit", "ওজনের একক", "select", [
      "gram",
      "kilogram",
      "bhori",
      "tola",
      "carat",
    ]),
    field("purity", "Purity / grade", "বিশুদ্ধতা / মান"),
    field("storage", "Storage location", "সংরক্ষণের স্থান"),
    field("appraisal", "Appraisal reference", "মূল্যায়ন রেফারেন্স"),
    ...acquisition,
  ],
  business: [
    field("businessName", "Business name", "ব্যবসার নাম"),
    field("registration", "Registration reference", "নিবন্ধন রেফারেন্স"),
    field(
      "tradeLicense",
      "Trade licence reference",
      "ট্রেড লাইসেন্স রেফারেন্স",
    ),
    field("licenseExpiresOn", "Licence expiry", "লাইসেন্সের মেয়াদ", "date"),
    ...acquisition,
    field(
      "income",
      "Recorded business income (BDT)",
      "নথিভুক্ত ব্যবসায়িক আয় (৳)",
      "money",
    ),
  ],
  benefits: [
    field("provider", "Provider", "প্রদানকারী"),
    field(
      "policyLast4",
      "Policy reference (last 4 characters)",
      "পলিসির শেষ ৪ অক্ষর",
      "last4",
    ),
    field("coveredPerson", "Covered person", "বীমাকৃত ব্যক্তি"),
    field("beneficiary", "Beneficiary", "সুবিধাভোগী"),
    field("premium", "Premium (BDT)", "প্রিমিয়াম (৳)", "money"),
    field("coverage", "Coverage amount (BDT)", "কভারেজ (৳)", "money"),
    field("maturesOn", "Maturity date", "মেয়াদপূর্তির তারিখ", "date"),
    field("renewalOn", "Renewal date", "নবায়নের তারিখ", "date"),
    field("valueBasis", "Value basis", "মূল্যের ভিত্তি", "select", [
      "manual-estimate",
      "provider-confirmed",
    ]),
  ],
  liabilities: [
    field(
      "originalPrincipal",
      "Original principal (BDT)",
      "প্রাথমিক মূলধন (৳)",
      "money",
    ),
    field(
      "interestRate",
      "Annual interest rate (%)",
      "বার্ষিক সুদের হার (%)",
      "percent",
    ),
    field("startsOn", "Start date", "শুরুর তারিখ", "date"),
    field("maturesOn", "Maturity date", "মেয়াদপূর্তির তারিখ", "date"),
    field(
      "installment",
      "Scheduled installment (BDT)",
      "নির্ধারিত কিস্তি (৳)",
      "money",
    ),
    field("frequency", "Payment frequency", "কিস্তির সময়কাল", "select", [
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "on-demand",
      "other",
    ]),
    field("collateral", "Collateral reference", "জামানত রেফারেন্স"),
  ],
  household: [
    field("model", "Make / model", "ব্র্যান্ড / মডেল"),
    field("serialNumber", "Serial number", "সিরিয়াল নম্বর"),
    field("supplier", "Supplier", "সরবরাহকারী"),
    field("condition", "Condition", "অবস্থা", "select", [
      "new",
      "good",
      "fair",
      "needs-repair",
    ]),
    ...acquisition,
    field("warrantyExpiresOn", "Warranty expiry", "ওয়ারেন্টির মেয়াদ", "date"),
    field(
      "maintenanceDueOn",
      "Maintenance due",
      "রক্ষণাবেক্ষণের তারিখ",
      "date",
    ),
  ],
  digital: [
    field("provider", "Provider", "প্রদানকারী"),
    field("domain", "Domain / product name", "ডোমেইন / পণ্যের নাম"),
    field(
      "licenseLast4",
      "Licence reference (last 4 characters)",
      "লাইসেন্সের শেষ ৪ অক্ষর",
      "last4",
    ),
    field("renewalOn", "Renewal date", "নবায়নের তারিখ", "date"),
    field("renewalCost", "Renewal cost (BDT)", "নবায়ন খরচ (৳)", "money"),
    ...acquisition,
  ],
  rights: [
    field("registration", "Registration reference", "নিবন্ধন রেফারেন্স"),
    field("counterparty", "Counterparty", "অপর পক্ষ"),
    field("startsOn", "Start date", "শুরুর তারিখ", "date"),
    field("expiresOn", "Expiry date", "মেয়াদ শেষের তারিখ", "date"),
    field(
      "royalty",
      "Recorded royalty (BDT)",
      "নথিভুক্ত রয়্যালটি (৳)",
      "money",
    ),
    ...acquisition,
  ],
  rural: [
    field("quantity", "Quantity", "পরিমাণ", "decimal"),
    field("quantityUnit", "Quantity unit", "পরিমাণের একক"),
    field("breed", "Breed / variety", "জাত / প্রজাতি"),
    field("location", "Farm location", "খামারের অবস্থান"),
    field("condition", "Condition", "অবস্থা"),
    ...acquisition,
  ],
  transfers: [
    field("transferStatus", "Transfer status", "হস্তান্তরের অবস্থা", "select", [
      "pending",
      "in-progress",
      "completed",
      "disputed",
    ]),
    field("transferor", "Transferor / estate", "হস্তান্তরকারী / এস্টেট"),
    field("recipient", "Recipient", "গ্রহীতা"),
    field("transferOn", "Transfer date", "হস্তান্তরের তারিখ", "date"),
    field("legalReference", "Legal document reference", "আইনি নথির রেফারেন্স"),
    ...acquisition,
  ],
  additional: [
    field("reference", "Reference", "রেফারেন্স"),
    field("counterparty", "Counterparty", "অপর পক্ষ"),
    field("quantity", "Quantity", "পরিমাণ", "decimal"),
    field("quantityUnit", "Quantity unit", "পরিমাণের একক"),
    field("dueOn", "Due date", "নির্ধারিত তারিখ", "date"),
    ...acquisition,
  ],
};
export const decimalValue = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,17})(\.\d{1,6})?$/,
    "Use a non-negative number with up to six decimal places.",
  );
export function parseDetails(
  category: string,
  input: unknown,
): Record<string, string> {
  const fields = detailFields[category];
  if (!fields) throw new Error("Unsupported detail category");
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    const schema =
      f.type === "date"
        ? date
        : f.type === "money"
          ? money
          : f.type === "percent"
            ? share
            : f.type === "decimal"
              ? decimalValue
              : f.type === "year"
                ? z
                    .string()
                    .regex(
                      /^(18|19|20|21)\d{2}$/,
                      "Use a year between 1800 and 2199.",
                    )
                : f.type === "last4"
                  ? z
                      .string()
                      .regex(
                        /^[A-Za-z0-9]{4}$/,
                        "Enter exactly the last four letters or digits.",
                      )
                  : f.type === "select"
                    ? z.enum(f.options as [string, ...string[]])
                    : z.string().trim().min(1).max(250);
    shape[f.key] = z.union([z.literal(""), schema]).optional();
  }
  const result = z.strictObject(shape).parse(input) as Record<string, string>;
  const cleaned = Object.fromEntries(
    Object.entries(result).filter(([, v]) => v !== undefined && v !== ""),
  );
  const issues: z.core.$ZodIssue[] = [];
  for (const [start, end] of [
    ["openedOn", "maturesOn"],
    ["startsOn", "maturesOn"],
    ["startsOn", "expiresOn"],
  ]) {
    if (cleaned[start] && cleaned[end] && cleaned[start] > cleaned[end])
      issues.push({
        code: "custom",
        path: [end],
        message: "The end date must be on or after the start date.",
      });
  }
  if (
    category === "property" &&
    Boolean(cleaned.area) !== Boolean(cleaned.areaUnit)
  )
    issues.push({
      code: "custom",
      path: [cleaned.area ? "areaUnit" : "area"],
      message: "Enter both land area and its unit.",
    });
  if (
    category === "property" &&
    ["katha", "bigha"].includes(cleaned.areaUnit) &&
    !cleaned.unitDefinition
  )
    issues.push({
      code: "custom",
      path: ["unitDefinition"],
      message:
        "Describe the local unit definition or source; no universal conversion is assumed.",
    });
  if (issues.length) throw new z.ZodError(issues);
  return cleaned;
}
