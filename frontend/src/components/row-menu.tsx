'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

type MenuPosition = { left: number; top?: number; bottom?: number };

export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setPosition(undefined); return; }
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 212;
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
    const openUp = rect.bottom + 330 > window.innerHeight;
    setPosition(openUp
      ? { left, bottom: window.innerHeight - rect.top + 6 }
      : { left, top: rect.bottom + 6 });
  }, [open]);

  useEffect(() => {
    if (!open || !position) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === 'pointerdown') {
        const target = event.target as Node | null;
        if (target && (menu.current?.contains(target) || button.current?.contains(target))) return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return <div className="row-menu">
    <button ref={button} type="button" className="icon-button row-menu-button" aria-haspopup="menu"
      aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
    {open && position && createPortal(
      <div ref={menu} className="row-menu-list" role="menu" aria-label={label}
        style={{ left: position.left, top: position.top, bottom: position.bottom }}
        onClick={() => setOpen(false)}>{children}</div>,
      document.body,
    )}
  </div>;
}
