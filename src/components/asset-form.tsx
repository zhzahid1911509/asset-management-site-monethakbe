"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { recordInput } from "@/lib/validation";
import { api, errorText } from "@/lib/client";
import { Button } from "./button";
export type CatalogType = {
  code: string;
  categoryCode: string;
  kind: string;
  nameEn: string;
  nameBn: string;
  categoryEn: string;
  categoryBn: string;
};
export function AssetForm({
  familyId,
  catalog,
  kind,
  locale,
  onSaved,
}: {
  familyId: string;
  catalog: CatalogType[];
  kind: "asset" | "liability";
  locale: string;
  onSaved: () => void;
}) {
  const key = useRef(crypto.randomUUID()),
    [error, setError] = useState("");
  const f = useForm<
    z.input<typeof recordInput>,
    unknown,
    z.output<typeof recordInput>
  >({
    resolver: zodResolver(recordInput),
    defaultValues: {
      kind,
      name: "",
      typeCode: "",
      notes: "",
      ownershipPercent: "100",
      asOf: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(
        new Date(),
      ),
      source: "Manual estimate",
      location: "",
      lender: "",
    },
  });
  const bn = locale === "bn";
  return (
    <form
      className="record-form"
      onSubmit={f.handleSubmit(async (data) => {
        setError("");
        try {
          await api(`families/${familyId}/records`, "POST", data, key.current);
          onSaved();
        } catch (e) {
          setError(errorText(e));
        }
      })}
    >
      <p className="muted">
        {bn
          ? "প্রয়োজনীয় তথ্য দিয়ে শুরু করুন। পরে আরও তথ্য যোগ করতে পারবেন।"
          : "Start with the essentials. You can add more details later."}
      </p>
      <label>
        {bn ? "নাম" : "Record name"}
        <input
          autoFocus
          {...f.register("name")}
          placeholder={
            kind === "asset" ? "e.g. Family apartment" : "e.g. Home loan"
          }
        />
        {f.formState.errors.name && (
          <small className="field-error">
            {f.formState.errors.name.message}
          </small>
        )}
      </label>
      <label>
        {bn ? "ধরন" : "Type"}
        <select {...f.register("typeCode")}>
          <option value="">{bn ? "একটি ধরন বেছে নিন" : "Choose a type"}</option>
          {Array.from(
            new Set(
              catalog.filter((c) => c.kind === kind).map((c) => c.categoryCode),
            ),
          ).map((category) => (
            <optgroup
              key={category}
              label={
                catalog.find((c) => c.categoryCode === category)?.[
                  bn ? "categoryBn" : "categoryEn"
                ]
              }
            >
              {catalog
                .filter((c) => c.categoryCode === category && c.kind === kind)
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {bn ? c.nameBn : c.nameEn}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {f.formState.errors.typeCode && (
          <small className="field-error">Choose a type.</small>
        )}
      </label>
      <div className="form-grid">
        <label>
          {kind === "asset"
            ? bn
              ? "সম্পূর্ণ সম্পদের আনুমানিক মূল্য (৳)"
              : "Whole-asset estimated value (৳)"
            : bn
              ? "পরিবারের বকেয়া দায় (৳)"
              : "Family’s outstanding balance (৳)"}
          <input
            inputMode="decimal"
            {...f.register("amount", {
              setValueAs: (v) => (v === "" ? undefined : v),
            })}
            placeholder="0.00"
          />
          {kind === "asset" && (
            <small>
              {bn
                ? "মূল্য জানা না থাকলে খালি রাখুন।"
                : "Leave empty if unknown. Do not enter your share-adjusted value."}
            </small>
          )}
          {f.formState.errors.amount && (
            <small className="field-error">
              {f.formState.errors.amount.message}
            </small>
          )}
        </label>
        {kind === "asset" && (
          <label>
            {bn
              ? "পরিবারের অর্থনৈতিক অংশ (%)"
              : "Included family economic share (%)"}
            <input inputMode="decimal" {...f.register("ownershipPercent")} />
            {f.formState.errors.ownershipPercent && (
              <small className="field-error">
                {f.formState.errors.ownershipPercent.message}
              </small>
            )}
          </label>
        )}
      </div>
      <label>
        {bn ? "তথ্যের তারিখ" : "As-of date"}
        <input type="date" {...f.register("asOf")} />
        {f.formState.errors.asOf && (
          <small className="field-error">Choose a valid date.</small>
        )}
      </label>
      {kind === "asset" ? (
        <>
          <label>
            {bn ? "মূল্যের উৎস" : "Valuation source"}
            <input {...f.register("source")} />
          </label>
          <label>
            {bn ? "অবস্থান / প্রতিষ্ঠান" : "Location / institution"}
            <input {...f.register("location")} />
          </label>
        </>
      ) : (
        <label>
          {bn ? "ঋণদাতা" : "Lender"}
          <input {...f.register("lender")} />
        </label>
      )}
      <label>
        {bn ? "নোট" : "Notes"}
        <textarea {...f.register("notes")} rows={3} />
        <small>
          {bn
            ? "পাসওয়ার্ড, পিন বা গোপন কোড লিখবেন না।"
            : "Do not store passwords, PINs, OTPs or private keys."}
        </small>
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <Button className="full" disabled={f.formState.isSubmitting}>
        {f.formState.isSubmitting
          ? bn
            ? "সংরক্ষণ হচ্ছে…"
            : "Saving…"
          : bn
            ? "সংরক্ষণ করুন"
            : "Save record"}
      </Button>
    </form>
  );
}
