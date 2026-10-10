import { BRANCH_PREFIX } from "@gitspore/shared";

const ALLOWED = "abcdefghijklmnopqrstuvwxyz0123456789";

const isLetterOrDigit = (ch: string) => ALLOWED.includes(ch);

const isAccentMark = (ch: string) => ch >= "\u0300" && ch <= "\u036f";

const MAX_SLUG_LENGTH = 40;

export function branchName(issueNumber: number, title: string): string {
  const words = [...title.normalize("NFKD").toLowerCase().replaceAll("ß", "ss")]
    .filter((ch) => !isAccentMark(ch))
    .map((ch) => (isLetterOrDigit(ch) ? ch : " "))
    .join("")
    .split(" ")
    .filter((word) => word !== "")
    .join("-")
    .slice(0, MAX_SLUG_LENGTH);
  const slug = words.endsWith("-") ? words.slice(0, -1) : words;
  return `${BRANCH_PREFIX}${issueNumber}-${slug}`;
}
