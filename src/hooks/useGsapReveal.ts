import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

interface RevealOptions {
  /** CSS selector for child elements to animate. Omit to animate the container itself. */
  selector?: string;
  stagger?: number;
  y?: number;
  duration?: number;
  start?: string;
  ease?: string;
  delay?: number;
}

export function useGsapReveal<T extends HTMLElement = HTMLDivElement>(
  opts: RevealOptions = {},
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const targets = opts.selector
      ? Array.from(container.querySelectorAll<HTMLElement>(opts.selector))
      : [container];

    if (!targets.length) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: opts.y ?? 28 },
        {
          opacity: 1,
          y: 0,
          duration: opts.duration ?? 0.65,
          ease: opts.ease ?? "power2.out",
          stagger: opts.stagger ?? 0,
          delay: opts.delay ?? 0,
          scrollTrigger: {
            trigger: container,
            start: opts.start ?? "top 88%",
            once: true,
          },
        },
      );
    }, container);

    return () => ctx.revert();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return ref;
}
