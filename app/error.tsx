"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-medium tracking-tight">Something went wrong</h1>
      <p className="text-sm leading-6 text-zinc-400">{error.message || "The page could not be loaded."}</p>
      <button
        type="button"
        onClick={reset}
        className="h-11 w-fit rounded-full bg-zinc-100 px-5 text-sm font-medium text-zinc-950"
      >
        Try again
      </button>
    </main>
  );
}
