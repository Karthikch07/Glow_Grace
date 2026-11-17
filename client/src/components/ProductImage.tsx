import { cn } from "@/lib/utils";

/**
 * Shows a product photo of any shape in a fixed frame without grey bars or
 * cropping: the whole photo sits centred over a blurred, enlarged copy of
 * itself that fills the frame.
 */
export function ProductImage({
  src,
  alt,
  className,
  imgClassName,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl" loading="lazy" decoding="async" />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn("relative h-full w-full object-contain drop-shadow-sm transition-transform duration-500", imgClassName)}
      />
    </div>
  );
}
