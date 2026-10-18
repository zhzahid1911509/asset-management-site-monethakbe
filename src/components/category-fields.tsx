"use client";
import { useId } from "react";
import { detailFields } from "@/lib/record-details";
export function CategoryFields({
  category,
  values,
  onChange,
  locale,
  disabled = false,
}: {
  category: string;
  values: Record<string, string>;
  onChange?: (values: Record<string, string>) => void;
  locale: string;
  disabled?: boolean;
}) {
  const prefix = useId(),
    bn = locale === "bn",
    fields = detailFields[category] ?? [];
  if (!onChange)
    return (
      <dl className="metadata-values">
        {fields
          .filter((f) => values[f.key])
          .map((f) => (
            <div key={f.key}>
              <dt>{bn ? f.bn : f.en}</dt>
              <dd>{values[f.key]}</dd>
            </div>
          ))}
      </dl>
    );
  return (
    <div>
      <p className="muted">
        {bn
          ? "সব তথ্য ঐচ্ছিক। পাসওয়ার্ড, পিন, OTP বা পূর্ণ হিসাব নম্বর লিখবেন না।"
          : "All fields are optional. Never enter passwords, PINs, OTPs or full account numbers."}
      </p>
      {category === "property" && (
        <p className="fine-print">
          {bn
            ? "জমির একক স্থানভেদে বদলাতে পারে। এখানে স্বয়ংক্রিয় রূপান্তর করা হয় না।"
            : "Land units may vary by locality. No automatic conversion is applied."}
        </p>
      )}
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.key} htmlFor={`${prefix}-${f.key}`}>
            {bn ? f.bn : f.en}
            {f.type === "select" ? (
              <select
                id={`${prefix}-${f.key}`}
                disabled={disabled}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  onChange({ ...values, [f.key]: e.target.value })
                }
              >
                <option value="">{bn ? "নির্বাচন করুন" : "Choose"}</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${prefix}-${f.key}`}
                disabled={disabled}
                type={f.type === "date" ? "date" : "text"}
                inputMode={
                  ["decimal", "percent", "money"].includes(f.type)
                    ? "decimal"
                    : f.type === "year"
                      ? "numeric"
                      : undefined
                }
                maxLength={f.type === "last4" || f.type === "year" ? 4 : 250}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  onChange({ ...values, [f.key]: e.target.value })
                }
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
