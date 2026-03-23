import { useEffect, useRef, useState } from 'react';

interface RotatingWordsProps {
  words: string[];
  interval?: number; // ms between rotations
  className?: string;
}

export default function RotatingWords({
  words,
  interval = 2500,
  className = '',
}: RotatingWordsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [width, setWidth] = useState(0);
  const slotRef = useRef<HTMLSpanElement>(null);
  const measurerRef = useRef<HTMLSpanElement>(null);

  // Measure word widths
  const getWordWidth = (word: string) => {
    if (!measurerRef.current) return 0;
    measurerRef.current.textContent = word;
    return measurerRef.current.offsetWidth;
  };

  useEffect(() => {
    // Set initial width
    if (slotRef.current && measurerRef.current) {
      const initialWidth = getWordWidth(words[0]);
      setWidth(initialWidth);
      slotRef.current.style.width = `${initialWidth}px`;
    }
  }, [words]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
      setNextIndex((prev) => (prev + 1) % words.length);
    }, interval);

    return () => clearInterval(timer);
  }, [words.length, interval]);

  // Animate width when word changes
  useEffect(() => {
    if (slotRef.current) {
      const newWidth = getWordWidth(words[currentIndex]);
      setWidth(newWidth);
      slotRef.current.style.width = `${newWidth}px`;
    }
  }, [currentIndex, words]);

  return (
    <>
      {/* Hidden measurer for width calculation */}
      <span
        ref={measurerRef}
        className="absolute -left-[9999px] top-0 font-extrabold"
        style={{
          fontFamily: 'Noto Sans, sans-serif',
          fontSize: 'clamp(48px, 7vw, 84px)',
          fontStyle: 'normal',
          fontWeight: 800,
        }}
      >
        {words[currentIndex]}
      </span>

      {/* Word slot with animated width */}
      <span
        ref={slotRef}
        className={`relative inline-block overflow-hidden align-baseline transition-all duration-[350ms] ease-out ${className}`}
        style={{ width: `${width}px` }}
      >
        {/* Current word (visible) */}
        <span
          key={currentIndex}
          className="block animate-word-in text-primary"
          style={{
            fontFamily: 'Noto Sans, sans-serif',
            fontSize: 'clamp(48px, 7vw, 84px)',
            fontStyle: 'normal',
            fontWeight: 800,
          }}
        >
          {words[currentIndex]}
        </span>

        {/* Previous word (exiting) */}
        {currentIndex > 0 && (
          <span
            key={currentIndex - 1}
            className="absolute left-0 top-0 block animate-word-out text-primary"
            style={{
              fontFamily: 'Noto Sans, sans-serif',
              fontSize: 'clamp(48px, 7vw, 84px)',
              fontStyle: 'normal',
              fontWeight: 800,
            }}
          >
            {words[currentIndex - 1]}
          </span>
        )}
      </span>
    </>
  );
}
