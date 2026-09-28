import { EntryPage, entryMetadata } from '@/components/EntryPage';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return entryMetadata('paper', (await params).slug);
}

export default async function Page({ params }: Props) {
  return <EntryPage kind="paper" slug={(await params).slug} />;
}
