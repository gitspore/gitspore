import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Circle, Diamond, Ellipsis, Flower, Triangle, X, Square, CircleQuestionMark } from "lucide-react";


const STATES = [
  { Icon: Circle, color: "text-status-working", text: "growing: a sprout with two leaves" },
  { Icon: Triangle, color: "text-status-waiting", text: "waiting for you: the plant droops, the rim pulses red" },
  { Icon: X, color: "text-status-error", text: "wilted: a grey bare stalk. The agent stopped" },
  { Icon: Diamond, color: "text-status-review", text: "review: a closed bud. Open the pull request" },
  { Icon: Flower, color: "text-status-merged", text: "merged: a bloom, the pot frees up" },
  { Icon: Ellipsis, color: "text-muted-foreground", text: "empty pot: pick an issue for it" },
  { Icon: Square, color: "text-(--color-agent-1)", text: "agent colour: the band at the foot of the pot and the square on its row" },
];

const KEYS = [
  { keys: ["1 – 6"], text: "open that pot's terminal, with Shift beside" },
  { keys: ["0"], text: "the overview: ask about all agents" },
  { keys: ["F"], text: "focus this terminal, or back to the scene" },
  { keys: ["A", "I", "G"], text: "agents, issues, branches tab" },
  { keys: ["Ctrl", "`"], text: "leave the terminal. Esc stays with Claude Code, it interrupts" },
];

export default function HelpPopover() {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg bg-hover hover:bg-ink/20 [&_svg]:size-5"
          aria-label="Help" />}
      >
        <CircleQuestionMark />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4 shadow-lg">
        <PopoverHeader>
          <PopoverTitle>
            <span className="text-ui-small font-ui text-muted-foreground">How to read a pot</span>
          </PopoverTitle>
          <ul className="mt-1.5 flex flex-col gap-2 text-ui-meta text-ink">
            {STATES.map(({ Icon, color, text }) => (
              <li key={text} className="flex items-start gap-2">
                <Icon strokeWidth={3} className={`mt-0.5 size-3 shrink-0 fill-current ${color}`} />
                {text}
              </li>
            ))}
          </ul>
        </PopoverHeader>

        <section className="flex flex-col gap-2">
          <h3 className="text-ui-small font-ui text-muted-foreground">Keys (when no terminal has focus)</h3>
          <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-ui-meta text-ink">
            {KEYS.map(({ keys, text }) => (
              <li key={text} className="col-span-2 grid grid-cols-subgrid items-start">
                <span className="flex shrink-0 gap-1 mt-0.5">
                  {keys.map((k) => <Kbd key={k} className="text-mono-key font-mono">{k}</Kbd>)}
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>
      </PopoverContent>
    </Popover>
  );
}
