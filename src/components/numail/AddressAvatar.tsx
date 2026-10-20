const hue = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export function AddressAvatar({ address, className = "h-9 w-9 text-[11px]" }: { address: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ backgroundColor: `hsl(${hue(address)} 55% 42%)` }}
    >
      {address.slice(1, 3).toUpperCase()}
    </span>
  );
}
