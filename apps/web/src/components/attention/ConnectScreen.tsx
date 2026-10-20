"use client";

import { useState, type ReactNode, type SubmitEvent } from "react";
import { Check, Minus, X } from "lucide-react";
import type { RepoCheck, RepoCheckItem, RepoProblem } from "@gitspore/shared";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { selectRepo } from "@/lib/store/selectors";
import { Logo } from "../shell/Logo";
import { Button } from "../ui/button";

// Setup screen: choose the repository gitspore works in (#58). Shows while
// the daemon has no repo, or when the user opens it to switch (showSetup).
// The browser can't hand over a folder path, so the user pastes one. "Check"
// asks the daemon what it finds there; "Start gitspore" chooses the repo once
// nothing failed.

const CHECK_LABELS: Record<RepoCheckItem, string> = {
  git: "Git repository",
  base_branch: "Base branch",
  github: "GitHub issues",
  claude: "Claude Code",
};

const RESULT_ICONS: Record<RepoCheck["result"], ReactNode> = {
  ok: <Check className="size-4 text-status-working" strokeWidth={3} />,
  warn: <Minus className="size-4 text-status-review" strokeWidth={3} />,
  fail: <X className="size-4 text-wait" strokeWidth={3} />,
};

const inputClass =
  "h-10 min-w-0 rounded-lg bg-panel-2 px-3 font-mono text-mono-terminal text-ink outline-none focus-visible:ring-3 focus-visible:ring-focus aria-invalid:ring-2 aria-invalid:ring-wait";

export function ConnectScreen() {
  const checkRepo = useGreenhouseStore((s) => s.checkRepo);
  const chooseRepo = useGreenhouseStore((s) => s.chooseRepo);
  const closeSetup = useGreenhouseStore((s) => s.closeSetup);
  // Set when the user switches repos; then the screen can be closed
  const currentRepo = useGreenhouseStore(selectRepo);

  const [path, setPath] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  // What the last check found; null until checked, and again after an edit
  const [checks, setChecks] = useState<RepoCheck[] | null>(null);
  const [problems, setProblems] = useState<RepoProblem[]>([]);
  // True while the daemon checks or switches
  const [busy, setBusy] = useState(false);

  const failed = (item: RepoCheckItem) =>
    checks?.some((c) => c.item === item && c.result === "fail") ?? false;
  const canStart =
    checks !== null && !checks.some((c) => c.result === "fail") && !busy;

  // An edit makes the last check stale
  function edit(set: (value: string) => void, value: string) {
    set(value);
    setChecks(null);
    setProblems([]);
  }

  async function check(event: SubmitEvent<HTMLFormElement>) {
    // A form would reload the page on submit
    event.preventDefault();
    setBusy(true);
    const answer = await checkRepo(path.trim(), baseBranch.trim());
    setBusy(false);
    setChecks(answer.checks);
    setProblems([]);
  }

  async function start() {
    setBusy(true);
    const answer = await chooseRepo(path.trim(), baseBranch.trim());
    setBusy(false);
    // On success the store closes the screen; only problems are left to show
    setProblems("problems" in answer ? answer.problems : []);
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-backdrop p-layout-edge">
      <div className="flex w-120 max-w-full flex-col gap-3 rounded-xl bg-panel p-6 text-ink shadow-lg">
        <Logo />

        <h1 className="mt-2 font-title text-title-panel">
          Choose a repository
        </h1>
        <p className="text-ui-body text-muted-foreground">
          gitspore works in one git repository on this computer. Each agent gets
          its own worktree and branch in it.
        </p>

        <form onSubmit={check} className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label
              htmlFor="repo-path"
              className="text-ui-small text-muted-foreground"
            >
              Repository folder
            </label>
            <input
              id="repo-path"
              value={path}
              onChange={(e) => edit(setPath, e.target.value)}
              placeholder="/Users/you/code/my-project"
              autoFocus
              spellCheck={false}
              aria-invalid={failed("git")}
              className={inputClass}
              readOnly={busy}
            />
          </div>
          <div className="flex w-23 flex-col gap-1">
            <label
              htmlFor="repo-branch"
              className="text-ui-small text-muted-foreground"
            >
              Base branch
            </label>
            <input
              id="repo-branch"
              value={baseBranch}
              onChange={(e) => edit(setBaseBranch, e.target.value)}
              spellCheck={false}
              aria-invalid={failed("base_branch")}
              className={inputClass}
              readOnly={busy}
            />
          </div>
          <Button
            type="submit"
            variant="ghost"
            className="h-10 bg-hover px-4 font-bold text-ink hover:bg-ink/20"
            disabled={path.trim() === "" || baseBranch.trim() === "" || busy}
          >
            Check
          </Button>
        </form>

        {/* Each detail says what was found or what to do; the daemon writes it */}
        <ul
          aria-live="polite"
          className="mt-1 flex flex-col gap-2 empty:hidden"
        >
          {checks?.map((c) => (
            <li key={c.item} className="flex gap-2">
              {RESULT_ICONS[c.result]}
              <div className="flex flex-col gap-1">
                <span className="text-ui-meta">{CHECK_LABELS[c.item]}</span>
                <span
                  className={
                    c.result === "fail"
                      ? "text-ui-small text-wait"
                      : "text-ui-small text-muted-foreground"
                  }
                >
                  {c.detail}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* The repo can still be refused at the switch, e.g. while agents run */}
        <ul role="alert" className="flex flex-col gap-1 empty:hidden">
          {problems.map((problem) => (
            <li key={problem.code} className="text-ui-meta text-wait">
              {problem.message}
            </li>
          ))}
        </ul>

        <div className="mt-2 flex justify-end gap-2">
          {currentRepo && (
            <Button
              variant="ghost"
              className="h-10 px-4 font-bold"
              onClick={closeSetup}
            >
              Cancel
            </Button>
          )}
          <Button
            className="h-10 px-4 font-bold"
            disabled={!canStart}
            onClick={start}
          >
            Start gitspore
          </Button>
        </div>
      </div>
    </div>
  );
}
