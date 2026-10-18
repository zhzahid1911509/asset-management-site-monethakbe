"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [installed, setInstalled] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(
        mode.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    update();
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
      setMessage("Installed. Open Mone Thakbe from your home screen.");
    };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", done);
    mode.addEventListener("change", update);
    if ("serviceWorker" in navigator && window.isSecureContext)
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* Installation instructions remain available. */
        });
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", done);
      mode.removeEventListener("change", update);
    };
  }, []);
  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(
        choice.outcome === "accepted"
          ? "Installation requested. Follow your browser's instructions."
          : "Installation dismissed. You can use your browser menu to install later.",
      );
      setPrompt(null);
    } catch {
      setMessage("Use your browser menu or the instructions below to install.");
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="install-panel" aria-label="Install Mone Thakbe">
      <details>
        <summary>
          📱{" "}
          {installed
            ? "অ্যাপ ইনস্টল করা আছে · App installed"
            : "অ্যাপ ইনস্টল করুন · Install on Android / iPhone"}
        </summary>
        <div className="install-content">
          <h2>মনে থাকবে, আপনার হোম স্ক্রিনে।</h2>
          <p>
            Add Mone Thakbe to your home screen for quick access. An internet
            connection is required to sign in and use your records.
          </p>
          {installed ? (
            <p role="status">You are using the installed app.</p>
          ) : prompt ? (
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => void install()}
            >
              {busy ? "Opening…" : "Install app"}
            </button>
          ) : (
            <p>
              The install option depends on your browser. Use the steps below if
              no install button appears.
            </p>
          )}
          <div className="install-grid">
            <section>
              <h3>Android</h3>
              <ol>
                <li>Open this website in Chrome.</li>
                <li>
                  Open the ⋮ menu and choose <strong>Install app</strong> or{" "}
                  <strong>Add to Home screen</strong>, when available.
                </li>
                <li>Confirm the installation.</li>
              </ol>
            </section>
            <section>
              <h3>iPhone / iPad</h3>
              <ol>
                <li>Open this website in Safari.</li>
                <li>
                  Tap <strong>Share</strong>, then{" "}
                  <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Enable <strong>Open as Web App</strong> if shown, then tap{" "}
                  <strong>Add</strong>.
                </li>
              </ol>
            </section>
          </div>
          <p className="fine-print">
            If you opened a link inside another app, open it in Chrome or Safari
            first. Installation requires a secure HTTPS website (localhost is
            supported for development).
          </p>
          {message && <p role="status">{message}</p>}
        </div>
      </details>
    </aside>
  );
}
