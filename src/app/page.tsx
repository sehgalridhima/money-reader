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
          thing a person needs to know before they choose a file. One
          line: the longer version was three, and a wall of reassurance
          reads more like a disclaimer than a fact. */}
      <p className="mt-5 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
        <strong className="font-medium">Your statement is never uploaded.</strong> It is
        read in this browser tab and stays on your computer.
      </p>

      <Reader />

      <footer className="mt-14 border-t border-border pt-6 text-xs text-muted">
        <a
          className="underline underline-offset-4 hover:text-accent"
          href="https://github.com/sehgalridhima/money-reader"
          target="_blank"
          rel="noreferrer noopener"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}
