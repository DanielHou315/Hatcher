'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="shell shell-main">
      <div className="error-panel measure flex flex-col gap-2">
      <div className="eyebrow">Something went wrong rendering this page</div>
      <pre className="mono">{error.message}</pre>
      <button type="button" className="label w-fit cursor-pointer hover:text-ink" onClick={reset}>
        Try again
      </button>
      </div>
    </div>
  );
}
