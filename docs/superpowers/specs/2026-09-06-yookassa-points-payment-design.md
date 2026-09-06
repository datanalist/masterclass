# Пополнение баллов через YooKassa

Дата: 2026-09-06  
Статус: черновик на ревью (утверждён в обсуждении, ждёт ревью файла)  
Источник: `docs/pay.md`  
Подход: Edge Functions + атомарный RPC

## Цель

Авторизованный пользователь покупает пакет баллов картой через YooKassa. Клиент передаёт только `package_id` и JWT. Сумма, число баллов и начисление живут на сервере. Один `provider_payment_id` начисляет баллы ровно один раз.

Это заменяет заглушку на `/profile` и продуктовую формулировку «эквайринг не подключаем» в `docs/tz.md` для пополнения. Генерация, списание и рефанды не меняются.

## Вне скоупа

- Чек 54-ФЗ (отдельный follow-up, см. ниже)
- История платежей в UI
- Ограничение «один pending на пользователя»
- IP-allowlist YooKassa
- Перенос `create-payment` / webhook на Vercel
- Удаление RPC `redeem_package` (только закрываем клиентский доступ)
- Смена тарифов генерации и бонуса регистрации

## Follow-up: чек 54-ФЗ

Не делать в этой реализации. Не забыть доделать до приёма живых платежей в проде, если магазин YooKassa требует фискализацию.

Сейчас:

- В `create-payment` добавить функцию `buildReceipt(packageRow, user)` и вызывать её при сборке тела платежа.
- `buildReceipt` возвращает `undefined`, поэтому поле `receipt` в запрос YooKassa не попадает.
- Над функцией комментарий: `TODO(54-FZ receipt)`.

Позже (отдельный план, не этот):

- `buildReceipt` возвращает объект чека YooKassa: email из `profiles.email`, одна позиция = пакет (`title`, `amount_rub`, `points` только в описании, не как цена).
- Передавать `receipt` в `POST /v3/payments`.
- Не менять таблицу `payment_transactions` и RPC начисления: чек — деталь создания платежа, не леджера.
- Пока заглушка на месте, в логах `create-payment` писать `receipt=omitted`.

## Решения

| Тема | Решение |
|------|---------|
| Пакеты | Как в `docs/pay.md`: `starter` / `growth` / `pro` |
| Источник пакетов | Таблица `credit_packages`, не константа в функции |
| Повторный клик | Каждый успешный вызов `create-payment` создаёт новый платёж |
| Возврат с оплаты | `/profile?payment=pending` + баннер и polling баланса |
| `redeem_package` | Остаётся для локалки / `service_role`; у `authenticated` и `anon` — `REVOKE` |
| Проект Supabase | URL из env (`.env.local`), не `project_ref` из `docs/pay.md` |
| Проверка webhook | `GET /v3/payments/{id}` секретом магазина; телу уведомления не доверяем |

## Архитектура

Три контура:

1. **Фронт (Vite)** — список пакетов, вызов `create-payment`, редирект на YooKassa, баннер и `refreshProfile`. URL функций: `{VITE_SUPABASE_URL}/functions/v1/<name>`.
2. **Edge Functions** — `create-payment` (JWT обязателен) и `yookassa-webhook` (`verify_jwt = false`). Секреты YooKassa и service role только здесь.
3. **Postgres** — whitelist пакетов, `payment_transactions` для идемпотентности, RPC `private.finalize_yookassa_payment` для атомарного начисления.

Поток:

1. `/profile` читает активные пакеты из `credit_packages`.
2. Клик → `POST create-payment` с JWT и `{ package_id }`.
3. Функция читает пакет, создаёт платёж в YooKassa, пишет `payment_transactions` со статусом `pending`, возвращает `confirmation_url`.
4. Браузер уходит на YooKassa. `return_url` = `{PUBLIC_APP_URL}/profile?payment=pending`.
5. Пользователь возвращается на профиль: баннер и polling баланса.
6. YooKassa шлёт webhook. Функция заново читает платёж в API YooKassa и вызывает RPC.
7. RPC в одной транзакции: `pending → succeeded`, плюс `points_balance`, плюс `balance_transactions` с `kind = 'topup'`.

```text
ProfilePage --JWT+package_id--> create-payment --> YooKassa
                                      |                |
                                      v                v
                           payment_transactions     user pays
                           status=pending              |
                                                       v
ProfilePage <--refreshProfile-- finalize RPC <-- yookassa-webhook
```

## Окружение

Никакого хардкода `ricsxgfkepwmdqbfivir` или полного URL функций.

| Переменная | Где | Назначение |
|------------|-----|------------|
| `VITE_SUPABASE_URL` | `.env.local`, клиент | База URL проекта и функций |
| `VITE_SUPABASE_ANON_KEY` или `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, клиент | Вызов функции с пользовательским JWT |
| `SUPABASE_URL` | secrets функции, `.env.local` (сервер) | Клиент service role внутри функций |
| `SUPABASE_SERVICE_ROLE_KEY` | только secrets / серверный `.env.local` | Обход RLS, вызов RPC |
| `YOOKASSA_SHOP_ID` | только secrets / серверный `.env.local` | API YooKassa |
| `YOOKASSA_SECRET_KEY` | только secrets / серверный `.env.local` | API YooKassa |
| `PUBLIC_APP_URL` | secrets функции и `.env.local` | Абсолютный `return_url`, не с клиента |

Имена добавить в `.env.example` без значений. Значения в git не коммитить.

Локальный `supabase functions serve` читает те же имена из env-файла, который не в git (копия из `.env.local` или `supabase secrets`). Деплой: `supabase secrets set` с машины разработчика, не из репозитория.

`create-payment` не принимает `return_url` из body. Origin с клиента не доверяем.

## База

### `credit_packages`

Источник истины для витрины и сервера.

Миграция:

- Вставить (или обновить) активные пакеты:

  | id | title | points | amount_rub | is_active | sort_order |
  |----|-------|--------|------------|-----------|------------|
  | `starter` | 100 баллов | 100 | 490 | true | 1 |
  | `growth` | 300 баллов | 300 | 1290 | true | 2 |
  | `pro` | 750 баллов | 750 | 2790 | true | 3 |

- Старые `s` / `m` / `l`: `is_active = false`. Не удалять — на них может ссылаться `balance_transactions.package_id`.
- `create-payment` отвергает пакет, если он не найден, неактивен, `points <= 0` или `amount_rub` пустой / `<= 0`.

### `payment_transactions`

Новая таблица. Минимальные поля как в `docs/pay.md`, плюс FK на пакет:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.profiles(id) on delete cascade`
- `provider text not null default 'yookassa'`
- `provider_payment_id text not null unique`
- `idempotence_key text not null unique`
- `package_id text not null references public.credit_packages(id)`
- `amount_rub integer not null check (amount_rub > 0)`
- `points integer not null check (points > 0)`
- `status text not null check (status in ('pending', 'succeeded', 'canceled', 'failed'))`
- `raw_payload jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Индексы: уникальные на `provider_payment_id` и `idempotence_key`; `(user_id, created_at desc)`.

RLS: включить. Политика `SELECT` только `user_id = auth.uid()`. `INSERT` / `UPDATE` / `DELETE` клиенту не давать. Пишет service role.

Несколько строк `pending` у одного пользователя разрешены.

### RPC `private.finalize_yookassa_payment`

Сигнатура: `(p_provider_payment_id text, p_status text, p_raw_payload jsonb)`.  
`SECURITY DEFINER`, `search_path = ''`. Вызов только от `service_role` (webhook). Клиенту `GRANT EXECUTE` не давать.

`p_status` ∈ `succeeded` | `canceled` | `failed`.

Алгоритм при `succeeded`:

1. `SELECT ... FOR UPDATE` строки по `provider_payment_id`.
2. Нет строки — исключение (функция webhook вернёт 500, YooKassa повторит).
3. Уже `succeeded` — no-op, вернуть текущий `points_balance`.
4. Иначе: `status = 'succeeded'`, `raw_payload = p_raw_payload`, `updated_at = now()`.
5. `profiles.points_balance += payment_transactions.points` (число из строки платежа, не из webhook).
6. `INSERT` в `balance_transactions`: `kind = 'topup'`, `amount = points`, `balance_after`, `package_id`, `note = 'YooKassa payment <provider_payment_id>'`.

`canceled` / `failed`: обновить статус и `raw_payload`, баллы не менять. Если строка уже `succeeded`, статус не откатывать и баллы не трогать.

`waiting_for_capture` в RPC не передаём: webhook оставляет `pending`.

### `redeem_package`

Функции `public.redeem_package` / `private.redeem_package` не удалять.  
`REVOKE ALL` / `REVOKE EXECUTE` у `anon` и `authenticated`.  
`GRANT EXECUTE` оставить `service_role`. Локально вызывать только через service role / Studio.

## Edge Functions

Файлы: `supabase/functions/create-payment`, `supabase/functions/yookassa-webhook`.  
`supabase/config.toml` завести, если его ещё нет. У `yookassa-webhook` `verify_jwt = false`.  
Деплой webhook: `supabase functions deploy yookassa-webhook --no-verify-jwt`.

CORS для браузерного `POST` на `create-payment` (и `OPTIONS`). Webhook CORS не нужен.

Логировать: `package_id`, `provider_payment_id`, статус, новый баланс, `receipt=omitted`. Не логировать секреты, secret key, access token.

### `POST /create-payment`

Auth: `Authorization: Bearer <access_token>`. Пользователь только из JWT (`auth.getUser()`), не из body.

Тело:

```json
{ "package_id": "starter" }
```

Шаги:

1. Нет / невалидный JWT → `401`.
2. Прочитать пакет из `credit_packages` (см. правила выше). Иначе → `400`.
3. Сгенерировать `idempotence_key` (UUID).
4. `POST https://api.yookassa.ru/v3/payments` с Basic (`YOOKASSA_SHOP_ID`:`YOOKASSA_SECRET_KEY`) и заголовком `Idempotence-Key`.
   - `amount.value` = `amount_rub` пакета, формат как требует YooKassa (`"490.00"`), `currency = RUB`.
   - `confirmation.type = redirect`.
   - `confirmation.return_url = {PUBLIC_APP_URL}/profile?payment=pending`.
   - `metadata`: `user_id`, `package_id`, `points` (справочно; начисление их не использует).
   - `receipt`: результат `buildReceipt(...)` — сейчас отсутствует.
5. Вставить `payment_transactions` (`status = pending`, сумма и баллы из строки пакета, `provider_payment_id` из ответа YooKassa).
6. Ответ `200`: `{ "payment_id": "<yookassa id>", "confirmation_url": "https://..." }`.

Порядок: сначала платёж в YooKassa, затем insert. URL клиенту отдаём только после успешного insert. Если insert упал — `500`, `confirmation_url` не возвращаем (пользователь не уйдёт оплачивать «осиротевший» платёж). Если такой платёж всё же появится в YooKassa, webhook без строки ответит `500` и будет ретраиться — это операционный случай, не нормальный путь.

Ошибки YooKassa / БД → `500`. Поля `amount` и `points` из body игнорировать, даже если пришли.

### `POST /yookassa-webhook`

JWT не проверять.

1. Прочитать `event` и `object.id`.
2. `GET https://api.yookassa.ru/v3/payments/{id}` тем же Basic. Тело уведомления для суммы, `paid` и статуса не использовать.
3. Событие `payment.succeeded` и в API `status = succeeded` и `paid = true`:
   - Найти `payment_transactions` по id.
   - Сравнить сумму так: `amount.value` из API — строка вида `"490.00"`; наши пакеты в целых рублях. Совпадение = `Number(amount.value) === payment_transactions.amount_rub`. Иначе выставить `failed` через RPC, ответить `200`, баллы не начислять. Так YooKassa не будет ретраить вечно.
   - Иначе вызвать RPC `succeeded` с сырым JSON ответа API (не уведомления).
4. Событие `payment.canceled` или в API `canceled` → RPC `canceled`, `200`.
5. Нет строки платежа → `500`.
6. Уже `succeeded` → RPC no-op, `200`.
7. Прочие события (включая `waiting_for_capture`) → `200` без смены статуса, если это не `canceled` / `succeeded`.

IP-список YooKassa не внедряем: источник истины — ответ API по секрету магазина.

Webhook URL в кабинете YooKassa: `{SUPABASE_URL}/functions/v1/yookassa-webhook` (тот же проект, что в `.env.local`).

## Фронт

Файл: `src/pages/ProfilePage.jsx` плюс узкий helper вызова оплаты (например `src/lib/createPayment.js`), без нового роута.

Витрина:

- `select id, title, points, amount_rub from credit_packages where is_active order by sort_order`.
- Кнопка: `{title}` и цена `{amount_rub} ₽`.
- Текст «Пополнение пакетами — без эквайринга» убрать. Коротко объяснить, что оплата идёт через YooKassa.
- `redeem_package` с клиента не вызывать.

Клик:

- На время запроса эта кнопка в loading, чтобы один клик не ушёл дважды.
- После ответа новый клик (в том числе по другому пакету) снова создаёт платёж.
- JWT из `supabase.auth.getSession()`.
- `fetch` на `{VITE_SUPABASE_URL}/functions/v1/create-payment`.
- Успех: `window.location.href = confirmation_url`.
- `401` → открыть существующий `AuthModal`.
- `400` → «Пакет недоступен».
- `500` / нет `confirmation_url` → «Не удалось начать оплату».

Возврат:

- URL: `/profile?payment=pending`.
- Баннер: «Оплата принята, баллы вот-вот появятся».
- Запомнить `points_balance` на момент входа с этим query.
- Polling `refreshProfile` каждые 2 с, всего 12 с (6 попыток).
- Баланс вырос → «Баллы начислены», убрать query (`replace` в истории).
- Таймаут → «Если деньги списаны, баллы появятся чуть позже, обновите страницу».
- Topbar читает тот же `profile` из `useAuth`, отдельный запрос не нужен.

Гость на `/profile` без пакетов и без вызова оплаты — как сейчас.

## Ошибки

| Случай | Поведение |
|--------|-----------|
| Нет JWT на `create-payment` | 401, на клиенте AuthModal |
| Неизвестный / неактивный пакет | 400 |
| Нет `PUBLIC_APP_URL` или секретов YooKassa | 500, без утечки секрета в ответ |
| YooKassa create упал | 500, строки `pending` нет |
| Insert после create упал | 500, URL клиенту не отдаём |
| Webhook, нет строки | 500, ретрай YooKassa |
| Повторный succeeded | 200, баланс тот же |
| Сумма API ≠ `amount_rub` | RPC `failed`, 200, без баллов |
| Клиент прислал свои amount/points | Игнор, считаем только таблицу |

## Тесты

Без живого магазина YooKassa. Мокать `fetch` к API и клиент Supabase в функциях.

RPC:

- первый `succeeded` увеличивает баланс на `points` строки и пишет `topup`;
- второй `succeeded` с тем же `provider_payment_id` не меняет баланс;
- `canceled` не меняет баланс;
- нет строки — ошибка;
- уже `succeeded`, затем `canceled` — баланс и статус `succeeded` не откатываются.

`create-payment`:

- без JWT → 401;
- неактивный / неизвестный `package_id` → 400;
- `buildReceipt()` возвращает `undefined`.

`yookassa-webhook`:

- мок API `succeeded` + совпавшая сумма → RPC succeeded;
- сумма не совпала → failed, без начисления;
- повтор уведомления → 200.

UI: чистая функция статуса баннера (`pending` / `credited` / `timeout`) покрыть юнит-тестом, если её вынести из компонента.

## Критерии приёмки

1. Авторизованный пользователь выбирает активный пакет и уходит на оплату YooKassa.
2. После `payment.succeeded` баланс растёт на баллы пакета из `payment_transactions`, не из клиента.
3. Повторный webhook не начисляет повторно.
4. В `balance_transactions` есть `topup` с верным `amount` и `package_id`.
5. В `payment_transactions` есть `provider_payment_id` и финальный статус.
6. Неавторизованный `create-payment` → 401.
7. Подмена `amount` / `points` с клиента невозможна.
8. URL функций и `return_url` берутся из env, не из `docs/pay.md`.
9. `authenticated` не может вызвать `redeem_package`.
10. На `/profile` после возврата виден баннер и баланс в шапке обновляется без перезагрузки, если polling успел увидеть начисление.
11. В коде `create-payment` есть `buildReceipt` + `TODO(54-FZ receipt)`; чек в YooKassa не уходит.

## Проверка вручную

1. Локально или на проекте из `.env.local` задеплоить функции и проставить secrets.
2. В кабинете YooKassa (тест) указать webhook URL этого проекта.
3. Войти, открыть `/profile`, увидеть три пакета с ценами 490 / 1290 / 2790 ₽.
4. Оплатить тестовой картой YooKassa, вернуться на профиль, дождаться роста баланса.
5. Повторить тот же webhook (или повторную доставку) — баланс не удваивается.
6. Выйти — `create-payment` без токена не создаёт платёж.
7. Под service role `redeem_package` ещё вызывается; под anon/authenticated — нет.
