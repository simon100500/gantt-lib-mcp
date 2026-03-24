import { useEffect, useRef, useState } from 'react';

interface RotatingWordsProps {
  words: string[];
  interval?: number;
  className?: string;
}

export default function RotatingWords({
  words,
  interval = 1800,
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
      const maxWidth = words.reduce((max, word) => Math.max(max, getWordWidth(word)), 0);
      setWidth(maxWidth);
    }
  }, [words]);

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
      }, 420);
      return () => clearTimeout(timeout);
    }
  }, [prevIndex]);

  return (
    <>
      {/* Hidden measurer for width calculation */}
      <span
        ref={measurerRef}
        className="absolute -left-[9999px] top-0 font-extrabold"
        style={{
          fontFamily: 'Noto Sans, sans-serif',
          fontSize: 'clamp(2.2rem, 4.6vw, 4rem)',
          fontWeight: 800,
        }}
      >
        {words[currentIndex]}
      </span>

      {/* Word slot with animated width */}
      <span
        ref={slotRef}
        className={`relative inline-block overflow-hidden align-middle leading-none text-center ${className}`}
        style={{ width: `${width}px`, transition: 'width 350ms ease-out' }}
      >
        {/* Current word */}
        <span
          key={currentIndex}
          className="block w-full animate-word-in text-center text-primary"
          style={{
            fontFamily: 'Noto Sans, sans-serif',
            fontSize: 'clamp(2.2rem, 4.6vw, 4rem)',
            fontWeight: 800,
          }}
        >
          {words[currentIndex]}
        </span>

        {/* Previous word (exiting) */}
        {prevIndex !== null && (
          <span
            key={prevIndex}
            className="absolute left-0 top-0 block w-full animate-word-out text-center text-primary"
            style={{
              fontFamily: 'Noto Sans, sans-serif',
              fontSize: 'clamp(2.2rem, 4.6vw, 4rem)',
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
