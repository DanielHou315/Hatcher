import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-3">
        <div className="eyebrow">Not found</div>
        <h1 className="title text-3xl">Nothing here</h1>
        <p className="text-muted">
          The page does not exist, or it has not been shared with you. Back to <Link href="/">your pages</Link>.
        </p>
      </div>
    </div>
  );
}
