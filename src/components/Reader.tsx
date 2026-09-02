"use client";

/* ===============================================================
   THE READER
   ===============================================================
   Picks up a file, opens it (asking for a password only if the PDF
   turns out to want one), reconciles what it read against the bank's
   own totals, and hands the result to Report.

   Nothing here posts the file anywhere. The only network call the
   whole app can make is the optional category lookup, which is sent
   payee names and no money — see Report.
   =============================================================== */

import { useRef, useState } from "react";
import { readRowsInBrowser, needsPassword, wrongPassword, type Row } from "@/lib/pdf-browser";
import { parse } from "@/lib/parse.mjs";
import { analyse } from "@/lib/analyse.mjs";
import Report, { type Analysis, type Parsed } from "./Report";

type Stage =
  | { name: "idle" }
  | { name: "reading" }
  | { name: "locked"; wrong: boolean }
  | { name: "done"; parsed: Parsed; analysis: Analysis }
  | { name: "failed"; message: string; detail?: string[] };

export default function Reader() {
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const [password, setPassword] = useState("");
  const bytes = useRef<ArrayBuffer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function open(buffer: ArrayBuffer, pass?: string) {
    setStage({ name: "reading" });
    let pages: Row[][];

    try {
      ({ pages } = await readRowsInBrowser(buffer, pass));
    } catch (error) {
      if (needsPassword(error)) return setStage({ name: "locked", wrong: false });
      if (wrongPassword(error)) return setStage({ name: "locked", wrong: true });
      return setStage({
        name: "failed",
        message: "That file could not be opened as a PDF.",
        detail: [String((error as Error)?.message ?? error)],
      });
    }

    const parsed = parse(pages) as Parsed;

    if (!parsed.transactions.length) {
      return setStage({
        name: "failed",
        message: "No transactions found in that statement.",
        detail: [
          "The columns are read from the statement's own header row, so a",
          "layout this has not seen simply finds nothing rather than",
          "guessing. It was built against an HDFC statement.",
        ],
      });
    }

    /*
     * The gate. The bank prints its own totals at the foot of the
     * statement, which is an independent answer to the same question
     * — so if our arithmetic disagrees with it, the report would be
     * wrong in ways the reader could not see, and the honest thing is
     * to show the disagreement instead.
     */
    if (!parsed.check.ok) {
      return setStage({
        name: "failed",
        message: "This statement did not add up.",
        detail: parsed.check.problems,
      });
    }

    setPassword("");
    setStage({ name: "done", parsed, analysis: analyse(parsed.transactions) as Analysis });
  }

  async function take(file: File | undefined) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      return setStage({
        name: "failed",
        message: "That is not a PDF.",
        detail: ["Banks email statements as PDFs. A screenshot cannot be used — see below."],
      });
    }
    const buffer = await file.arrayBuffer();
    bytes.current = buffer;
    await open(buffer);
  }

  /*
   * The sample is a static file served by this site, so fetching it
   * is not the user's statement going anywhere — it is a download,
   * not an upload. Once it arrives it is read by exactly the same
   * code path as a real one.
   */
  async function trySample() {
    setStage({ name: "reading" });
    try {
      const response = await fetch("/sample-statement.pdf");
      const buffer = await response.arrayBuffer();
      bytes.current = buffer;
      await open(buffer);
    } catch {
      setStage({
        name: "failed",
        message: "Could not load the sample.",
      });
    }
  }

  const reset = () => {
    bytes.current = null;
    setPassword("");
    setStage({ name: "idle" });
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <section className="mt-8">
      {(stage.name === "idle" || stage.name === "failed") && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void take(e.dataTransfer.files[0]);
          }}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft" : "border-border bg-surface"
          }`}
        >
          <p className="text-[0.95rem]">Drop your statement PDF here</p>
          <p className="mt-1 text-sm text-muted">or</p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Choose a file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => void take(e.target.files?.[0])}
          />

          {/* So the site can be judged before anyone risks their own
              statement on it — which is the right order for a page
              asking to be trusted with a bank statement. */}
          <p className="mt-4 text-sm text-muted">
            or{" "}
            <button
              type="button"
              onClick={() => void trySample()}
              className="underline underline-offset-4 hover:text-ink"
            >
              try a made-up sample statement
            </button>{" "}
            first
          </p>
        </div>
      )}

      {stage.name === "reading" && (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          Reading…
        </p>
      )}

      {stage.name === "locked" && (
        <form
          className="rounded-2xl border border-border bg-surface p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (bytes.current && password) void open(bytes.current, password);
          }}
        >
          <h2 className="font-medium">This statement is password protected</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Banks commonly use your date of birth as <code>DDMMYYYY</code>, your PAN in
            capitals, or the first four letters of your name followed by <code>DDMM</code>.
            The covering email usually says which.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            What you type is used here in this tab to unlock the file and is not sent
            anywhere or stored.
          </p>

          {stage.wrong && (
            <p className="mt-3 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
              That password did not open it. Nothing was changed and there is no lockout —
              try again.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="min-w-0 flex-1 rounded-lg border border-border bg-page px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!password}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Unlock
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {stage.name === "failed" && (
        <div className="mt-4 rounded-2xl border border-warn/40 bg-warn-soft p-5">
          <h2 className="font-medium text-warn">{stage.message}</h2>
          {stage.detail && (
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-warn">
              {stage.detail.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-warn">
            Your file is untouched, and nothing was sent anywhere.
          </p>
        </div>
      )}

      {stage.name === "done" && (
        <Report parsed={stage.parsed} analysis={stage.analysis} onReset={reset} />
      )}
    </section>
  );
}
