import Reader from "@/components/Reader";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Money Reader</h1>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
          Drop in a bank statement and see where the money went — what came in, what
          went out, what quietly repeats every month.
        </p>
      </header>

      {/* Said before the file picker, not in a footer, because it is the
          thing a person needs to know before they choose a file. */}
      <p className="mt-5 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm leading-relaxed">
        <strong className="font-medium">Your statement is never uploaded.</strong> It is
        read inside this browser tab and stays on your computer — the file, the password,
        the amounts and your account number never reach a server. There is nowhere to
        upload to, which is why nothing has to be trusted about it.
      </p>

      <Reader />

      <footer className="mt-14 border-t border-border pt-6 text-xs leading-relaxed text-muted">
        <p>
          Every figure is added up from the statement itself and checked against the
          bank&rsquo;s own printed totals before anything is shown. If they disagree you
          get the mismatch instead of a report.
        </p>
        <p className="mt-2">
          <a
            className="underline underline-offset-4 hover:text-accent"
            href="https://github.com/sehgalridhima/money-reader"
            target="_blank"
            rel="noreferrer noopener"
          >
            Source on GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
