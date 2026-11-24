import { TwoFactorForm } from '@/components/auth/TwoFactorForm';
import { safeNext } from '@/lib/sign-in';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Two-factor sign-in' };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function TwoFactorPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-6">
        <h1 className="title text-[2.1rem]">Two-factor sign-in</h1>
        <TwoFactorForm next={safeNext(next)} />
      </div>
    </div>
  );
}
