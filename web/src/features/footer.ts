/** What the footer says next to a step's Next button: a red blocker, or a grey hint when nothing is wrong yet. */
export interface FooterNote {
  text: string;
  tone: "error" | "hint";
}
