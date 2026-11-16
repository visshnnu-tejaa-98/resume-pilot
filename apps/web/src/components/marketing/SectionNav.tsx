"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface SectionNavProps {
  label: string;
  items: { id: string; title: string }[];
}

/**
 * Sticky in-page topic list that highlights the section currently in
 * view (FAQ topics). Purely local UI state, so no store.
 */
export function SectionNav({ label, items }: SectionNavProps) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label={label} className="flex flex-[1_1_220px] flex-col gap-1 md:sticky md:top-6">
      {items.map((g) => (
        <a
          key={g.id}
          href={`#${g.id}`}
          onClick={() => setActive(g.id)}
          aria-current={active === g.id ? "location" : undefined}
          className={cn(
            "rounded-md px-3.5 py-2.5 text-[15px] font-semibold no-underline",
            active === g.id ? "bg-surface-2 text-text" : "text-text-2 hover:text-text",
          )}
        >
          {g.title}
        </a>
      ))}
    </nav>
  );
}
