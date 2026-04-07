Настройка скрипта sdk-suggest.js для страницы авторизации
На странице, где пользователь будет осуществлять авторизацию, подключите одну из версий скрипта:

<head>
   <script src="https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js"></script>
</head>

См. также:

Полифилы
Синтаксис и параметры
YaAuthSuggest.init(oauthQueryParams, tokenPageOrigin, [suggestParams])

Важно

Группа параметров suggestParams применяется только для кнопки. Если вы используете виджет, не указывайте эти параметры.

Пример вызова:

YaAuthSuggest.init(
      {
         client_id: 'c46f0c53093440c39f12eff95a9f2f93',
         response_type: 'token',
         redirect_uri: 'https://examplesite.com/suggest/token'
      },
      'https://examplesite.com'
   )
   .then(({
      handler
   }) => handler())
   .then(data => console.log('Сообщение с токеном', data))
   .catch(error => console.log('Обработка ошибки', error));

См. также Пример использования скрипта на странице HTML

Описание параметров:

Параметр

Обязательный

Тип

Описание

oauthQueryParams — содержит query-параметры, с которыми будет открыта страница OAuth-авторизации (см. список всех query-параметров)
client_id

Да

string

Идентификатор OAuth-приложения, который был получен после регистрации

response_type

Да

string

Тип запроса

redirect_uri

Нет

string

URL вспомогательной страницы, принимающей токен. Должен совпадать с адресом, который вы указали в поле Redirect URI OAuth-приложения с данным client_id. Используется для передачи результата авторизации. Если параметр не указан, то будет использовано первое из значений поля Redirect URI

tokenPageOrigin — параметр для взаимодействия страницы авторизации со вспомогательной страницей посредством postMessage
Указывается только значение параметра

Да

string

Origin вспомогательной страницы, которая принимает токен. Значение параметра должно быть всегда заполнено и не должно содержать символ *

suggestParams — параметры для выбора внешнего вида кнопки. Указываются, только если в качестве блока авторизации используется кнопка, для виджета эта группа параметров не используется. Подобрать нужные значения параметров можно с помощью конструктора кнопок
view

Да

string

Параметр для отображения кнопки со значением button

parentId

Нет

string

Значение атрибута id контейнера, в который нужно встроить кнопку. Если id не найден, кнопка будет встроена в body

buttonView

Нет

string

Тип кнопки. По умолчанию — main. Возможные значения:

main — основная версия: черная кнопка с фирменным знаком Яндекса и текстом. Кнопка становится белой при смене темы кнопки (buttonTheme) на темную
additional — дополнительная версия: кнопка с обводкой по периметру. Отличается от основной тем, что контрастным к теме является не фон кнопки, а обводка
icon — квадратная кнопка-иконка с фирменным знаком Яндекса на красном фоне. Границы кнопки можно скруглять
iconBG — квадратная кнопка-иконка с фирменным знаком Яндекса (буква "Я" в красном круге) на сером фоне с серой обводкой по периметру. Цвет фона, цвет и ширину обводки можно изменять, а границы кнопки скруглять
buttonTheme

Нет

string

Тема кнопки. Параметр необходимо изменять при смене темы страницы вашего сайта или приложения, чтобы кнопка не сливалась с цветом фона. По умолчанию — light. Возможные значения:

light — светлая тема
dark — темная тема
buttonSize

Нет

string

Размер кнопки, указывающий на базовую высоту, минимальную ширину и переключение на сокращенный вид. По умолчанию — m. Возможные значения:

xs | s | m | l | xl | xxl
buttonBorderRadius

Нет

number

Радиус скругления границ кнопки (значение border-radius css-свойства в px). По умолчанию — 0

buttonIcon

Нет

string

Языковой вариант логотипа на кнопке. По умолчанию — ya. Возможные значения:

ya — русскоязычный вариант
yaEng — англоязычный вариант
customBgColor

Нет

string

Цвет фона подложки кнопки-иконки. Задается в любом из форматов, поддерживаемых в CSS. Актуально только для кнопки с типом iconBG

customBgHoveredColor

Нет

string

Цвет фона подложки кнопки-иконки под курсором. Задается в любом из форматов, поддерживаемых в CSS. Актуально только для кнопки с типом iconBG

customBorderColor

Нет

string

Цвет обводки кнопки-иконки. Задается в любом из форматов, поддерживаемых в CSS. Актуально только для кнопки с типом iconBG

customBorderHoveredColor

Нет

string

Цвет обводки кнопки-иконки под курсором. Задается в любом из форматов, поддерживаемых в CSS. Актуально только для кнопки с типом iconBG

customBorderWidth

Нет

number

Толщина обводки кнопки-иконки. Актуально только для кнопки с типом iconBG




Настройка скрипта sdk-suggest-token.js для вспомогательной страницы
На странице, которая будет принимать OAuth-токен, подключите одну из версий скрипта sdk-suggest-token.js:

<head>
   <script src="https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-token-with-polyfills-latest.js"></script>
</head>

См. также:

Полифилы
Синтаксис и параметры
YaSendSuggestToken(origin, extraData)

Пример вызова для виджета или кнопки авторизации:

YaSendSuggestToken(
   'https://examplesite.com',
   {
      flag: true
   }
)

См. также Пример использования скрипта на странице HTML

Описание параметров:

Параметр

Описание

origin

Origin страницы с кнопкой или виджетом, на которую будет отправлен postMessage с токеном. Значение параметра должно быть всегда заполнено и не должно содержать символ *.

extraData

Дополнительные данные, отправляемые на страницу с кнопкой. Должен быть валидным JSON-объектом.

Возвращаемое значение
Ничего не возвращает.

Пример использования на странице HTML
Для настройки вспомогательной страницы, которая принимает токен, используйте код:

<!doctype html>
<html lang="ru">

<head>
   <meta charSet="utf-8" />
   <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, shrink-to-fit=no, viewport-fit=cover'>
   <meta http-equiv='X-UA-Compatible' content='ie=edge'>
   <style>
      html,
      body {
         background: #eee;
      }
   </style>
   <script src="https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-token-with-polyfills-latest.js"></script>
</head>

<body>
   <script>
      window.onload = function() {
         window.YaSendSuggestToken("https://examplesite.com", {
            "kek": true
         });
      };
   </script>
</body>

</html>

---

## Phase 40 implementation notes

### Confirmed scope

- Phase 40 applies only to `packages/web` and backend auth routes/services
- `packages/site` / Astro does not participate in login orchestration in this phase
- OTP stays as reserve fallback inside the web-app auth flow

### Confirmed Yandex suggest flow

On the web-app auth page:

```html
<script src="https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js"></script>
```

Runtime contract:

```js
YaAuthSuggest.init(
  {
    client_id: VITE_YANDEX_CLIENT_ID,
    response_type: 'token',
    redirect_uri: 'https://ai.getgantt.ru/auth/yandex/callback'
  },
  'https://ai.getgantt.ru/auth/yandex/callback'
)
```

Notes:

- `client_id` comes from the issued Yandex OAuth application
- `response_type` is `token`
- `redirect_uri` must exactly match the Redirect URI configured in Yandex OAuth
- The second argument is the origin of the auxiliary token page as required by Yandex suggest docs

On the auxiliary callback page `https://ai.getgantt.ru/auth/yandex/callback`:

```html
<script src="https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-token-with-polyfills-latest.js"></script>
```

```js
YaSendSuggestToken('https://ai.getgantt.ru', {
  source: 'yandex-suggest'
})
```

Notes:

- The callback page exists only for token handoff and may stay visually empty
- It sends the OAuth token back to the main web-app origin `https://ai.getgantt.ru`

### Env contract

Frontend-only:

- `VITE_YANDEX_CLIENT_ID=<issued-client-id>`

Backend-only:

- `YANDEX_CLIENT_SECRET=<issued-client-secret>` if the selected server-side verification/exchange path needs it

Rules:

- Never place `YANDEX_CLIENT_SECRET` into `packages/web/.env`
- `Client ID` is safe for frontend usage
- `Client Secret` stays server-only even if Phase 40 ends up not using it directly in v1

### Manual verification checklist

1. Open the web-app auth modal and confirm Yandex login is the primary action.
2. Start Yandex login and confirm the suggest script opens the Yandex auth flow.
3. Confirm `https://ai.getgantt.ru/auth/yandex/callback` loads and returns the token to the opener page.
4. Confirm frontend sends the Yandex token to backend and receives the standard app auth payload.
5. Confirm successful Yandex login still runs the existing post-login import/bootstrap flow.
6. Confirm OTP fallback remains available and works end to end.
7. Confirm no `packages/site` / Astro changes are required for the auth flow to work.
