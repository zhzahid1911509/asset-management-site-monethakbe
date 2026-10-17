"use client";
import { useState } from "react";
import { api, errorText } from "@/lib/client";
import { Button } from "@/components/button";
export default function Page() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="setup">
      <section className="setup-card">
        <span className="eyebrow">মনে থাকবে</span>
        <h1>A place in the family.</h1>
        <p>
          Sign in using the email address that received this invitation, then
          accept it here.
        </p>
        <a className="text-link" href="/auth">
          Sign in (then reopen your invitation)
        </a>
        <p>Adviser access expires after 30 days in this foundation release.</p>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("invitations/accept", "POST", {
                token: new URLSearchParams(location.search).get("token"),
              });
              history.replaceState(null, "", "/invite");
              location.assign("/app");
            } catch (e) {
              setError(errorText(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Joining…" : "Accept invitation"}
        </Button>
      </section>
    </main>
  );
}
