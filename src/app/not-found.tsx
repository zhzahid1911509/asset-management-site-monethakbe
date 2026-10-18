import { Brand } from "@/components/brand";
export default function NotFound() {
  return (
    <main className="setup">
      <section className="setup-card">
        <Brand />
        <h1>We couldn’t find that page.</h1>
        <a className="button button-primary" href="/">
          Return home
        </a>
      </section>
    </main>
  );
}
