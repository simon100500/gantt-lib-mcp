import { useEffect, useRef, useState } from 'react';

const TEXTS = [
  'Разработка мобильного приложения для доставки еды. Старт 1 марта, дедлайн 30 мая. Команда: 2 разработчика, дизайнер, QA.',
  'Смета на ремонт офиса: демонтаж — 2 нед, отделка — 3 нед, мебель — 1 нед. Бюджет 2.4 млн.',
  'ТЗ на редизайн сайта. Этапы: аудит, прототип, дизайн, вёрстка, тестирование, запуск. 8 недель.',
];

const TYPING_SPEED = 28; // ms per character (base)
const TYPING_VARIANCE = 22; // ms random variance
const PAUSE_AT_END = 2200; // ms before erasing
const ERASE_SPEED = 12; // ms per character when erasing
const PAUSE_BETWEEN = 400; // ms between texts

export default function InputDemo() {
  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const textIndex = useRef(0);
  const charIndex = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const currentText = TEXTS[textIndex.current];

    function typeStep() {
      if (isTyping) {
        // Typing
        charIndex.current++;
        setText(currentText.slice(0, charIndex.current));

        if (charIndex.current >= currentText.length) {
          // Finished typing, pause
          setIsTyping(false);
          timeoutRef.current = setTimeout(typeStep, PAUSE_AT_END);
          return;
        }

        // Continue typing with random variance
        const delay = TYPING_SPEED + Math.random() * TYPING_VARIANCE;
        timeoutRef.current = setTimeout(typeStep, delay);
      } else {
        // Erasing
        charIndex.current--;
        setText(currentText.slice(0, charIndex.current));

        if (charIndex.current <= 0) {
          // Finished erasing, move to next text
          setIsTyping(true);
          textIndex.current = (textIndex.current + 1) % TEXTS.length;
          timeoutRef.current = setTimeout(typeStep, PAUSE_BETWEEN);
          return;
        }

        // Continue erasing
        timeoutRef.current = setTimeout(typeStep, ERASE_SPEED);
      }
    }

    // Start typing after initial delay
    timeoutRef.current = setTimeout(typeStep, 800);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isTyping]);

  return (
    <div className="relative mx-auto mt-12 max-w-[700px] animate-fade-up px-4 md:px-8" style={{ animationDelay: '350ms' }}>
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
        {/* Top: avatar + typing text */}
        <div className="flex items-start gap-2.5 border-b border-border bg-background p-3.5 px-4">
          <div className="flex shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground" style={{ width: 32, height: 32 }}>
            G
          </div>
          <div className="pt-1 text-[14px] leading-[1.5] text-secondary-foreground" style={{ fontFamily: 'Noto Sans, sans-serif' }}>
            {text}
            <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-primary animate-blink"></span>
          </div>
        </div>

        {/* Bottom: hint + button */}
        <div className="flex items-center justify-between bg-muted px-4 py-2.5">
          <span className="text-[12px] text-muted-foreground">
            Поддерживает PDF, DOCX, Excel, текст
          </span>
          <button className="inline-flex items-center gap-1.5 rounded-[7px] bg-primary px-4 py-1.5 text-[13px] font-extrabold text-primary-foreground transition-all hover:opacity-90 hover:-translate-y-0.5">
            Создать Гантт &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
