"use client";
import { Brand } from "@/components/brand";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <section className="setup-card">
        <Brand />
        <h1>Something needs attention.</h1>
        <p>
          We could not load this page. Your previously saved records have not
          been changed by this page error.
        </p>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
        <a className="text-link" href="/">
          Return home
        </a>
      </section>
    </main>
  );
}
