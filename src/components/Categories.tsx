"use client";

/* ===============================================================
   WHAT IT WAS SPENT ON
   ===============================================================
   Most payees are named by a list that ships with the page, so this
   section fills in immediately and offline. What is left is the
   unfamiliar tail, and for those the user is shown the exact names
   that would be sent and asked — rather than the page quietly making
   a network call on their behalf with their statement open.

   That consent step is not decoration. On a page whose main claim is
   "your statement never leaves this tab", an unannounced request is
   the one thing that would undermine it.
   =============================================================== */

import { useMemo, useState } from "react";
import { formatExact } from "@/lib/parse.mjs";
import { classifyLocally } from "@/lib/classify.mjs";
import type { Analysis, Group } from "./Report";

type Label = { category: string; sure: boolean; from: "list" | "shape" | "model" };

export default function Categories({ analysis: a }: { analysis: Analysis }) {
  const [asked, setAsked] = useState<Record<string, Label>>({});
  const [state, setState] = useState<"idle" | "asking" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(false);

  const local = useMemo(() => {
    const out: Record<string, Label> = {};
    for (const g of [...a.byMerchant, ...a.incomeBySource]) {
      const hit = classifyLocally(g.name, g.key);
      if (hit) out[g.name] = hit as Label;
    }
    return out;
  }, [a]);

  const labels = { ...local, ...asked };
  const unknown = a.byMerchant.filter((g) => !labels[g.name]);

  /*
   * Each category carries its own payees with their amounts, so the
   * separate "Where it went" card could go. It was showing the same
   * spending a second time, one level down, which is a card's worth
   * of page for no extra fact.
   */
  const groups = useMemo(() => {
    const totals = new Map<string, { total: number; payees: Group[]; unsure: boolean }>();
    for (const m of a.byMerchant) {
      const hit = labels[m.name];
      if (!hit) continue;
      const g = totals.get(hit.category) ?? { total: 0, payees: [], unsure: false };
      g.total += m.total;
      g.payees.push(m);
      if (!hit.sure) g.unsure = true;
      totals.set(hit.category, g);
    }
    return [...totals.entries()].sort((x, y) => y[1].total - x[1].total);
  }, [a, labels]);

  async function lookUp() {
    setState("asking");
    setError(null);
    try {
      const response = await fetch("/api/categorise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: unknown.map((g) => g.name), hints: hintsFor(unknown) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "That did not work.");
        return setState("failed");
      }
      const next: Record<string, Label> = {};
      for (const [name, hit] of Object.entries(data.categories ?? {})) {
        const h = hit as { category: string; sure: boolean };
        next[name] = { ...h, from: "model" };
      }
      setAsked((prev) => ({ ...prev, ...next }));
      setState("idle");
    } catch {
      setError("Could not reach the category service.");
      setState("failed");
    }
  }

  const unknownTotal = unknown.reduce((n, g) => n + g.total, 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-medium">What it was spent on</h2>

      {groups.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {groups.map(([name, g]) => (
            <li key={name} className="py-2.5 first:pt-0">
              <details className="group">
                <summary className="flex cursor-pointer items-baseline gap-3 list-none">
                  <span className="min-w-0 flex-1">
                    {/* A caret, so it is visible that these open. The
                        first version put a bare payee count here, which
                        read as a stray number rather than an affordance. */}
                    <span className="mr-1.5 inline-block text-xs text-muted transition-transform group-open:rotate-90">
                      ›
                    </span>
                    {name}
                    {g.unsure && <span className="ml-1 text-muted">*</span>}
                    {g.payees.length > 1 && (
                      <span className="ml-1.5 text-xs text-muted">
                        {g.payees.length} payees
                      </span>
                    )}
                  </span>
                  <span className="tabular text-sm text-muted">
                    {Math.round((g.total / a.moneyOut) * 100)}%
                  </span>
                  <span className="tabular w-24 text-right font-medium text-spend">
                    {formatExact(g.total)}
                  </span>
                </summary>
                <ul className="mt-1.5 space-y-1 pl-3">
                  {g.payees.map((p) => (
                    <li key={p.key} className="flex items-baseline gap-3 text-sm text-muted">
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {p.count > 1 && <span className="text-xs">×{p.count}</span>}
                      <span className="tabular w-24 text-right">{formatExact(p.total)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}

      {unknown.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-page p-4">
          <p className="text-sm">
            <strong className="font-medium">
              {unknown.length} payee{unknown.length === 1 ? "" : "s"}
            </strong>{" "}
            ({formatExact(unknownTotal)}) {unknown.length === 1 ? "isn’t" : "aren’t"} in the
            built-in list. Naming {unknown.length === 1 ? "it" : "them"} means sending{" "}
            {unknown.length === 1 ? "the name" : "the names"} — nothing else.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {state !== "failed" && (
              <button
                onClick={() => void lookUp()}
                disabled={state === "asking"}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {state === "asking" ? "Looking up…" : "Name these for me"}
              </button>
            )}
            <button
              onClick={() => setShowNames(!showNames)}
              className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              {showNames ? "Hide" : "See what gets sent"}
            </button>
          </div>

          {showNames && (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">
              {unknown.map((g) => nameLine(g)).join("\n")}
            </pre>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
              {error}
            </p>
          )}
        </div>
      )}

      {groups.some(([, g]) => g.unsure) && (
        <p className="mt-3 text-xs text-muted">
          * this one is a guess. Every figure on the page is counted; only the labels are
          opinions.
        </p>
      )}
    </section>
  );
}

/*
 * The payment handle and note, which say what a name alone cannot:
 * EURONET SERVICES IND is an ATM operator, but money collected at
 * GPAYRECHARGE2 was a phone recharge. Neither field contains an
 * amount, so this stays inside the same line — names and words, never
 * money.
 */
const GENERIC = /^(upi|upiintent|payment|collect|pay|na|null)$/i;

function contextFor(group: Group): string | null {
  const useful = (s: string | null) => s && s.length < 40 && !GENERIC.test(s);
  const bits: string[] = [];
  for (const t of group.transactions) {
    if (useful(t.handle)) bits.push(t.handle as string);
    if (useful(t.note)) bits.push(t.note as string);
  }
  const hint = [...new Set(bits)].slice(0, 2).join(", ");
  return hint || null;
}

function hintsFor(groups: Group[]): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const g of groups) {
    const hint = contextFor(g);
    if (hint) hints[g.name] = hint;
  }
  return hints;
}

function nameLine(group: Group): string {
  const hint = contextFor(group);
  return hint ? `${group.name} — context: "${hint}"` : group.name;
}
