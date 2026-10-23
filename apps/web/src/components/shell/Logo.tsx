// gitspore logo: the beetle on its plate plus the word.

// Variants as logo-mark in Penpot: "plate" on the logo plate, "slot" on
// hotbar slot 0 (the overview). The slot beetle has no leaf, its body takes
// the text colour and the seam and head gap the slot's --slot-fill, so they
// read as cuts.
export function Beetle({
  variant = "plate",
  className = "size-6",
}: {
  variant?: "plate" | "slot";
  className?: string;
}) {
  const plate = variant === "plate";
  const body = plate ? "var(--color-plate-ink)" : "currentColor";
  const cut = plate ? "var(--color-plate)" : "var(--slot-fill)";

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M7.5 15.5 L4 13.5 M7 22.5 L3.5 24 M24.5 15.5 L28 13.5 M25 22.5 L28.5 24"
        stroke={body}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="16" cy="19.5" rx="9.5" ry="10.5" fill={body} />
      <ellipse
        cx="16"
        cy="7.4"
        rx="4.3"
        ry="3.4"
        fill={body}
        stroke={cut}
        strokeWidth="1.6"
      />
      {plate && (
        <path
          d="M17 4.4 C18 1.8 21.4 .9 24.4 1.7 C22.7 4.1 20 5.2 17 4.4Z"
          fill="var(--color-art-logo-leaf)"
        />
      )}
      <path
        d="M16 11.6 C12.4 15 12.4 23.6 16 27.6 C19.6 23.6 19.6 15 16 11.6Z"
        fill={plate ? "var(--color-art-logo-seam)" : cut}
      />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-plate">
        <Beetle />
      </span>
      <span className="font-title text-title-logo">gitspore</span>
    </div>
  );
}
