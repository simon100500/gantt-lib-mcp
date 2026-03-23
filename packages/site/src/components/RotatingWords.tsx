import { useEffect, useRef, useState } from 'react';

interface RotatingWordsProps {
  words: string[];
  interval?: number; // ms between rotations
  className?: string;
}

export default function RotatingWords({
  words,
  interval = 2800,
  className = '',
}: RotatingWordsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const slotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPrevIndex(currentIndex);
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, interval);

    return () => clearInterval(timer);
  }, [words.length, interval, currentIndex]);

  // Clear prev index after animation completes
  useEffect(() => {
    if (prevIndex !== null) {
      const timeout = setTimeout(() => {
        setPrevIndex(null);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [prevIndex]);

  return (
    <span
      ref={slotRef}
      class={`relative inline-block h-[1.2em] w-[300px] overflow-hidden align-middle leading-none ${className}`}
      style={{ transform: 'translateY(0.22em)' }}
    >
      {words.map((word, idx) => {
        const isCurrent = idx === currentIndex;
        const isExiting = idx === prevIndex;

        let transform = 'translateY(100%)';
        let opacity = '0';

        if (isCurrent) {
          transform = 'translateY(0)';
          opacity = '1';
        } else if (isExiting) {
          transform = 'translateY(-100%)';
          opacity = '0';
        }

        return (
          <span
            key={word}
            class="absolute left-0 top-0 block w-full text-center transition-all duration-[500ms] ease-out text-primary"
            style={{
              fontFamily: 'Noto Sans, sans-serif',
              fontSize: 'clamp(32px, 6vw, 64px)',
              fontStyle: 'normal',
              fontWeight: 800,
              transform,
              opacity,
              transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}
