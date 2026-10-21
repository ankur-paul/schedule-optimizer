import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "@/domain/types";
import { filterGroups, type EntityGroup } from "./layout";

interface Props {
  groups: EntityGroup[];
  value: Id | null;
  onChange: (id: Id) => void;
  placeholder: string;
}

/** Searchable select of sections/teachers/rooms, grouped by department. A group with an empty label gets no heading. */
export function EntityPicker({ groups, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = filterGroups(groups, query);
  const current = groups.flatMap((g) => g.items).find((e) => e.id === value);
  const pick = (id: Id) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="flex h-9 w-56 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <span className={cn("truncate", !current && "text-muted-foreground")}>{current?.name ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Stay above or below the trigger (never beside it), shrinking the list to fit the viewport. */}
        <Popover.Positioner sideOffset={4} align="start" collisionAvoidance={{ fallbackAxisSide: "none" }} className="isolate z-50">
          <Popover.Popup className="w-72 overflow-hidden rounded-lg bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  const first = shown[0]?.items[0];
                  if (e.key === "Enter" && first) pick(first.id);
                }}
                placeholder="Search…"
                className="h-9 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[min(20rem,calc(var(--available-height)-3rem))] overflow-y-auto p-1">
              {shown.length === 0 && <p className="px-2 py-6 text-center text-muted-foreground">No matches</p>}
              {shown.map((g) => (
                <div key={g.label} className="py-1">
                  {g.label && <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{g.label}</div>}
                  {g.items.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => pick(e.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <span className="flex-1 truncate">{e.name}</span>
                      {e.id === value && <Check className="size-4 text-primary" />}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
