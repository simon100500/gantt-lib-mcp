import { useEffect, useRef, useState } from 'react';

interface RotatingWordsProps {
  words: string[];
  interval?: number;
  className?: string;
}

export default function RotatingWords({
  words,
  interval = 2800,
  className = '',
}: RotatingWordsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const slotRef = useRef<HTMLSpanElement>(null);
  const measurerRef = useRef<HTMLSpanElement>(null);

  // Measure word widths
  const getWordWidth = (word: string) => {
    if (!measurerRef.current) return 0;
    measurerRef.current.textContent = word;
    return measurerRef.current.offsetWidth;
  };

  // Set initial width
  useEffect(() => {
    if (measurerRef.current) {
      const initialWidth = getWordWidth(words[0]);
      setWidth(initialWidth);
    }
  }, [words]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPrevIndex(currentIndex);
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, interval);

    return () => clearInterval(timer);
  }, [words.length, interval, currentIndex]);

  // Animate width when word changes
  useEffect(() => {
    if (measurerRef.current) {
      const newWidth = getWordWidth(words[currentIndex]);
      setWidth(newWidth);
    }
  }, [currentIndex, words]);

  // Clear prev index after animation completes
  useEffect(() => {
    if (prevIndex !== null) {
      const timeout = setTimeout(() => {
        setPrevIndex(null);
      }, 420);
      return () => clearTimeout(timeout);
    }
  }, [prevIndex]);

  return (
    <>
      {/* Hidden measurer for width calculation */}
      <span
        ref={measurerRef}
        class="absolute -left-[9999px] top-0 font-extrabold"
        style={{
          fontFamily: 'Noto Sans, sans-serif',
          fontSize: 'clamp(36px, 6.2vw, 64px)',
          fontWeight: 800,
        }}
      >
        {words[currentIndex]}
      </span>

      {/* Word slot with animated width */}
      <span
        ref={slotRef}
        class={`relative inline-block overflow-hidden align-middle leading-none ${className}`}
        style={{ width: `${width}px`, transition: 'width 350ms ease-out' }}
      >
        {/* Current word */}
        <span
          key={currentIndex}
          class="block animate-word-in text-primary"
          style={{
            fontFamily: 'Noto Sans, sans-serif',
            fontSize: 'clamp(36px, 6.2vw, 64px)',
            fontWeight: 800,
          }}
        >
          {words[currentIndex]}
        </span>

        {/* Previous word (exiting) */}
        {prevIndex !== null && (
          <span
            key={prevIndex}
            class="absolute left-0 top-0 block animate-word-out text-primary"
            style={{
              fontFamily: 'Noto Sans, sans-serif',
              fontSize: 'clamp(36px, 6.2vw, 64px)',
              fontWeight: 800,
            }}
          >
            {words[prevIndex]}
          </span>
        )}
      </span>
    </>
  );
}
