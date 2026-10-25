/**
 * Product photography sits in its own frame, separate from any text or control.
 * The spotlight is a soft radial glow, not a gradient wash.
 */
export function ProductArt({
  src,
  alt,
  muted = false,
  placeholder = 'mystery',
  wide = false,
}: {
  src: string | null;
  alt: string;
  muted?: boolean;
  placeholder?: 'mystery' | 'product';
  /** A shorter frame, so a countdown below it stays above the fold on phones. */
  wide?: boolean;
}) {
  const image = src ?? (placeholder === 'mystery' ? '/preview/mystery-object.svg' : null);
  return (
    <div
      className={`relative grid w-full place-items-center overflow-hidden rounded-[20px] border border-line bg-[radial-gradient(circle_at_50%_42%,rgb(217_255_67/0.16),transparent_58%),#0e120f] ${
        wide ? 'aspect-[2/1] sm:aspect-[5/4]' : 'aspect-[4/3] sm:aspect-[5/4]'
      }`}
    >
      {image ? (
        <img
          src={image}
          alt={alt}
          loading="eager"
          decoding="async"
          className={`h-full w-full object-contain p-4 sm:p-6 transition-[filter,opacity] duration-500 ${muted ? 'opacity-45 grayscale' : ''}`}
        />
      ) : (
        <span className="font-display text-7xl font-black text-muted/40">?</span>
      )}
    </div>
  );
}
