import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Id } from "@/domain/types";
import { EntityPicker } from "./EntityPicker";
import { entityGroups, stepEntity, type EntityGroup, type ViewData, type ViewKind } from "./layout";

const KINDS: { kind: ViewKind; label: string }[] = [
  { kind: "section", label: "Section" },
  { kind: "teacher", label: "Teacher" },
  { kind: "room", label: "Room" },
];

/** Which view (section, teacher or room) and which entity in it; each view remembers its own pick. */
export function useEntitySelection(data: ViewData) {
  const [kind, setKind] = useState<ViewKind>("section");
  const [selected, setSelected] = useState<Record<ViewKind, Id | null>>({ section: null, teacher: null, room: null });
  const groups = useMemo(() => entityGroups(data, kind), [data, kind]);
  const flat = groups.flatMap((g) => g.items);
  // The pick, or the first entity when nothing (or something since deleted) is picked.
  const currentId = flat.some((e) => e.id === selected[kind]) ? selected[kind] : (flat[0]?.id ?? null);
  const select = (id: Id | null) => setSelected((s) => ({ ...s, [kind]: id }));
  const title = flat.find((e) => e.id === currentId)?.name ?? "";
  return { kind, setKind, groups, currentId, select, title };
}

/** Section / Teacher / Room tabs, then previous, a searchable picker and next. */
export function EntityNav({ kind, onKindChange, groups, currentId, onSelect }: {
  kind: ViewKind;
  onKindChange: (kind: ViewKind) => void;
  groups: EntityGroup[];
  currentId: Id | null;
  onSelect: (id: Id | null) => void;
}) {
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <div role="tablist" aria-label="View by" className="inline-flex rounded-lg bg-muted p-1">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            role="tab"
            type="button"
            aria-selected={kind === k.kind}
            onClick={() => onKindChange(k.kind)}
            className={cn(
              "h-7 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              kind === k.kind ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" aria-label="Previous" disabled={count < 2} onClick={() => onSelect(stepEntity(groups, currentId, -1))}>
          <ChevronLeft />
        </Button>
        <EntityPicker groups={groups} value={currentId} onChange={onSelect} placeholder={`Choose a ${kind}`} />
        <Button variant="outline" size="icon" aria-label="Next" disabled={count < 2} onClick={() => onSelect(stepEntity(groups, currentId, 1))}>
          <ChevronRight />
        </Button>
      </div>
    </>
  );
}
