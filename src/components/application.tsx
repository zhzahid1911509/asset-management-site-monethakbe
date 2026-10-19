"use client";
import { ActivityHistory } from "./activity-history";
import { NotificationSettings } from "./notification-settings";
import { Reports } from "./reports";
import { Brand } from "@/components/brand";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Wallet,
  House,
  Landmark,
  Users,
  Settings,
  Plus,
  Search,
  Leaf,
  ArrowUpRight,
  ArrowRight,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  Download,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Globe,
  Archive,
  Bell,
} from "lucide-react";
import { createAuthClient } from "better-auth/react";
import type { snapshot } from "@/server/service";
import { api, errorText } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { Button } from "./button";
import { Modal } from "./modal";
import { AssetForm, type CatalogType } from "./asset-form";
import { RecordDetail } from "./record-detail";
import { Reminders } from "./reminders";
import { FamilyMembers } from "./family-members";
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
type Family = { id: string; name: string; role: string };
const auth = createAuthClient();
const language = {
  en: {
    overview: "Overview",
    assets: "My assets",
    property: "Property & land",
    accounts: "Accounts & investments",
    liabilities: "Liabilities",
    family: "Family members",
    reminders: "Reminders",
    settings: "Settings",
    add: "Add asset",
    workspace: "FAMILY WORKSPACE",
    welcome: "A little clarity for your family.",
    welcomeSub: "Your assets, balances and important details, in one place.",
    netWorth: "Estimated net worth",
    totalAssets: "Included asset value",
    totalLiabilities: "Recorded liabilities",
    inventory: "Your asset collection",
    all: "View all assets",
    name: "Asset / record",
    category: "Category",
    value: "Recorded value",
    share: "Family share",
    search: "Search your records…",
    empty: "A clear picture starts with one record.",
    emptySub:
      "Add an asset or a liability to begin building your family’s financial picture.",
    quick: "A good place to start",
    allocation: "What makes up your assets",
    health: "Record health",
    active: "Active records",
    unknown: "Missing valuations",
    known: "All active records have a value",
    private: "Private family workspace",
    newFamily: "Create a workspace",
    saved: "Saved successfully.",
    visible: "Based only on records you may view. Manual values · BDT.",
    archive: "Show archived",
    signout: "Sign out",
    export: "Export JSON",
  },
  bn: {
    overview: "সারসংক্ষেপ",
    assets: "আমার সম্পদ",
    property: "সম্পত্তি ও জমি",
    accounts: "হিসাব ও বিনিয়োগ",
    liabilities: "দায় ও ঋণ",
    family: "পরিবারের সদস্য",
    reminders: "রিমাইন্ডার",
    settings: "সেটিংস",
    add: "সম্পদ যোগ করুন",
    workspace: "পরিবারের কর্মক্ষেত্র",
    welcome: "পরিবারের সম্পদের পরিষ্কার চিত্র।",
    welcomeSub: "আপনার সম্পদ, হিসাব ও প্রয়োজনীয় তথ্য—এক জায়গায়।",
    netWorth: "আনুমানিক নিট সম্পদ",
    totalAssets: "অন্তর্ভুক্ত সম্পদের মূল্য",
    totalLiabilities: "নথিভুক্ত দায়",
    inventory: "আপনার সম্পদের তালিকা",
    all: "সব সম্পদ দেখুন",
    name: "সম্পদ / রেকর্ড",
    category: "বিভাগ",
    value: "নথিভুক্ত মূল্য",
    share: "পরিবারের অংশ",
    search: "আপনার রেকর্ড খুঁজুন…",
    empty: "একটি রেকর্ড দিয়েই শুরু হোক।",
    emptySub: "পরিবারের আর্থিক চিত্র তৈরি করতে একটি সম্পদ বা দায় যোগ করুন।",
    quick: "শুরু করার সহজ উপায়",
    allocation: "সম্পদের বিভাগসমূহ",
    health: "রেকর্ডের অবস্থা",
    active: "সক্রিয় রেকর্ড",
    unknown: "মূল্য দেওয়া হয়নি",
    known: "সব সক্রিয় রেকর্ডে মূল্য আছে",
    private: "ব্যক্তিগত পারিবারিক কর্মক্ষেত্র",
    newFamily: "কর্মক্ষেত্র তৈরি করুন",
    saved: "সফলভাবে সংরক্ষিত হয়েছে।",
    visible: "শুধু আপনার দেখার অনুমতি আছে এমন রেকর্ড। আনুমানিক মূল্য · টাকা।",
    archive: "আর্কাইভ দেখুন",
    signout: "সাইন আউট",
    export: "JSON এক্সপোর্ট",
  },
};
type Section =
  | "overview"
  | "assets"
  | "property"
  | "accounts"
  | "liabilities"
  | "family"
  | "reminders"
  | "settings";
export function Application({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [families, setFamilies] = useState<Family[]>([]),
    [familyId, setFamilyId] = useState(""),
    [data, setData] = useState<Snapshot | null>(null),
    [catalog, setCatalog] = useState<CatalogType[]>([]),
    [section, setSection] = useState<Section>("overview"),
    [locale, setLocale] = useState<"en" | "bn">("bn"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [add, setAdd] = useState<"asset" | "liability" | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [newFamily, setNewFamily] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("view") === "reminders") setSection("reminders");
  }, []);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    const sidebar = sidebarRef.current;
    const sync = () => {
      if (sidebar) sidebar.inert = media.matches && !mobile;
      if (!media.matches && mobile) setMobile(false);
    };
    sync();
    media.addEventListener("change", sync);
    if (!mobile) return () => media.removeEventListener("change", sync);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar?.querySelector<HTMLButtonElement>(".mobile-nav-close")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobile(false); }
      if (event.key !== "Tab" || !sidebar) return;
      const items = Array.from(sidebar.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), select:not(:disabled), [tabindex="0"]'
      )).filter(item => item.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", sync);
      if (media.matches) menuRef.current?.focus();
    };
  }, [mobile]);
  const sequence = useRef(0);
  const t = language[locale],
    bn = locale === "bn";
  const refresh = useCallback(async () => {
    if (!familyId) return;
    const seq = ++sequence.current;
    setLoading(true);
    try {
      const d = await api<Snapshot>(`families/${familyId}/snapshot`);
      if (seq !== sequence.current) return;
      setData(d);
      setLocale(d.preferences.locale === "en" ? "en" : "bn");
      setError("");
    } catch (e) {
      if (seq === sequence.current) setError(errorText(e));
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [familyId]);
  useEffect(() => {
    let active = true;
    Promise.all([api<Family[]>("families"), api<CatalogType[]>("catalog")])
      .then(([f, c]) => {
        if (!active) return;
        setFamilies(f);
        setCatalog(c);
        setFamilyId(
          f.some(
            (item) =>
              item.id === new URLSearchParams(location.search).get("family"),
          )
            ? new URLSearchParams(location.search).get("family")!
            : (f[0]?.id ?? ""),
        );
        if (!f.length) setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setData(null);
    setDetail(null);
    setAdd(null);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  async function prefs(nextLocale: "en" | "bn", mode: string) {
    if (!data) return;
    setBusy(true);
    try {
      await api(`families/${familyId}/preferences`, "PUT", {
        locale: nextLocale,
        mode,
      });
      setLocale(nextLocale);
      setData({ ...data, preferences: { locale: nextLocale, mode } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const rows = (data?.records ?? [])
    .filter(
      (r) =>
        (archived || !r.archived) &&
        (section === "liabilities"
          ? r.kind === "liability"
          : section === "property"
            ? r.categoryCode === "property"
            : section === "accounts"
              ? ["cash", "investments"].includes(r.categoryCode)
              : section === "assets"
                ? r.kind === "asset"
                : true),
    )
    .filter((r) =>
      `${r.name} ${r.typeNameEn} ${r.typeNameBn}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const nav = [
    ["overview", LayoutDashboard],
    ["assets", Wallet],
    ["property", House],
    ["accounts", Landmark],
    ["liabilities", Archive],
    ["family", Users],
    ["reminders", Bell],
  ] as const;
  const title =
    section === "overview"
      ? bn
        ? "পরিবারের সারসংক্ষেপ"
        : "Family overview"
      : t[section];
  const selected = data?.records.find((r) => r.id === detail);
  const categories = Array.from(
    new Set(
      (data?.records ?? [])
        .filter((r) => r.kind === "asset" && !r.archived)
        .map((r) => r.categoryCode),
    ),
  )
    .map((code) => {
      const matches = data!.records.filter(
        (r) => r.categoryCode === code && !r.archived,
      );
      return {
        code,
        name: matches[0][bn ? "categoryBn" : "categoryEn"],
        count: matches.length,
      };
    })
    .sort((a, b) => b.count - a.count);
  function saved() {
    setAdd(null);
    setDetail(null);
    setNotice(t.saved);
    void refresh();
  }
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside ref={sidebarRef} id="workspace-navigation" aria-label="Workspace navigation" className={"sidebar " + (mobile ? "open" : "")}>
        <button type="button" className="icon-button mobile-nav-close" aria-label="Close navigation" onClick={() => setMobile(false)}><X /></button>
        <Brand href="/app" />
        <div className="workspace-picker">
          <span className="mini-label">{t.workspace}</span>
          <select
            aria-label="Family workspace"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            {families.length === 0 && (
              <option value="">
                {bn ? "এখনও কর্মক্ষেত্র নেই" : "No workspace yet"}
              </option>
            )}
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([key, Icon]) => (
            <button
              key={key}
              className={section === key ? "active" : ""}
              onClick={() => {
                setSection(key);
                setQuery("");
                setMobile(false);
              }}
            >
              <Icon size={19} />
              {t[key]}
              {section === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={21} />
            <div>
              <strong>
                {bn
                  ? "পরিবারের জন্য, ব্যক্তিগত"
                  : "For your family. Privately."}
              </strong>
              <p>
                {bn
                  ? "অনুমতিই নির্ধারণ করে কে কী দেখতে পাবে।"
                  : "Access is controlled per workspace and record."}
              </p>
            </div>
          </div>
          <button
            className={
              "side-settings " + (section === "settings" ? "active" : "")
            }
            onClick={() => {
              setSection("settings");
              setMobile(false);
            }}
          >
            <Settings size={18} />
            {t.settings}
          </button>
          <div className="user-strip">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{data?.membership.role ?? "Member"}</small>
            </span>
            <button
              className="icon-button"
              aria-label={t.signout}
              onClick={async () => {
                await auth.signOut();
                location.assign("/auth");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main" inert={mobile}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              ref={menuRef}
              aria-controls="workspace-navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>{bn ? "কর্মক্ষেত্র" : "Workspace"}</span>
            <ChevronRight size={14} />
            <b>{t[section]}</b>
          </div>
          <div className="top-actions">
            <span className="private-label">
              <span /> {t.private}
            </span>
            <button
              disabled={busy || !data}
              className="language-button"
              onClick={() =>
                prefs(bn ? "en" : "bn", data?.preferences.mode ?? "simple")
              }
            >
              <Globe size={15} />
              {bn ? "EN" : "বাংলা"}
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {bn
                  ? "সবকিছু একটু গুছিয়ে রাখুন"
                  : "A LITTLE MORE PEACE OF MIND"}
              </span>
              <h1>{title}</h1>
              <p>
                {section === "overview"
                  ? t.welcomeSub
                  : bn
                    ? "পরিবারের প্রয়োজনীয় তথ্য গুছিয়ে রাখুন।"
                    : "Keep your family’s important details in order."}
              </p>
            </div>
            {data?.canCreate && section !== "reminders" && (
              <Button
                onClick={() =>
                  setAdd(section === "liabilities" ? "liability" : "asset")
                }
              >
                <Plus size={18} />
                {section === "liabilities"
                  ? bn
                    ? "দায় যোগ করুন"
                    : "Add liability"
                  : t.add}
              </Button>
            )}
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <Button variant="ghost" onClick={() => void refresh()}>
                {bn ? "আবার চেষ্টা" : "Retry"}
              </Button>
            </div>
          )}
          {notice && (
            <div className="notice success" role="status">
              <CheckCircle2 size={16} />
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-state" role="status">
              {bn ? "কর্মক্ষেত্র লোড হচ্ছে…" : "Loading your workspace…"}
            </div>
          ) : !familyId ? (
            <section className="empty-state">
              <div className="empty-icon">
                <House size={35} />
              </div>
              <h2>
                {bn
                  ? "পরিবারের একটি নিজস্ব জায়গা।"
                  : "A space of your family’s own."}
              </h2>
              <p>
                {bn
                  ? "প্রথম কর্মক্ষেত্র তৈরি করে সম্পদ যোগ করা শুরু করুন।"
                  : "Create your first family workspace to begin adding records."}
              </p>
              <Button onClick={() => setNewFamily(true)}>
                <Plus size={17} />
                {t.newFamily}
              </Button>
            </section>
          ) : (
            data && (
              <>
                {section === "overview" && (
                  <>
                    <section className="metric-grid">
                      <article className="metric featured">
                        <div>
                          <span>{t.netWorth}</span>
                          <span className="metric-icon">
                            <ArrowUpRight size={20} />
                          </span>
                        </div>
                        <h2>{formatMoney(data.totals.netWorth, locale)}</h2>
                        <p>
                          {data.totals.unknown
                            ? bn
                              ? "অসম্পূর্ণ — কিছু মূল্য দেওয়া হয়নি"
                              : "Incomplete — some values are missing"
                            : bn
                              ? "সম্পদের মূল্য বিয়োগ নথিভুক্ত দায়"
                              : "Included assets less recorded liabilities"}
                        </p>
                        <div className="metric-decoration" />
                      </article>
                      <article className="metric">
                        <div>
                          <span>{t.totalAssets}</span>
                          <span className="metric-icon">
                            <Wallet size={19} />
                          </span>
                        </div>
                        <h2>{formatMoney(data.totals.assets, locale)}</h2>
                        <p>
                          {bn
                            ? "পরিবারের অংশ অনুযায়ী গণনা"
                            : "Adjusted for the included family share"}
                        </p>
                      </article>
                      <article className="metric">
                        <div>
                          <span>{t.totalLiabilities}</span>
                          <span className="metric-icon amber">
                            <Landmark size={19} />
                          </span>
                        </div>
                        <h2>{formatMoney(data.totals.liabilities, locale)}</h2>
                        <p>
                          {bn
                            ? "আপনার নথিভুক্ত বকেয়া"
                            : "Balances entered by your family"}
                        </p>
                      </article>
                    </section>
                    <p className="estimate-note">{t.visible}</p>
                    <div className="overview-grid">
                      <section className="panel allocation">
                        <header>
                          <h2>{t.allocation}</h2>
                          <span className="pill">
                            {bn ? "রেকর্ড সংখ্যা" : "By record count"}
                          </span>
                        </header>
                        {categories.length ? (
                          <div className="allocation-list">
                            {categories.slice(0, 5).map((c, i) => (
                              <div key={c.code}>
                                <div className="allocation-label">
                                  <span>
                                    <i
                                      style={{
                                        background: [
                                          "#326b5e",
                                          "#9da98c",
                                          "#c5a36d",
                                          "#798c9a",
                                          "#ad8f8a",
                                        ][i],
                                      }}
                                    />
                                    {c.name}
                                  </span>
                                  <b>{c.count}</b>
                                </div>
                                <div className="bar-track">
                                  <span
                                    style={{
                                      width: `${(c.count / (data.records.filter((r) => r.kind === "asset" && !r.archived).length || 1)) * 100}%`,
                                      background: [
                                        "#326b5e",
                                        "#9da98c",
                                        "#c5a36d",
                                        "#798c9a",
                                        "#ad8f8a",
                                      ][i],
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mini-empty">
                            <FolderOpen size={30} />
                            <p>
                              {bn
                                ? "সম্পদ যোগ করলে বিভাগগুলো এখানে দেখা যাবে।"
                                : "Your categories will appear as you add assets."}
                            </p>
                          </div>
                        )}
                      </section>
                      <section className="panel health">
                        <header>
                          <h2>{t.health}</h2>
                          <ShieldCheck size={20} />
                        </header>
                        <div className="health-row">
                          <span>{t.active}</span>
                          <strong>
                            {data.records.filter((r) => !r.archived).length}
                          </strong>
                        </div>
                        <div className="health-row">
                          <span>{t.unknown}</span>
                          <strong>{data.totals.unknown}</strong>
                        </div>
                        <div className="health-note">
                          {data.totals.unknown ? (
                            <AlertCircle size={18} />
                          ) : (
                            <CheckCircle2 size={18} />
                          )}
                          <p>
                            {data.totals.unknown
                              ? bn
                                ? "একটি রেকর্ড খুলে মূল্য যোগ করুন।"
                                : "Open a record to add a valuation."
                              : data.records.length
                                ? t.known
                                : bn
                                  ? "প্রথম রেকর্ডের জন্য প্রস্তুত।"
                                  : "Ready for your first record."}
                          </p>
                        </div>
                      </section>
                    </div>
                  </>
                )}
                {[
                  "overview",
                  "assets",
                  "property",
                  "accounts",
                  "liabilities",
                ].includes(section) && (
                  <section className="panel inventory">
                    <header>
                      <h2>
                        {section === "overview" ? t.inventory : t[section]}
                      </h2>
                      {section === "overview" ? (
                        <button
                          className="text-link"
                          onClick={() => setSection("assets")}
                        >
                          {t.all}
                          <ArrowRight size={15} />
                        </button>
                      ) : (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={archived}
                            onChange={(e) => setArchived(e.target.checked)}
                          />
                          {t.archive}
                        </label>
                      )}
                    </header>
                    <div className="table-toolbar">
                      <div className="search-field">
                        <Search size={17} />
                        <input
                          aria-label={t.search}
                          placeholder={t.search}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <span className="muted">
                        {rows.length} {bn ? "রেকর্ড" : "records"}
                      </span>
                    </div>
                    {rows.length ? (
                      <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records table">
                        <table>
                          <thead>
                            <tr>
                              <th>{t.name}</th>
                              <th>{t.category}</th>
                              <th>{t.value}</th>
                              <th>{t.share}</th>
                              <th>
                                <span className="sr-only">Open</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows
                              .slice(
                                0,
                                section === "overview" ? 6 : rows.length,
                              )
                              .map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    <button
                                      className="record-name"
                                      onClick={() => setDetail(r.id)}
                                    >
                                      <span
                                        className={
                                          "record-icon " +
                                          (r.kind === "liability"
                                            ? "amber"
                                            : "")
                                        }
                                      >
                                        {r.categoryCode === "property" ? (
                                          <House size={18} />
                                        ) : r.kind === "liability" ? (
                                          <Landmark size={18} />
                                        ) : (
                                          <Wallet size={18} />
                                        )}
                                      </span>
                                      <span>
                                        <strong>{r.name}</strong>
                                        <small>
                                          {bn ? r.typeNameBn : r.typeNameEn}
                                          {r.archived ? " · Archived" : ""}
                                        </small>
                                      </span>
                                    </button>
                                  </td>
                                  <td>
                                    <span className="category-label">
                                      {bn ? r.categoryBn : r.categoryEn}
                                    </span>
                                  </td>
                                  <td className="amount">
                                    {r.amount === null ? (
                                      <span className="pill warning">
                                        {bn
                                          ? "মূল্য দেওয়া হয়নি"
                                          : "Not valued"}
                                      </span>
                                    ) : (
                                      formatMoney(r.amount, locale)
                                    )}
                                  </td>
                                  <td>
                                    {r.kind === "asset"
                                      ? `${parseFloat(r.ownershipPercent)}%`
                                      : "—"}
                                  </td>
                                  <td>
                                    <button
                                      className="icon-button"
                                      aria-label={`${bn ? "খুলুন" : "Open"} ${r.name}`}
                                      onClick={() => setDetail(r.id)}
                                    >
                                      <ArrowUpRight size={17} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state compact">
                        <div className="empty-icon">
                          <FolderOpen size={29} />
                        </div>
                        <h3>
                          {query
                            ? bn
                              ? "কোনো রেকর্ড পাওয়া যায়নি।"
                              : "No matching records."
                            : t.empty}
                        </h3>
                        <p>
                          {query
                            ? bn
                              ? "অন্য নামে খুঁজুন।"
                              : "Try a different search."
                            : t.emptySub}
                        </p>
                        {data.canCreate && !query && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setAdd(
                                section === "liabilities"
                                  ? "liability"
                                  : "asset",
                              )
                            }
                          >
                            <Plus size={16} />
                            {section === "liabilities"
                              ? bn
                                ? "দায় যোগ করুন"
                                : "Add liability"
                              : t.add}
                          </Button>
                        )}
                      </div>
                    )}
                  </section>
                )}
                {section === "reminders" && (
                  <Reminders
                    key={familyId}
                    familyId={familyId}
                    records={data.records}
                    locale={locale}
                    onChanged={() => void refresh()}
                    onOpenRecord={setDetail}
                  />
                )}
                {section === "family" && (
                  <FamilyMembers
                    familyId={familyId}
                    role={data.membership.role}
                    locale={locale}
                  />
                )}
                {section === "settings" && (
                  <div className="settings-grid">
                    <section className="panel settings-panel">
                      <h2>{bn ? "আপনার পছন্দ" : "Your preferences"}</h2>
                      <label>
                        {bn ? "ভাষা" : "Language"}
                        <select
                          value={locale}
                          disabled={busy}
                          onChange={(e) =>
                            prefs(
                              e.target.value as "en" | "bn",
                              data.preferences.mode,
                            )
                          }
                        >
                          <option value="bn">বাংলা</option>
                          <option value="en">English</option>
                        </select>
                      </label>
                      <label>
                        {bn ? "প্রদর্শনের ধরন" : "Display mode"}
                        <select
                          value={data.preferences.mode}
                          disabled={busy}
                          onChange={(e) => prefs(locale, e.target.value)}
                        >
                          <option value="simple">Simple</option>
                          <option value="advanced">Advanced</option>
                        </select>
                        <small>
                          {bn
                            ? "Advanced মোডে রেকর্ডের আইডি ও সংস্করণ দেখা যায়।"
                            : "Advanced mode reveals record identifiers and versions in details."}
                        </small>
                      </label>
                      <Button
                        variant="secondary"
                        onClick={() => setNewFamily(true)}
                      >
                        <Plus size={16} />
                        {t.newFamily}
                      </Button>
                    </section>
                    <section className="panel settings-panel">
                      <h2>{bn ? "তথ্য এক্সপোর্ট" : "Your data, portable"}</h2>
                      <p className="muted">
                        {bn
                          ? "শুধু আপনার দেখার ও এক্সপোর্ট করার অনুমতি আছে এমন বর্তমান রেকর্ড।"
                          : "Download current records you have permission to view and export. This is not a full backup."}
                      </p>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const result = await api(
                              `families/${familyId}/export`,
                              "POST",
                              {},
                            );
                            const url = URL.createObjectURL(
                              new Blob([JSON.stringify(result, null, 2)], {
                                type: "application/json",
                              }),
                            );
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = "monethakbe-records.json";
                            link.click();
                            URL.revokeObjectURL(url);
                          } catch (e) {
                            setError(errorText(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Download size={16} />
                        {t.export}
                      </Button>
                    </section>
                    <Reports
                      key={`reports:${familyId}`}
                      familyId={familyId}
                      locale={locale}
                      categories={Array.from(
                        new Map(
                          data.records.map((r) => [
                            r.categoryCode,
                            {
                              code: r.categoryCode,
                              name: bn ? r.categoryBn : r.categoryEn,
                            },
                          ]),
                        ).values(),
                      )}
                    />
                    {["owner", "administrator"].includes(data.membership.role) && <ActivityHistory key={`activity:${familyId}`} familyId={familyId} locale={locale} />}
                    <NotificationSettings
                      key={familyId}
                      familyId={familyId}
                      locale={locale}
                    />
                    <section className="panel settings-panel span-two">
                      <h2>
                        {bn ? "এই সংস্করণে যা আছে" : "Foundation release"}
                      </h2>
                      <p>
                        {bn
                          ? "সম্পদ, মালিকানা, মূল্যায়ন, দায়-পরিশোধ ও সংশোধন, অ্যাপের রিমাইন্ডার এবং পরিবারের প্রবেশাধিকার কার্যকর করা হয়েছে।"
                          : "Assets, co-owners, valuations, repayments and corrections, in-app reminders, family membership and record permissions are implemented."}
                      </p>
                      <p className="muted">
                        {bn
                          ? "Google Drive, AI, পুশ রিমাইন্ডার, বহুমুদ্রা ও পূর্ণাঙ্গ ব্যাকআপ পরবর্তী পর্যায়ে।"
                          : "Google Drive, AI, push reminders, multiple currencies and full backup/restore remain for later phases."}
                      </p>
                    </section>
                  </div>
                )}
              </>
            )
          )}
          <footer className="app-footer">
            <span>
              <Brand href="/app" />
              {bn
                ? "যত্নে রাখুন, মনে রাখুন।"
                : "A little care for everything that matters."}
            </span>
            <span>Version 0.10.0</span>
          </footer>
        </main>
      </div>
      {add && (
        <Modal
          title={
            add === "asset" ? t.add : bn ? "দায় যোগ করুন" : "Add liability"
          }
          onClose={() => {
            if (
              confirm(
                bn
                  ? "এই ফর্ম বন্ধ করবেন? সংরক্ষণ না করা তথ্য হারাবে।"
                  : "Close this form? Unsaved entries will be lost.",
              )
            )
              setAdd(null);
          }}
        >
          <AssetForm
            familyId={familyId}
            kind={add}
            catalog={catalog}
            locale={locale}
            onSaved={saved}
          />
        </Modal>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setDetail(null)}>
          <RecordDetail
            record={selected}
            familyId={familyId}
            locale={locale}
            role={data!.membership.role}
            advanced={data!.preferences.mode === "advanced"}
            onSaved={saved}
          />
        </Modal>
      )}
      {newFamily && (
        <Modal title={t.newFamily} onClose={() => setNewFamily(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name");
              setBusy(true);
              try {
                const f = await api<Family>("families", "POST", { name });
                setFamilies(await api<Family[]>("families"));
                setFamilyId(f.id);
                setNewFamily(false);
                setSection("overview");
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {bn ? "পরিবারের নাম" : "Family name"}
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoFocus
                placeholder={bn ? "আমাদের পরিবার" : "Our family"}
              />
            </label>
            <Button className="full" disabled={busy}>
              {busy ? "…" : t.newFamily}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
