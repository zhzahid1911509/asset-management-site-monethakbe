import { Brand } from "@/components/brand";
import { Leaf, ArrowUpRight, CheckCircle2, Circle } from "lucide-react";
export function Setup({ checks }: { checks: Record<string, boolean> }) {
  return (
    <main className="setup">
      <Brand />
      <section className="setup-card">
        <span className="eyebrow">FAMILY ASSET MANAGEMENT</span>
        <h1>
          Your family’s records.
          <br />
          <em>A place to begin.</em>
        </h1>
        <p>
          The application is installed. Connect the required services to enable
          secure sign-in and persistent family records.
        </p>
        <div className="setup-checks">
          {Object.entries(checks).map(([name, ready]) => (
            <div key={name}>
              {ready ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              <span>
                {(
                  {
                    database: "Neon PostgreSQL",
                    authSecret: "Authentication secret",
                    origin: "Application origin",
                    email: "Email delivery",
                    encryption: "Email queue encryption",
                  } as Record<string, string>
                )[name] ?? name}
              </span>
              <b>{ready ? "Configured" : "Required"}</b>
            </div>
          ))}
        </div>
        <p className="notice">
          Configuration presence is checked here; live connectivity and database
          migrations still need verification. No family data has been created.
        </p>
        <h3>Complete setup</h3>
        <ol>
          <li>
            Follow the included README and populate the server environment.
          </li>
          <li>
            Run <code>npm run db:migrate</code> and <code>npm run db:seed</code>
            .
          </li>
          <li>
            Start <code>npm run worker:email</code>, then restart the web app.
          </li>
        </ol>
        <a
          className="text-link"
          href="https://neon.com/docs/get-started-with-neon/signing-up"
          target="_blank"
          rel="noreferrer"
        >
          Neon setup documentation <ArrowUpRight size={15} />
        </a>
      </section>
      <p className="fine-print">
        No demo balances, public records, or simulated connections.
      </p>
    </main>
  );
}
