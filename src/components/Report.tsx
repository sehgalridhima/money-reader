"use client";

/* ===============================================================
   THE REPORT
   ===============================================================
   Everything shown here was counted, not estimated, and has already
   been checked against the bank's own totals — Reader will not
   render this component otherwise.

   The one exception is the category labels, which are a judgement
   and are marked as one. That distinction is the whole point of the
   layout: figures on the left, opinions clearly flagged.
   =============================================================== */

import { useState } from "react";
import { formatExact } from "@/lib/parse.mjs";
import Categories from "./Categories";

type Money = number;

/*
 * Two shapes, because there are two stages. parse() returns what was
 * on the page; analyse() adds who was paid, which is read out of the
 * narration afterwards. Collapsing them into one type is what the
 * first version did, and it quietly claimed a merchant existed on a
 * transaction that had not been through analyse() yet.
 */
export type RawTxn = {
  date: string;
  narration: string;
  ref: string;
  debit: Money;
  credit: Money;
  balance: Money | null;
};

export type Txn = RawTxn & {
  merchant: string | null;
  note: string | null;
  handle: string | null;
  isAutopay: boolean;
  method: string;
  key: string | null;
};

export type Parsed = {
  transactions: RawTxn[];
  summary: {
    opening: Money;
    closing: Money;
    debits: Money;
    credits: Money;
    debitCount: number;
    creditCount: number;
  } | null;
  totals: { debits: Money; credits: Money; debitCount: number; creditCount: number };
  check: { ok: boolean; problems: string[] };
};

export type Group = { key: string; name: string; total: Money; count: number; transactions: Txn[] };

export type Analysis = {
  transactions: Txn[];
  period: { from: string; to: string; days: number };
  moneyIn: Money;
  moneyOut: Money;
  net: Money;
  realIncome: Money;
  refundTotal: Money;
  byMerchant: Group[];
  incomeBySource: Group[];
  refunds: Txn[];
  largest: Txn[];
  recurring: {
    name: string;
    typical: Money;
    total: Money;
    count: number;
    evidence: string;
    certain: boolean;
  }[];
};

const day = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Report({
  parsed,
  analysis: a,
  onReset,
}: {
  parsed: Parsed;
  analysis: Analysis;
  onReset: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? a.transactions : a.transactions.slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          {day(a.period.from)} to {day(a.period.to)} · {a.period.days} days
        </p>
        <button
          onClick={onReset}
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Read another
        </button>
      </div>

      <p className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm leading-relaxed">
        Checked against the totals the bank printed on the statement: they agree exactly.
        Every figure below was counted, not estimated.
      </p>

      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label="Money in" value={a.moneyIn} tone="earn" note={`${parsed.totals.creditCount} credits`} />
        <Tile label="Money out" value={a.moneyOut} tone="spend" note={`${parsed.totals.debitCount} debits`} />
        <Tile
          label={a.net >= 0 ? "Kept" : "Overspent"}
          value={Math.abs(a.net)}
          tone={a.net >= 0 ? "earn" : "spend"}
          note={parsed.summary ? `closing ${formatExact(parsed.summary.closing)}` : undefined}
        />
      </section>

      {a.refundTotal > 0 && (
        <p className="text-sm leading-relaxed text-muted">
          Of the money in, <strong className="text-ink">{formatExact(a.realIncome)}</strong> was
          income and <strong className="text-ink">{formatExact(a.refundTotal)}</strong> was refunds
          — money coming back, not money earned.
        </p>
      )}

      <Categories analysis={a} />

      {a.recurring.length > 0 && (
        <Card title="Repeating payments">
          <ul className="divide-y divide-border">
            {a.recurring.map((r) => (
              <li key={r.name} className="flex flex-wrap items-baseline gap-x-3 py-2.5 first:pt-0 last:pb-0">
                <span className="font-medium">{r.name}</span>
                <span className="tabular text-sm text-muted">
                  about {formatExact(r.typical)} each
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
                    r.certain ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
                  }`}
                >
                  {r.certain ? "AUTOPAY mandate" : "inferred from the pattern"}
                </span>
              </li>
            ))}
          </ul>
          {a.recurring.some((r) => !r.certain) && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Only the AUTOPAY ones are certain — the bank records those as standing
              instructions. The rest are a guess from how often and how evenly they
              recurred, so check before cancelling anything.
            </p>
          )}
        </Card>
      )}

      <Card title="Where it went">
        <ul className="divide-y divide-border">
          {a.byMerchant.slice(0, 10).map((m) => (
            <li key={m.key} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {m.count > 1 && <span className="text-xs text-muted">×{m.count}</span>}
              <span className="tabular text-sm text-muted">
                {Math.round((m.total / a.moneyOut) * 100)}%
              </span>
              <span className="tabular w-24 text-right font-medium text-spend">
                {formatExact(m.total)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {a.incomeBySource.length > 0 && (
        <Card title="Where it came from">
          <ul className="divide-y divide-border">
            {a.incomeBySource.map((m) => (
              <li key={m.key} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {m.count > 1 && <span className="text-xs text-muted">×{m.count}</span>}
                <span className="tabular w-24 text-right font-medium text-earn">
                  {formatExact(m.total)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Every transaction">
        <ul className="divide-y divide-border">
          {rows.map((t, i) => (
            <li key={`${t.date}-${i}`} className="flex items-baseline gap-3 py-2 first:pt-0">
              <span className="tabular w-14 shrink-0 text-xs text-muted">{day(t.date)}</span>
              <span className="min-w-0 flex-1 truncate">{t.merchant ?? "—"}</span>
              {t.isAutopay && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.65rem] text-muted">
                  AUTOPAY
                </span>
              )}
              <span
                className={`tabular w-24 text-right font-medium ${
                  t.debit > 0 ? "text-spend" : "text-earn"
                }`}
              >
                {t.debit > 0 ? `−${formatExact(t.debit)}` : `+${formatExact(t.credit)}`}
              </span>
            </li>
          ))}
        </ul>
        {a.transactions.length > 8 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-3 text-sm text-accent underline underline-offset-4"
          >
            {showAll ? "Show fewer" : `Show all ${a.transactions.length}`}
          </button>
        )}
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: Money;
  tone: "earn" | "spend";
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold ${tone === "earn" ? "text-earn" : "text-spend"}`}>
        {formatExact(value)}
      </p>
      {note && <p className="tabular mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-3 font-medium">{title}</h2>
      {children}
    </section>
  );
}
