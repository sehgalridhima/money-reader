# Money Reader

Reads a bank statement PDF and says where the money went: what came
in, what went out, which payments repeat, and what it was all spent
on.

Runs entirely on your own machine. Nothing is uploaded, and the
statement never leaves the folder you put it in.

## Running it

```bash
npm install
npm start
```

It looks for `./statement.pdf` (or pass a path: `npm start -- ~/Downloads/mine.pdf`).
If the PDF is password protected it asks, reads the password straight
from the terminal without echoing it, and forgets it when the process
exits. Nothing writes it to disk.

## The rule this is built on

**Every number is counted in code. The model is never asked one.**

A wrong total in a money tool is the worst kind of wrong — it looks
like an answer and nobody can tell it isn't one. So all of it —
totals, per-payee sums, repeating payments, the balance walk — is
arithmetic in `analyse.mjs`, done in whole paise (`0.1 + 0.2` is not
`0.3` in binary floating point, and a statement is hundreds of
additions).

The one genuine judgement is *what kind of thing* a payee is. No
amount of parsing tells you that SWIGGY LIMITED is food and LAWSIKHO
is education, so that part — and only that part — goes to Claude.

## What the model is sent

Payee names, and the payment handle or note where one exists:

```
SWIGGY LIMITED — context: "SWIGGY1ONLINE.GPAY"
EURONET SERVICES IND — context: "GPAYRECHARGE2"
```

It is **not** sent amounts, dates, balances, your account number, your
name, or how many times anything appeared. A statement of 20
transactions sends about 15 short strings.

That handle is worth passing: EURONET SERVICES IND is an ATM operator,
but this payment was collected at `GPAYRECHARGE2`, so it was a phone
recharge — and the category comes out as a bill rather than a cash
withdrawal.

Answers are cached in `categories.json`, so the second run of a month
is free and a new month only asks about payees never seen before.
Costs roughly ₹1.50 for a fresh statement.

## It checks itself before it says anything

HDFC prints its own totals at the foot of the statement — opening
balance, number of debits and credits, the sum of each, closing
balance. That is an independent answer to the same question, so the
parser compares its arithmetic against the bank's and **refuses to
print a report that disagrees**:

```
STATEMENT
  2026-07-18 to 2026-08-14  (28 days)
  Checked against the bank's own totals: they agree exactly.
```

If they ever disagree you get the mismatch and nothing else. A tool
that is confidently wrong about money is worse than one that admits it
could not read the file: the second sends you to look at the PDF, the
first sends you to make a decision.

## Repeating payments

Two kinds, reported differently because they are not equally certain:

- **AUTOPAY mandates** — the bank itself records these as standing
  instructions. Certain.
- **Same payee, similar amount, more than once** — inferred from the
  pattern, and labelled as a guess.

Over one month this only half works: a monthly subscription appears
once, so only the AUTOPAY ones are caught. It gets considerably better
with two or three months of statements.

## What it does not do yet

- **One statement at a time.** Multiple months would make repeating-payment
  detection much better; nothing else needs it.
- **HDFC layouts only.** The column positions are read from the
  statement's own header row rather than hardcoded, so another bank
  may work — but it has only been tried against one. If nothing is
  found, `npm run inspect` writes the raw layout to `rows.txt`.
- **Screenshots.** A photo has no text to parse, so the numbers would
  have to be read by a model, and a model can read ₹1,500 as ₹15,00.
  If this is ever added, those figures need to be marked as read
  rather than counted.

## Files

| | |
|---|---|
| `src/pdf.mjs` | PDF → rows of text, by position on the page |
| `src/parse.mjs` | rows → transactions, plus the reconciliation check |
| `src/merchant.mjs` | narration → who was paid |
| `src/analyse.mjs` | all the arithmetic |
| `src/categorise.mjs` | the only model call |
| `report.mjs` | what you run |
| `inspect.mjs` | dumps a statement's raw layout, for adding a new bank |

`statement.pdf`, `rows.txt`, `report.json`, `categories.json` and
`.env.local` are all gitignored — none of your financial data is in
the repository.
