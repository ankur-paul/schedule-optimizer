import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/** A link into /help (build `href` with helpHref), opened in a new tab so the working copy stays on screen. */
export function HelpLink({ href, children = "Help", className }: { href: string; children?: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={cn("inline-flex items-center gap-1 whitespace-nowrap underline-offset-2 hover:underline print:hidden", className)}
    >
      <CircleHelp className="size-3.5 shrink-0" aria-hidden />
      {children}
    </a>
  );
}
