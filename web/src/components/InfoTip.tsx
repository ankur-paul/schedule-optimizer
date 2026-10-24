import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The ⓘ icon next to a non-obvious field. Needs a TooltipProvider above it (App has one). `more` (a helpHref) adds
 * *Learn more*; give it only where the help section says more than the tooltip. The popup stays open while hovered.
 */
export function InfoTip({ children, more }: { children: React.ReactNode; more?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="More info"
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2"
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>
        {more ? (
          <span>
            {children}{" "}
            <a href={more} target="_blank" rel="noopener" className="font-medium whitespace-nowrap underline underline-offset-2">
              Learn more
            </a>
          </span>
        ) : (
          children
        )}
      </TooltipContent>
    </Tooltip>
  );
}
