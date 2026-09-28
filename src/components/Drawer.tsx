'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const DrawerContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return <DrawerContext.Provider value={{ open, setOpen }}>{children}</DrawerContext.Provider>;
}

export function useDrawer() {
  return useContext(DrawerContext);
}

export function MenuButton() {
  const { open, setOpen } = useDrawer();
  return (
    <button
      type="button"
      className="label cursor-pointer hover:text-ink min-[800px]:hidden"
      aria-expanded={open}
      aria-controls="site-sidebar"
      onClick={() => setOpen(!open)}
    >
      {open ? 'Close' : 'Menu'}
    </button>
  );
}

export function DrawerScrim() {
  const { open, setOpen } = useDrawer();
  return <div className="drawer-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />;
}
