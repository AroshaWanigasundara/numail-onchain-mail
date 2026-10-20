const hue = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? (words[0]![0]! + words[1]![0]!) : name.trim().slice(0, 2)).toUpperCase();
};

export function AddressAvatar({
  address,
  name,
  className = "h-9 w-9 text-[11px]",
}: {
  address: string;
  /** a resolved display name; initials come from it when given */
  name?: string | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ backgroundColor: `hsl(${hue(address)} 55% 42%)` }}
    >
      {name ? initialsOf(name) : address.slice(1, 3).toUpperCase()}
    </span>
  );
}
