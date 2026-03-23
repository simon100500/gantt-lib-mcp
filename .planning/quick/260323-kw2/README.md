# Quick Task 260323-kw2: Loading phrases без повторов

**Дата:** 2026-03-23

## Задача

Фразы в чате выбирались случайно с возможностью повторов. Нужно:
1. Использовать расширенный список фраз из `loading-phrases.md`
2. Реализовать выбор без повторов за одну сессию загрузки

## Решение

Создан `packages/web/src/lib/loadingPhrases.ts`:
- Все 61 фраза из markdown файла перенесены в массив
- Функция `shuffleArray()` — Fisher-Yates shuffle
- Функция `createPhraseIterator()` — создаёт итератор без повторов

Обновлён `ChatSidebar.tsx`:
- Использует итератор вместо случайного индекса
- Сбрасывает итератор при начале новой загрузки
- Фразы меняются каждые 1.8 сек, пока не кончатся

## Изменения

- `packages/web/src/lib/loadingPhrases.ts` — новый файл
- `packages/web/src/components/ChatSidebar.tsx` — обновлена логика фраз
