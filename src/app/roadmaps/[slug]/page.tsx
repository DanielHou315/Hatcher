import { EntryPage, entryMetadata } from '@/components/EntryPage';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return entryMetadata('roadmap', (await params).slug);
}

export default async function Page({ params }: Props) {
  return <EntryPage kind="roadmap" slug={(await params).slug} />;
}
