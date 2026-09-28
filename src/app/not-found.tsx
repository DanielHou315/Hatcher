import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="measure flex flex-col gap-3">
      <div className="eyebrow">Not found</div>
      <h1 className="title text-3xl">No page here</h1>
      <p className="text-muted">
        The page may not have been written yet. Browse the <Link href="/library">library</Link> instead.
      </p>
    </div>
  );
}
