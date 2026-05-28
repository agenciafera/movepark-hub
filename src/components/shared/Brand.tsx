import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  height = 24,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <img
      src="/brand/logo-movepark.svg"
      alt="Movepark"
      style={{ height }}
      className={cn("block w-auto select-none", className)}
      draggable={false}
    />
  );
}

export function Monogram({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      src="/brand/simbolo-movepark.svg"
      alt=""
      width={size}
      height={size}
      className={cn("block select-none", className)}
      draggable={false}
    />
  );
}
