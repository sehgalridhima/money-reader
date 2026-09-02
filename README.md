# Money Reader

Reads a bank statement PDF and says where the money went: what came
in, what went out, which payments repeat, and what it was all spent
on.

Runs entirely on your own machine. Nothing is uploaded, and the
statement never leaves the folder you put it in.

There are two ways to use it, sharing one set of logic.

## The website

```bash
npm install
npm run dev        # then open localhost:3000
```

Drop a statement on the page and it reports back. **The file is never
uploaded.** pdf.js runs in the browser and every sum here is plain
arithmetic, so there is nothing the server needs to be given: the PDF,
the password, the amounts and the account number stay in the tab.

That is not a promise about how the server behaves — there is no
upload endpoint at all. The only route in the whole app takes a list
of payee names (see Categories below) and could not accept a
statement if it wanted to.

If you would rather judge it before trusting it with your own
statement, the page has a made-up sample to try first.

## The command line

```bash
npm run cli                          # reads ./statement.pdf
npm run cli -- ~/Downloads/mine.pdf
```

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

## Categories: most of them never leave your browser

Two rules run locally and between them answer most of a statement:

1. **A list of common merchants** ships with the page — Swiggy, Amazon,
   Airtel, Netflix, Blinkit and a couple of hundred others. Nobody
   needs a model to be told what those are.
2. **A name that is a person** — an honorific, or a recognised surname
   in last position — is a transfer rather than a purchase.

What is left is the unfamiliar tail: the local restaurant, the tuition
centre, the name you do not recognise. On the sample statement that is
one payee out of six.

Only for those does anything leave the browser, and only after you
press a button — the page shows you the exact names first:

```
CHAIWALA CORNER — context: "PTMQR9"
```

Never amounts, dates, balances, your account number, your name, or how
often anything appeared. Skipping it changes no figure on the page.

The handle is worth passing: EURONET SERVICES IND is an ATM operator,
but a payment collected at `GPAYRECHARGE2` was a phone recharge — and
the category comes out as a bill rather than a cash withdrawal.

The command-line version caches answers in `categories.json`, so a
second run is free. Roughly ₹1.50 for a statement of entirely
unfamiliar payees, and usually far less.

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

Shared by both the website and the command line:

| | |
|---|---|
| `src/lib/rows.mjs` | PDF → rows of text, by position on the page |
| `src/lib/parse.mjs` | rows → transactions, plus the reconciliation check |
| `src/lib/merchant.mjs` | narration → who was paid |
| `src/lib/analyse.mjs` | all the arithmetic |
| `src/lib/known-merchants.mjs` | the offline merchant list |
| `src/lib/classify.mjs` | the two local rules |

Website only:

| | |
|---|---|
| `src/lib/pdf-browser.ts` | loads pdf.js in the tab — why nothing is uploaded |
| `src/components/` | the page |
| `src/app/api/categorise/` | the one endpoint, which only takes names |

Command line only:

| | |
|---|---|
| `src/pdf.mjs` | pdf.js for Node |
| `src/ask.mjs` | the password prompt |
| `src/categorise.mjs` | the model call, with an on-disk cache |
| `report.mjs`, `inspect.mjs` | what you run |

`statement.pdf`, `rows.txt`, `report.json`, `categories.json` and
`.env.local` are all gitignored — none of your financial data is in
the repository. `public/sample-statement.pdf` is committed on purpose
and is entirely invented; `scripts/make-sample.mjs` regenerates it.

## Tests

`scripts/browser-test.mjs` drives the real page in a real browser
against the sample and asserts the claim this project rests on: that
nothing is POSTed before you consent, and that when you do consent the
payload contains names and no money.

```bash
npm run dev                       # in one terminal
node scripts/browser-test.mjs     # in another
```
