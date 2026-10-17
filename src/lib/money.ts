import Decimal from "decimal.js";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export function totals(
  rows: {
    kind: string;
    amount: string | null;
    ownershipPercent: string;
    archived: boolean;
  }[],
) {
  let assets = new Decimal(0),
    liabilities = new Decimal(0),
    unknown = 0;
  for (const r of rows) {
    if (r.archived) continue;
    if (r.amount === null) {
      unknown++;
      continue;
    }
    const value = new Decimal(r.amount);
    if (r.kind === "asset")
      assets = assets.plus(value.times(r.ownershipPercent).div(100));
    else liabilities = liabilities.plus(value);
  }
  return {
    assets: assets.toFixed(2),
    liabilities: liabilities.toFixed(2),
    netWorth: assets.minus(liabilities).toFixed(2),
    unknown,
  };
}
export function formatMoney(value: string, locale = "en") {
  const [whole, fraction] = new Decimal(value).toFixed(2).split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const groups = whole.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = `${sign}৳${groups}.${fraction}`;
  return locale === "bn"
    ? out.replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)])
    : out;
}
