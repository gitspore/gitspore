import { BRANCH_PREFIX } from "./models";

const ALLOWED = "abcdefghijklmnopqrstuvwxyz0123456789";

const isLetterOrDigit = (ch: string) => ALLOWED.includes(ch);

const isAccentMark = (ch: string) => ch >= "\u0300" && ch <= "\u036f";

const isDigit = (ch: string) => ch >= "0" && ch <= "9";

const MAX_SLUG_LENGTH = 40;

export function branchForIssue(issueNumber: number, title: string): string {
  const words = [...title.normalize("NFKD").toLowerCase().replaceAll("ß", "ss")]
    .filter((ch) => !isAccentMark(ch))
    .map((ch) => (isLetterOrDigit(ch) ? ch : " "))
    .join("")
    .split(" ")
    .filter((word) => word !== "")
    .join("-")
    .slice(0, MAX_SLUG_LENGTH);
  const slug = words.endsWith("-") ? words.slice(0, -1) : words;
  const suffix = slug ? `-${slug}` : "";
  return `${BRANCH_PREFIX}${issueNumber}${suffix}`;
}

export function issueNumberFromBranch(branch: string): number | null {
  if (!branch.startsWith(BRANCH_PREFIX)) return null;

  const rest = branch.slice(BRANCH_PREFIX.length);
  const digits = rest.split("-")[0];

  if (digits === "" || digits.startsWith("0")) return null;
  if (![...digits].every(isDigit)) return null;

  return Number(digits);
}
