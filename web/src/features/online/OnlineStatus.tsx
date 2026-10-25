import { useCallback, useEffect, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Cloud, CloudUpload, CopyPlus, FolderOpen, Globe, HardDrive, History, LogIn, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { personLabel } from "@/features/account/institutes";
import { supabaseApi } from "@/features/account/institutesApi";
import { useAccount } from "@/features/account/useAccount";
import { currentInstitute, notify, refreshInstitutes, useInstitutes } from "@/features/account/useInstitutes";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { docHash, editableInstitutes, isDirty, onlineMenu, roleIn, statusNote, statusText } from "./online";
import { supabaseOnlineApi } from "./onlineApi";
import { OnlineDialogs } from "./OnlineDialogs";
import { publishState } from "./publish";
import { refreshLinked, saveOnline, showDialog, startPublish, unlink, useOnline } from "./useOnline";

/**
 * The header's status line, next to the account button: where the working copy stands online, with a menu to save,
 * publish, list versions, open, rename or delete. Renders nothing without a Supabase client, like the account button.
 */
export function OnlineStatus() {
  return supabase ? <Status client={supabase} /> : null;
}

/** The working copy's hash, recomputed only when a part of the version document changes. */
function useWorkingHash(): string {
  const settings = useAppStore((s) => s.settings);
  const departments = useAppStore((s) => s.departments);
  const teachers = useAppStore((s) => s.teachers);
  const rooms = useAppStore((s) => s.rooms);
  const sections = useAppStore((s) => s.sections);
  const courses = useAppStore((s) => s.courses);
  const locks = useAppStore((s) => s.locks);
  const result = useAppStore((s) => s.result);
  const printHeading = useAppStore((s) => s.printHeading);
  const softRules = useAppStore((s) => s.softRules);
  return useMemo(
    () => docHash({ settings, departments, teachers, rooms, sections, courses, locks, result, printHeading, softRules }),
    [settings, departments, teachers, rooms, sections, courses, locks, result, printHeading, softRules],
  );
}

function Status({ client }: { client: SupabaseClient }) {
  const api = useMemo(() => supabaseOnlineApi(client), [client]);
  const institutesApi = useMemo(() => supabaseApi(client), [client]);
  const link = useAppStore((s) => s.online);
  const hash = useWorkingHash();
  const session = useAccount((s) => s.session);
  const loaded = useInstitutes((s) => s.loaded);
  const memberships = useInstitutes((s) => s.memberships);
  const active = useInstitutes(currentInstitute);
  const saving = useOnline((s) => s.saving);
  const linked = useOnline((s) => s.linked);
  const hasResult = useAppStore((s) => s.result !== null);
  const admin = useInstitutes((s) => s.admin);

  const account = !session ? "signedOut" : loaded ? "ready" : "loading";
  const role = link && account === "ready" ? roleIn(memberships, link.instituteId) : null;
  const linkedInstitute = link ? (memberships.find((m) => m.instituteId === link.instituteId)?.name ?? null) : null;
  const dirty = isDirty(link, hash);
  const liveVersion = link && linked?.timetableId === link.timetableId ? linked.liveVersion : null;
  const published = liveVersion !== null;
  const text = statusText(link, { dirty, role, instituteName: linkedInstitute, published });
  const note = link ? statusNote({ dirty, role }) : null;
  const editable = editableInstitutes(memberships);
  const items = onlineMenu({ link, account, role, canCreate: editable.length > 0, hasActive: !!active });
  const Icon = link ? Cloud : HardDrive;
  const publish = link
    ? publishState({
        hasResult,
        dirty,
        role,
        handle: memberships.find((m) => m.instituteId === link.instituteId)?.handle ?? null,
        admin: active?.instituteId === link.instituteId && admin ? personLabel(admin) : null,
      })
    : null;

  const ready = account === "ready";
  const timetableId = link?.timetableId;
  // The "· published" note: load it when the link or the account changes.
  useEffect(() => {
    if (ready) void refreshLinked(api);
  }, [api, ready, timetableId]);
  const onHandleSaved = useCallback(() => refreshInstitutes(institutesApi, notify), [institutesApi]);

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open || !ready) return;
          void refreshInstitutes(institutesApi, notify);
          void refreshLinked(api);
        }}
      >
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="max-w-80 min-w-0 font-normal text-muted-foreground" aria-label={`Online: ${text}`} />}
        >
          <span className="relative">
            <Icon />
            {dirty && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-500" aria-hidden />}
          </span>
          {/* The name truncates; the note never does. */}
          <span className="hidden truncate md:inline">{saving ? "Saving…" : link ? `${link.name} · ${linkedInstitute ?? link.instituteName}` : text}</span>
          {published && !saving && <span className="hidden shrink-0 md:inline">· published</span>}
          {note && !saving && <span className={cn("hidden shrink-0 md:inline", dirty && role !== "viewer" && "text-amber-700")}>· {note}</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto max-w-80 min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="text-sm font-medium text-foreground">{link ? link.name : "On this device only"}</div>
              <div className="text-xs font-normal">
                {link
                  ? `${linkedInstitute ?? link.instituteName} · version ${link.version}${published ? ` · version ${liveVersion} is live` : ""}${note ? ` · ${note}` : ""}`
                  : "Not saved online. Save it to share it with your institute."}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          {(items.length > 0 || account === "loading") && <DropdownMenuSeparator />}
          <DropdownMenuGroup>
            {account === "loading" && <DropdownMenuItem disabled>Loading your institutes…</DropdownMenuItem>}
            {items.includes("signInToSave") && (
              <DropdownMenuItem disabled>
                <LogIn /> Sign in to save online
              </DropdownMenuItem>
            )}
            {items.includes("save") && (
              <DropdownMenuItem disabled={saving} onClick={() => void saveOnline(api, notify)}>
                <CloudUpload /> {saving ? "Saving…" : link ? "Save online" : "Save online…"}
              </DropdownMenuItem>
            )}
            {items.includes("saveAs") && (
              <DropdownMenuItem onClick={() => showDialog({ kind: "create" })}>
                <CopyPlus /> Save as new timetable…
              </DropdownMenuItem>
            )}
            {items.includes("publish") &&
              (publish?.kind === "noResult" ? (
                <Tooltip>
                  {/* A disabled item takes no pointer events, so the wrapper carries the tooltip. */}
                  <TooltipTrigger render={<div />}>
                    <DropdownMenuItem disabled>
                      <Globe /> Publish
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">{publish.reason}</TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuItem disabled={saving} onClick={() => void startPublish(api, notify)}>
                  <Globe /> {published ? "Publish again" : "Publish"}
                  {publish?.kind !== "ready" && "…"}
                </DropdownMenuItem>
              ))}
            {items.includes("versions") && link && (
              <DropdownMenuItem
                onClick={() =>
                  showDialog({
                    kind: "versions",
                    timetable: { timetableId: link.timetableId, name: link.name, instituteId: link.instituteId, instituteName: linkedInstitute ?? link.instituteName },
                  })
                }
              >
                <History /> Versions…
              </DropdownMenuItem>
            )}
            {items.includes("open") && active && (
              <DropdownMenuItem onClick={() => showDialog({ kind: "open" })}>
                <FolderOpen /> Open from {active.name}…
              </DropdownMenuItem>
            )}
            {items.includes("rename") && (
              <DropdownMenuItem onClick={() => showDialog({ kind: "rename" })}>
                <Pencil /> Rename…
              </DropdownMenuItem>
            )}
            {items.includes("delete") && (
              <DropdownMenuItem variant="destructive" onClick={() => showDialog({ kind: "delete" })}>
                <Trash2 /> Delete…
              </DropdownMenuItem>
            )}
            {items.includes("unlink") && (
              <DropdownMenuItem onClick={unlink}>
                <HardDrive /> Work on this device only
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <OnlineDialogs api={api} link={link} editable={editable} active={active} onHandleSaved={onHandleSaved} />
    </>
  );
}
