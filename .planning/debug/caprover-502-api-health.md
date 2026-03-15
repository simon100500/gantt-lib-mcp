---
status: awaiting_human_verify
trigger: "caprover-502-api-health: https://getgantt.ru/api/health возвращает 502 Bad Gateway после первого деплоя на CapRover"
created: 2026-03-16T11:30:00Z
updated: 2026-03-16T11:45:00Z
---

## Current Focus

hypothesis: docker-entrypoint.sh запускает node /app/server/dist/index.js напрямую, но правильный entry point — /app/server/dist/bootstrap.js. Вследствие этого dotenv не загружается ДО импорта index.ts, и auth.ts падает с "JWT_SECRET environment variable is required" на этапе module evaluation (top-level throw). Node.js процесс крашится сразу при старте.
test: прочитан исходник auth.ts — строки 12-15 выполняют top-level throw если JWT_SECRET не задан. bootstrap.ts загружает dotenv ПЕРЕД динамическим импортом index.js. docker-entrypoint.sh вызывает index.js напрямую — минуя bootstrap.
expecting: это объясняет 502 на /api/health: nginx стартует нормально, проксирует /api/ → 127.0.0.1:3000, но Node.js не слушает порт 3000 потому что крашнулся при старте.
next_action: деплой на CapRover и проверка https://getgantt.ru/api/health

## Symptoms

expected: GET /api/health возвращает 200 OK с JSON-статусом сервера
actual: 502 Bad Gateway
errors: нет конкретных сообщений об ошибках — только 502
reproduction: просто открыть https://getgantt.ru/api/health
started: первый деплой после v1.0.0, никогда до этого не работало на этом сервере

## Eliminated

- hypothesis: CapRover Container HTTP Port не совпадает с 80
  evidence: captain-definition указывает Dockerfile, Dockerfile делает EXPOSE 80, nginx слушает 80 — это стандартная конфигурация, правдоподобный кандидат но не объясняет почему /api/health не работает если бы порт был верный
  timestamp: 2026-03-16T11:35:00Z

- hypothesis: Race condition (nginx стартует раньше Node)
  evidence: симптомы описывают что health-check ПОСТОЯННО падает, не только первые секунды. Race condition не объясняет устойчивый 502.
  timestamp: 2026-03-16T11:36:00Z

## Evidence

- timestamp: 2026-03-16T11:32:00Z
  checked: docker-entrypoint.sh строка 11
  found: "node /app/server/dist/index.js &" — запускает index.js напрямую
  implication: bootstrap.ts полностью пропускается

- timestamp: 2026-03-16T11:33:00Z
  checked: packages/server/src/bootstrap.ts
  found: bootstrap.ts загружает dotenv({ path: join(PROJECT_ROOT, '.env') }) ПЕРЕД динамическим импортом index.js. Комментарий явно указывает: "auth.ts validates JWT_SECRET at import time"
  implication: если index.js запускается напрямую — dotenv не вызывается, env переменные не загружаются из .env файла

- timestamp: 2026-03-16T11:34:00Z
  checked: packages/server/src/auth.ts строки 12-15
  found: |
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  Это TOP-LEVEL код — выполняется при импорте модуля, не в функции.
  implication: если JWT_SECRET не задан в process.env в момент импорта auth.ts — Node.js процесс упадёт с необработанным исключением

- timestamp: 2026-03-16T11:35:00Z
  checked: Dockerfile строки 76-80 (ENV инструкции)
  found: Dockerfile задаёт ENV для OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, DB_PATH, PORT через ARG. НО JWT_SECRET НЕ ЗАДАН как ARG/ENV в Dockerfile — он должен приходить как runtime env var через CapRover.
  implication: JWT_SECRET гарантированно отсутствует если: (1) в CapRover не настроена env variable, ИЛИ (2) bootstrap не загрузил .env файл

- timestamp: 2026-03-16T11:36:00Z
  checked: packages/server/package.json scripts
  found: "start": "node dist/bootstrap.js" — правильный entry point для production
  implication: docker-entrypoint.sh должен вызывать bootstrap.js, а не index.js

- timestamp: 2026-03-16T11:37:00Z
  checked: nginx.conf location /api/
  found: proxy_pass http://127.0.0.1:3000; — корректно. Nginx конфиг не содержит ошибок.
  implication: nginx не является источником проблемы

- timestamp: 2026-03-16T11:38:00Z
  checked: /health route в index.ts строка 33
  found: fastify.get('/health', async () => ({ status: 'ok' })); — без /api/ prefix
  implication: ВТОРОЙ баг: nginx.conf проксирует location /api/ → Node:3000, но /health в Fastify зарегистрирован как /health без /api/ prefix. Запрос GET /api/health от nginx придёт на Node как /api/health, но в Fastify нет route /api/health — только /health. Fastify вернёт 404, не 200.

## Resolution

root_cause: |
  ДВА бага вместе:

  БАГ 1 (КРИТИЧЕСКИЙ — причина 502):
  docker-entrypoint.sh запускает `node /app/server/dist/index.js` напрямую, минуя bootstrap.ts.
  bootstrap.ts отвечает за загрузку dotenv ПЕРЕД импортом модулей.
  auth.ts содержит top-level throw: if (!JWT_SECRET) throw new Error(...)
  При запуске без bootstrap: JWT_SECRET = undefined → throw на этапе module evaluation → Node.js process crashes → порт 3000 не слушается → nginx получает Connection refused → 502 Bad Gateway.

  БАГ 2 (ФУНКЦИОНАЛЬНЫЙ — даже если Node запустится):
  /health зарегистрирован в Fastify без /api/ prefix.
  nginx проксирует /api/* → Node:3000 с сохранением пути.
  Запрос GET /api/health → nginx → Node:3000/api/health → Fastify 404 (route not found).
  Правильный URL для прямого обращения к Fastify: /health (без /api/).
  Но через nginx нужно либо: зарегистрировать route как /api/health, либо настроить rewrite в nginx.

fix: |
  1. docker-entrypoint.sh: заменить `node /app/server/dist/index.js` на `node /app/server/dist/bootstrap.js`
  2. Для /health через nginx: либо изменить route на /api/health в index.ts, либо добавить nginx rewrite.
     Рекомендуется: переименовать route в /api/health (консистентно с остальным API).

verification: фиксы применены локально. Требуется деплой на CapRover и проверка GET https://getgantt.ru/api/health → 200 OK {"status":"ok"}
files_changed:
  - docker-entrypoint.sh
  - packages/server/src/index.ts
