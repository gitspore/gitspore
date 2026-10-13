import type { SVGProps } from "react";

// Rail icons from Penpot
// only the shapes are kept, and the colour is `currentColor`, so an icon takes
// the text colour of its bookmark (plate-ink when closed, accent-ink when open).
// The size comes from the parent (RailBookmark sets size-5).

type IconProps = SVGProps<SVGSVGElement>;

// Shared look of every line: Penpot's 1.62 stroke with round ends
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.62,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// Agents: a sprout
export function SproutIcon(props: IconProps) {
  return (
    <svg viewBox="2.46 2.66 20 20" aria-hidden {...props}>
      <path
        {...stroke}
        d="M12 20.31V11.08M12 12.92C11.08 8.31 6.46 6.46 3.69 8.31C4.62 12.92 8.31 13.85 12 12.92M12 11.08C12.92 5.54 17.54 3.69 21.23 5.54C20.31 11.08 15.69 12 12 11.08"
      />
      <path {...stroke} d="M6.46 20.31H17.54" />
    </svg>
  );
}

export function SeedPacketIcon(props: IconProps) {
  return (
    <svg viewBox="2.46 2.58 20 20" aria-hidden {...props}>
      <path
        {...stroke}
        d="M6 6.58L7.85 4.73L9.69 6.58L11.54 4.73L13.38 6.58L15.23 4.73L17.08 6.58L18.92 4.73V20.42H6V6.58"
      />
      <circle {...stroke} cx="10" cy="10.77" r="2.31" />
    </svg>
  );
}

export function BranchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden {...props}>
      <circle {...stroke} cx="6.15" cy="4.62" r="1.85" />
      <circle {...stroke} cx="6.15" cy="15.38" r="1.85" />
      <circle {...stroke} cx="13.85" cy="6.92" r="1.85" />
      <path
        {...stroke}
        d="M6.15 6.46V13.54M13.85 8.77C13.85 11.85 6.15 11.08 6.15 13.38"
      />
    </svg>
  );
}
