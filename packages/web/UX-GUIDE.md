# UX Guide — Gantt MCP Web

> Краткий справочник по дизайн-системе. Актуален для `packages/web`.

---

## Цветовая система

### Акцентный / Primary
Яркий фиолетово-индиго. Используется для основных интерактивных элементов: переключатель активного вида, AI-кнопка, focus-ring.

```
HSL:  245 70% 60%   → ~#6158e0
CSS:  hsl(var(--primary))
TW:   bg-primary / text-primary-foreground
```

**На фоне primary — белый текст** (`--primary-foreground: 0 0% 98%`).

---

### Secondary (бледно-фиолетовый)
Светлый лавандовый с **чёрным текстом** (не инвертный). Применяется для тегов, бейджей, неактивных вкладок, pill-элементов.

```
HSL:  252 60% 94%   → ~#ece9f9
CSS:  hsl(var(--secondary))
TW:   bg-secondary / text-secondary-foreground
```

> Текст поверх secondary всегда тёмный: `--secondary-foreground: 222 47% 11%`.
> Никогда не делать secondary-кнопки с белым текстом.

---

### Backgrounds

| Токен | HSL | Описание |
|---|---|---|
| `--background` | `210 20% 98%` | Страница, основной фон |
| `--card` | `0 0% 100%` | Панели, карточки, поповеры |
| `--muted` | `210 16% 95%` | Зоны без акцента (заголовки таблиц, секции) |

---

### Текст

| Токен | HSL | Применение |
|---|---|---|
| `--foreground` | `222 47% 11%` | Основной текст |
| `--muted-foreground` | `215 16% 47%` | Вспомогательный / placeholder |

---

### Статусные цвета

```
Успех / Connected:  bg-emerald-500   #10b981
Предупреждение:     bg-amber-400     #fbbf24
Ошибка:             hsl(var(--destructive))  →  0 72% 51%  ~#e12b2b
Gantt: завершено:   #17c964
Gantt: принято:     #00670a
```

---

### Границы и разделители

```
--border:  214 14% 90%   →  ~#e2e5ea  (border-slate-200)
--input:   214 14% 90%   →  то же, для input-обводки
```

---

## Кнопки

### Принцип: действия — ghosted

Кнопки действий (тулбар, иконки) используют **ghost**-вариант. Никаких заливок в покое — фон появляется только при hover.

```tsx
// Действие в тулбаре или панели
<Button variant="ghost" size="icon">
  <Icon aria-hidden="true" />
</Button>

// Ghost с текстом
<Button variant="ghost" size="sm">Label</Button>
```

```
ghost:  прозрачный фон  →  hover: bg-accent (slate-100 / бледно-фиолетовый)
```

### Матрица вариантов

| Вариант | Когда использовать |
|---|---|
| `default` (filled violet) | Единственный главный CTA на экране (submit, Send) |
| `secondary` | Альтернативное действие рядом с `default` |
| `ghost` | **Все действия в тулбарах, панелях, списках** |
| `outline` | Нейтральные действия с явной границей |
| `destructive` | Удаление с подтверждением |
| `link` | Навигация внутри текста |

### Активное состояние (view-switcher)

Активный вид — **filled accent**, не ghost:

```tsx
<button
  className={cn(
    "px-3 py-1 rounded-md text-sm font-medium transition-colors",
    isActive
      ? "bg-violet-600 text-white shadow-sm"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
  )}
>
```

---

## Типографика

| Назначение | Font family | Weight |
|---|---|---|
| Весь UI | `'Roboto', sans-serif` | 400 / 500 / 600 |
| Логотип / моно | `'Cascadia Mono', 'Consolas', monospace` | 600 |

```
Заголовки:     text-base / text-sm  font-semibold  text-slate-900
Тело:          text-sm  font-normal  text-slate-700
Вспом. текст:  text-xs / text-sm    text-muted-foreground
```

**Типографические правила:**
- Многоточие: `…` (символ), не `...`
- Загрузка: `"Загрузка…"`, `"Сохранение…"`
- Числа: цифрами — `"8 задач"`, не `"восемь задач"`
- `font-variant-numeric: tabular-nums` для колонок с числами

---

## Layout

```
Header:   h-12  px-4  bg-white  border-b border-slate-200
Toolbar:  h-11  px-4  bg-white  border-b border-slate-200
Sidebar:  w-60  shrink-0  border-r border-slate-200  bg-background
```

**Border radius:**
```
--radius:  0.375rem  (6px)  →  rounded-md
lg:  rounded-lg  (8px)
sm:  rounded-sm  (4px)
```

---

## Скроллбар

```css
::-webkit-scrollbar         { width: 5px; height: 5px; }
::-webkit-scrollbar-thumb   { bg-slate-200, rounded-full }
::-webkit-scrollbar-thumb:hover { bg-slate-300 }
```

---

## Анимации

| Класс | Назначение |
|---|---|
| `animate-shimmer` | Skeleton-плейсхолдеры при загрузке |
| `animate-fade-up` | Появление новых сообщений в чате (0.2s ease-out) |

> Всегда учитывать `prefers-reduced-motion`. Анимировать только `transform` и `opacity`.

---

## Быстрая шпаргалка — цвета в Tailwind

```
Акцент (filled):   bg-primary text-primary-foreground
Акцент (muted):    bg-violet-600 text-white        ← active state
Secondary:         bg-secondary text-secondary-foreground  ← бледно-фиолетовый + чёрный текст
Фон страницы:      bg-background
Фон панели:        bg-card / bg-white
Приглушённый фон:  bg-muted
Граница:           border-border / border-slate-200
Текст основной:    text-foreground / text-slate-900
Текст вторичный:   text-muted-foreground / text-slate-600
Ошибка:            text-destructive / bg-destructive/10
Успех:             bg-emerald-500 / text-emerald-700
```
