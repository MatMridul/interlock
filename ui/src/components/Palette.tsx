import { useEffect, useMemo, useRef, useState } from "react";
import { filterActions, type ActionDef } from "../lib/keymap";

export interface PaletteItem extends ActionDef {
  disabled?: boolean;
}

interface Props {
  items: PaletteItem[];
  onRun: (id: string) => void;
  onClose: () => void;
}

/** Ctrl+K list of every action. Rendered only while open; focus returns to where it was on close. */
export function Palette({ items, onRun, onClose }: Props) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<Element | null>(null);
  const shown = useMemo(() => filterActions(q, items), [q, items]);
  const idx = Math.min(at, Math.max(0, shown.length - 1));

  useEffect(() => {
    back.current = document.activeElement;
    input.current?.focus();
    return () => { (back.current as HTMLElement | null)?.focus?.(); };
  }, []);
  useEffect(() => { document.getElementById(`pal-${shown[idx]?.id}`)?.scrollIntoView?.({ block: "nearest" }); }, [idx, shown]);

  const run = (it: PaletteItem | undefined) => {
    if (!it || it.disabled) return;
    onClose();
    onRun(it.id);
  };

  return (
    <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setAt(Math.min(shown.length - 1, idx + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAt(Math.max(0, idx - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); run(shown[idx]); }
          else if (e.key === "Tab") { e.preventDefault(); }
        }}>
        <label htmlFor="pal-q" className="sr">Type to filter actions</label>
        <input id="pal-q" ref={input} role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list"
          aria-activedescendant={shown[idx] ? `pal-${shown[idx].id}` : undefined} autoComplete="off" spellCheck={false}
          placeholder="Type an action: fire, autoplay, layout, tour…" value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} />
        <ul id="pal-list" role="listbox" aria-label="Actions">
          {shown.map((it, i) => (
            <li key={it.id} id={`pal-${it.id}`} role="option" aria-selected={i === idx} aria-disabled={it.disabled || undefined}
              className={`${i === idx ? "on" : ""}${it.disabled ? " off" : ""}`}
              onMouseMove={() => setAt(i)} onClick={() => run(it)}>
              <span>{it.title}</span>{it.keys && <kbd>{it.keys}</kbd>}
            </li>
          ))}
          {shown.length === 0 && <li className="none" role="presentation">No action matches “{q}”.</li>}
        </ul>
        <p className="modal-foot">Up and Down to move, Enter to run, Esc to close.</p>
      </div>
    </div>
  );
}
