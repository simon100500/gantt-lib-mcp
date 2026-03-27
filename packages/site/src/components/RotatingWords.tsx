import { useEffect, useMemo, useState } from 'react';

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
  const widestWord = useMemo(
    () => words.reduce((widest, word) => (word.length > widest.length ? word : widest), words[0] ?? ''),
    [words]
  );

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
      {/* Word slot with intrinsic width reserved by the widest word */}
      <span
        className={`relative inline-block overflow-hidden align-middle leading-none text-center ${className}`}
        style={{ paddingInline: '0.3em' }}
      >
        <span
          className="invisible block text-center"
          aria-hidden="true"
          style={{
            fontFamily: 'TT Neoris, sans-serif',
            fontSize: 'clamp(2.2rem, 4.6vw, 4rem)',
            fontWeight: 800,
          }}
        >
          {widestWord}
        </span>

        {/* Current word */}
        <span
          key={currentIndex}
          className="absolute inset-0 block w-full animate-word-in text-center text-primary"
          style={{
            fontFamily: 'TT Neoris, sans-serif',
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
              fontFamily: 'TT Neoris, sans-serif',
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
