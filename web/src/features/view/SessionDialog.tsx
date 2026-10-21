import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { subjectColor } from "./colors";
import { sessionDetails, type PlacedSession, type ViewData } from "./layout";

interface Props {
  data: ViewData;
  entry: PlacedSession | null;
  colors: Map<string, number>;
  onClose: () => void;
  locked?: boolean;
  /** Extra buttons in the footer (T10 adds Lock / Unlock). */
  actions?: React.ReactNode;
}

/** Full details of one placed session, opened by clicking a timetable cell. */
export function SessionDialog({ data, entry, colors, onClose, locked, actions }: Props) {
  const info = entry ? sessionDetails(data, entry) : null;
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      {info && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="size-3 rounded-full border" style={{ backgroundColor: subjectColor(colors, info.subject).bg, borderColor: subjectColor(colors, info.subject).border }} />
              {info.subject}
            </DialogTitle>
            <DialogDescription>
              {info.kind === "lab" ? "Lab session" : "Lecture"}
              {locked ? " · 🔒 Locked: stays here when you regenerate" : ""}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2">
            <Row label="Section" value={info.batch ? `${info.section} · batch ${info.batch}` : info.section} />
            <Row label="Teacher" value={info.teacher} />
            <Row label="Room" value={info.room} />
            <Row label="When" value={`${info.day} ${info.periods}`} />
            <Row label="Time" value={info.time} />
          </dl>
          <DialogFooter showCloseButton>{actions}</DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
