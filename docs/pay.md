## ТЗ: оплата баллов через YooKassa + Supabase Edge Functions

Система работает так: авторизованный пользователь выбирает пакет пополнения в интерфейсе, фронтенд отправляет только `package_id` в защищенную функцию `create-payment`, функция на сервере проверяет пользователя по JWT, сама определяет сумму и количество баллов, создает платеж в YooKassa и возвращает ссылку на оплату; после оплаты YooKassa отправляет webhook в `yookassa-webhook`, где платеж проверяется и один раз фиксируется в БД, после чего пользователю начисляются баллы в `profiles.points_balance` и создаются записи в транзакциях, что исключает двойные зачисления и сохраняет полную прослеживаемость операций.

### 1) Цель

Реализовать безопасное пополнение баланса `points_balance` через YooKassa:
- функция `create-payment` создает платеж и возвращает `confirmation_url`;
- функция `yookassa-webhook` принимает уведомления YooKassa и начисляет баллы;
- начисление строго идемпотентное (без двойных зачислений).

Проект Supabase:
- `project_ref`: `ricsxgfkepwmdqbfivir`

---

### 2) Область ответственности

Фронтенд:
- показывает пакеты пополнения;
- вызывает `create-payment` от имени авторизованного пользователя;
- редиректит пользователя на `confirmation_url`.

Бэкенд (Edge Functions):
- валидирует входные данные;
- рассчитывает цену и баллы только на сервере;
- создает платеж в YooKassa;
- обрабатывает webhook и обновляет БД сервисной ролью;
- защищается от повторной обработки одного и того же платежа.

---

### 3) Функции и доступ

Создать две функции:
- `create-payment`
- `yookassa-webhook`

Команды:
- `supabase functions new create-payment`
- `supabase functions new yookassa-webhook`

Деплой:
- `supabase functions deploy create-payment`
- `supabase functions deploy yookassa-webhook --no-verify-jwt`

Требования по авторизации:
- `create-payment`: JWT обязателен (вызов только авторизованным пользователем).
- `yookassa-webhook`: публичный endpoint без JWT (из-за входящих webhook от YooKassa).

---

### 4) Secrets и конфигурация

Добавить secrets в Supabase:
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Примечание:
- Не хранить `SUPABASE_SERVICE_ROLE_KEY` в клиентском `.env.local`.
- Ключи YooKassa и service role использовать только внутри Edge Functions.

---

### 5) Модель пакетов пополнения (источник истины - сервер)

Фронтенд может показывать пакеты, но сервер обязан иметь свой статический whitelist.

Использовать пакетную модель (соответствует UI):
- `starter`: 100 баллов, 490 RUB
- `growth`: 300 баллов, 1290 RUB
- `pro`: 750 баллов, 2790 RUB

Критично:
- Клиент не передает `amount` и `points` как доверенные значения.
- Клиент передает только `package_id`.

---

### 6) Изменения в БД (обязательно)

Текущая таблица `balance_transactions` недостаточна для надежной платежной идемпотентности.

Нужно добавить таблицу `payment_transactions`:

Минимальные поля:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.profiles(id) on delete cascade`
- `provider text not null default 'yookassa'`
- `provider_payment_id text not null unique`
- `idempotence_key text not null unique`
- `package_id text not null`
- `amount_rub integer not null check (amount_rub > 0)`
- `points integer not null check (points > 0)`
- `status text not null check (status in ('pending', 'succeeded', 'canceled', 'failed'))`
- `raw_payload jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Индексы:
- индекс по `(user_id, created_at desc)`
- уникальный индекс по `provider_payment_id`
- уникальный индекс по `idempotence_key`

RLS:
- `select` только своих записей (`user_id = auth.uid()`).
- `insert/update/delete` для клиентов не открывать.

---

### 7) Контракт `create-payment`

#### Endpoint
- `POST /create-payment`

#### Auth
- Требуется `Authorization: Bearer <access_token>`.

#### Request body
```json
{
  "package_id": "starter"
}
```

#### Валидация
- `package_id` должен быть в whitelist.
- Пользователь берется из JWT, а не из body.

#### Логика
1. Проверить JWT и получить `user_id`.
2. По `package_id` получить `amount_rub` и `points` из серверной таблицы/константы.
3. Сгенерировать `idempotence_key`.
4. Создать платеж в YooKassa:
   - amount.value = сумма пакета;
   - currency = `RUB`;
   - confirmation.type = `redirect`;
   - confirmation.return_url = URL фронтенда (успешная страница);
   - metadata: `user_id`, `package_id`, `points`.
5. Сохранить запись в `payment_transactions` со статусом `pending`.
6. Вернуть `confirmation_url` и `payment_id`.

#### Response (200)
```json
{
  "payment_id": "<yookassa_payment_id>",
  "confirmation_url": "https://..."
}
```

#### Ошибки
- `400` - невалидный `package_id`.
- `401` - отсутствует/некорректный JWT.
- `500` - ошибка создания платежа.

---

### 8) Контракт `yookassa-webhook`

#### Endpoint
- `POST /yookassa-webhook`

#### Auth
- JWT не требуется.
- Проверять источник webhook по механизмам YooKassa (если используется подпись/проверка уведомления, включить обязательно).

#### Ожидаемые события
- Минимум: `payment.succeeded`.
- Рекомендуется обработать также `payment.canceled`.

#### Логика `payment.succeeded`
1. Получить `provider_payment_id` из webhook.
2. Найти запись в `payment_transactions`.
3. Если запись уже `succeeded` - вернуть 200 без повторного начисления.
4. В транзакции БД:
   - обновить `payment_transactions.status = 'succeeded'`;
   - увеличить `profiles.points_balance` на число баллов пакета;
   - добавить запись в `balance_transactions`:
     - `kind = 'topup'`
     - `amount = +<points>`
     - `note = 'YooKassa payment <provider_payment_id>'`
5. Вернуть `200`.

#### Логика `payment.canceled` / `payment.waiting_for_capture`
- Обновить статус платежа в `payment_transactions`.
- Баллы не начислять.

#### Идемпотентность
- Ключевое правило: один `provider_payment_id` -> одно начисление.
- Повторные webhook не должны менять баланс повторно.

---

### 9) URL функций

Формат:
- `https://<project_ref>.functions.supabase.co/<function_name>`

Для текущего проекта:
- `https://ricsxgfkepwmdqbfivir.functions.supabase.co/create-payment`
- `https://ricsxgfkepwmdqbfivir.functions.supabase.co/yookassa-webhook`

Webhook URL в YooKassa:
- `https://ricsxgfkepwmdqbfivir.functions.supabase.co/yookassa-webhook`

---

### 10) Пример вызова с фронтенда (React)

```js
const session = await supabase.auth.getSession()
const token = session.data.session?.access_token

const res = await fetch('https://ricsxgfkepwmdqbfivir.functions.supabase.co/create-payment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    package_id: 'starter',
  }),
})

if (!res.ok) {
  throw new Error('Failed to create payment')
}

const data = await res.json()
window.location.href = data.confirmation_url
```

---

### 11) Логирование и мониторинг

Обязательно логировать:
- вход `create-payment` (без секретов);
- ответы YooKassa с кодами ошибок;
- входящие webhook и их `provider_payment_id`;
- факт начисления баллов и финальный `points_balance`.

Не логировать:
- секреты;
- приватные ключи;
- полный токен пользователя.

---

### 12) Критерии приемки

1. Авторизованный пользователь может инициировать оплату выбранного пакета.
2. После успешной оплаты webhook начисляет корректное количество баллов.
3. Повторный webhook по тому же платежу не увеличивает баланс повторно.
4. В `balance_transactions` появляется запись `topup` с правильным `amount`.
5. В `payment_transactions` фиксируются статусы платежа и `provider_payment_id`.
6. Неавторизованный вызов `create-payment` получает `401`.
7. Передача произвольных `amount`/`points` с клиента невозможна.

---

### 13) Поток процесса (коротко)

1. Пользователь нажимает "Пополнить".
2. Фронт вызывает `create-payment` с `package_id` и JWT.
3. Функция создает платеж в YooKassa и отдает `confirmation_url`.
4. Пользователь оплачивает на стороне YooKassa.
5. YooKassa отправляет webhook в `yookassa-webhook`.
6. Функция идемпотентно начисляет баллы и пишет транзакции.

Итог: безопасная серверная логика платежей, автоматическое и корректное начисление баллов.
