# Master Class (MK)

Веб-приложение: пользователь загружает фото товара, запускает генерацию и получает готовые изображения в каталоге. Референс по продукту — [aidentika.com](https://www.aidentika.com/). Исходное ТЗ — [`docs/tz.md`](docs/tz.md).

Типы генерации:

- **фото** — одно или несколько изображений;
- **карточка** — карусель кадров; для карточки сервер дополнительно определяет ключевой объект на фото (`detect-subject`).

Генерацию может запустить только авторизованный пользователь. Баллы списываются на старте (`start_generation`); при ошибке или отмене часть/все баллы возвращаются.

---

## Стек

| Слой | Технологии |
| --- | --- |
| Клиент | React 19, React Router 7, Vite 8 |
| Бэкенд API | те же модули в `server/generation/` — Vite-плагин локально, Vercel Functions в проде |
| Данные и auth | Supabase (Postgres + Auth + Storage + RPC) |
| Картинки | OpenRouter (`OPENROUTER_IMAGE_MODEL` / `OPENROUTER_DETECT_MODEL`) |
| Хостинг | Vercel (`vercel.json`) |

---

## Быстрый старт

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
# заполнить ключи, см. раздел «Переменные окружения»
npm run dev
```

Откроется Vite (обычно `http://localhost:5173`). Эндпоинты `/api/generate-card` и `/api/detect-subject` в dev/preview отдаёт плагин [`server/generation/vitePlugin.js`](server/generation/vitePlugin.js) — ключ OpenRouter на клиент не попадает.

| Команда | Что делает |
| --- | --- |
| `npm run dev` | dev-сервер + локальные API |
| `npm run build` | production-сборка |
| `npm run preview` | превью сборки (те же API-middleware) |
| `npm run lint` | Oxlint |
| `npm test` | unit-тесты генерации (Node test runner) |

Миграции лежат в [`supabase/migrations/`](supabase/migrations/). Применять через Supabase CLI / дашборд проекта.

---

## Переменные окружения

Шаблон: [`.env.example`](.env.example). Секреты не коммитить (`.env*` в `.gitignore`, кроме example).

**Клиент (`VITE_*`):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` или `VITE_SUPABASE_PUBLISHABLE_KEY`

**Сервер (локально в `.env.local`, на Vercel — без префикса `VITE_`):**

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — проверка JWT, подпись URL бакетов, запись результатов
- `OPENROUTER_API_KEY` и связанные `OPENROUTER_*` — модели, таймауты, referer

Клиент без URL/ключа Supabase работает, но auth и каталог недоступны (`src/lib/supabase.js` вернёт `null`).

---

## Карта экранов

Оболочка одна на все маршруты: сайдбар + верхняя полоса + модалка генерации ([`src/components/AppShell.jsx`](src/components/AppShell.jsx)).

| URL | Страница | Назначение |
| --- | --- | --- |
| `/` | [`CatalogPage.jsx`](src/pages/CatalogPage.jsx) | список генераций пользователя, превью из Storage |
| `/auth` | редирект на `/` + модалка | старая ссылка открывает попап входа |
| `/profile` | [`ProfilePage.jsx`](src/pages/ProfilePage.jsx) | гость — только CTA входа; в сессии — баланс, заглушки пакетов, выход |
| `/catalog`, `/add`, `*` | редирект на `/` | старые/несуществующие пути |

Кнопка **«Генерация»** открывает [`GenerateModal.jsx`](src/components/GenerateModal.jsx), а не отдельный роут. После успеха модалка увеличивает `catalogEpoch` — каталог перечитывается.

Навигация: [`Sidebar.jsx`](src/components/Sidebar.jsx) (Мои генерации, Профиль), [`Topbar.jsx`](src/components/Topbar.jsx) (чип баланса только в сессии, иначе «Войти»).

---

## Авторизация

Маршруты кабинета публичные. Доступ к данным закрывают RLS и проверка JWT на API, а не `ProtectedRoute`.

Вход и регистрация — попап [`AuthModal.jsx`](src/components/AuthModal.jsx) (email + пароль). Отдельной страницы логина нет: `/auth` открывает ту же модалку и уводит на `/`. Пока сессия ещё гидратится, `/profile` показывает «Загрузка…».

| Состояние | Topbar | `/profile` | `/` (каталог) |
| --- | --- | --- | --- |
| Гость | «Войти» | текст + «Войти», без суммы и пакетов | CTA войти, счётчики «—» |
| В сессии | чип `{N} баллов` + «Профиль» | баланс, пакеты-заглушки, «Выйти» | список генераций / пустое состояние |

Регистрация: RPC `register_account` (без confirm-письма) → сразу `signInWithPassword`. Триггер на `auth.users` создаёт `profiles` и начисляет бонус (`app_settings.signup_bonus_points`, в сиде **50**).

Сессия живёт в [`src/lib/auth.jsx`](src/lib/auth.jsx): `getSession` + `onAuthStateChange`, отдельно читается `profiles` (`id`, `email`, `points_balance`). **Выход** сразу обнуляет `session` и `profile` на клиенте, затем вызывает `supabase.auth.signOut()` — баланс и пакеты после logout на экране не остаются.

---

## Карта каталогов

```
src/
  App.jsx                 маршруты
  index.css               токены и оболочка
  pages/                  экраны (каталог, профиль)
  components/             AppShell, Sidebar, Topbar, AuthModal, GenerateModal, PageLayout
  lib/
    auth.jsx              сессия + профиль + signIn / signUp / signOut
    supabase.js           браузерный клиент
    generation/           клиентский оркестратор фичи «генерация»
    payments/             клиент YooKassa: create-payment, polling
server/generation/        общий серверный код (Vite + Vercel)
api/                      тонкие Vercel-хендлеры → server/generation
supabase/functions/       Edge Functions (create-payment, yookassa-webhook)
supabase/migrations/      схема, RLS, RPC, бакеты
docs/                     ТЗ и заметки (не код)
```

### Клиентская генерация (`src/lib/generation/`)

| Файл | Роль |
| --- | --- |
| `index.js` | публичные экспорты |
| `useRunGeneration.js` | состояние модалки: фазы, прогресс, abort |
| `runGenerationJob.js` | пайплайн: сжатие → upload → detect → classify → charge → цикл картинок |
| `compressProductImage.js` | ужимает исходник (лимит тела ~4.5 MB на Vercel) |
| `detectKeySubject.js` | клиент → `POST /api/detect-subject` (только тип `card`) |
| `classifyProduct.js` | RPC `classify_product` |
| `generateCardImage.js` | клиент → `POST /api/generate-card` |
| `useGenerateCardImage.js` | хук вокруг одного вызова картинки |
| `*.test.js` | тесты оркестратора и detect |

### Сервер (`server/generation/` + `api/`)

| Файл | Роль |
| --- | --- |
| `vitePlugin.js` | middleware `/api/*` в `vite` / `vite preview` |
| `http.js` | `POST /api/generate-card` |
| `detectHttp.js` | `POST /api/detect-subject` |
| `auth.js` | JWT пользователя |
| `persist.js` | загрузка джоба, запись ассета, fail, signed URL |
| `generateCardImage.js` / `detectKeySubject.js` | вызовы OpenRouter |
| `prompt.js` | сборка промпта и санитизация лейбла |
| `supabase.js`, `config.js`, `errors.js` | клиент service role, лимиты, ошибки |
| `api/generate-card.js`, `api/detect-subject.js` | обёртки для Vercel (`maxDuration` 60 / 20 с) |

Логика генерации **не дублируется**: и локальный Vite, и Vercel вызывают одни и те же `writeNodeResponse` / `writeDetectNodeResponse`.

---

## Поток генерации

1. Пользователь в модалке выбирает файл, тип (`photo` / `card`), категорию, пресет «как показать», пожелания, число объектов.
2. `runGenerationJob` сжимает файл и кладёт его в бакет `product-uploads` по пути `{userId}/{uuid}.ext`.
3. Создаётся строка `products`.
4. Для `card` сервер определяет ключевой объект (`/api/detect-subject`).
5. RPC `classify_product` сохраняет категорию и лейбл.
6. RPC `start_generation` считает стоимость по `generation_tariffs`, списывает баллы, создаёт `generations` со статусом `queued` → дальше клиент крутит объекты.
7. На каждый объект: `POST /api/generate-card` с JWT. Сервер проверяет джоб, вызывает OpenRouter, пишет файл в `generation-outputs` и строку в `generation_assets`.
8. Ошибка или отмена → `fail_own_generation` (рефанд). Успех виден в каталоге по signed URL (TTL 1 час).

Тарифы в сиде: **фото 40** балла/объект, **карточка 60**. Бонус при регистрации: **50** (`app_settings.signup_bonus_points`).

---

## База и Storage

Стартовая схема: [`supabase/migrations/20260904223900_init_app_schema.sql`](supabase/migrations/20260904223900_init_app_schema.sql). Последующие файлы в той же папке уточняют lifecycle генерации, рефанд и регистрацию без email confirm.

**Таблицы**

| Таблица | Зачем |
| --- | --- |
| `profiles` | баланс, email; создаётся триггером на `auth.users` |
| `categories` / `presentation_presets` | категории и 4 пресета «как показать» (у `other` пресетов нет) |
| `products` | исходное фото пользователя |
| `generations` | джоб: тип, статус, стоимость, пожелания |
| `generation_assets` | готовые картинки (порядок `sort_order`) |
| `generation_tariffs` | цена за объект |
| `credit_packages` | пакеты пополнения (`starter` / `growth` / `pro`; `s` / `m` / `l` выключены) |
| `balance_transactions` | леджер: `signup_bonus`, `topup`, `generation_spend`, `refund` |
| `app_settings` | в т.ч. бонус регистрации |

**RPC** (реализация в `private.*`; клиент вызывает не все — см. колонку «Когда»)

| RPC | Когда |
| --- | --- |
| `register_account` | регистрация без confirm-письма, затем обычный `signIn` |
| `classify_product` | категория + detected label |
| `start_generation` | списание и создание джоба |
| `fail_own_generation` | ошибка/отмена со стороны владельца |
| `redeem_package` | только service role / локалка |
| `finalize_yookassa_payment` | только service role — webhook начисляет пакет после оплаты |
| `delete_product` | удаление товара без активных генераций |
| `claim_generation_persist` / `persist_generation_asset` | сервер пишет ассеты |

**Бакеты:** `product-uploads` (исходники), `generation-outputs` (результаты). Оба приватные; клиент читает результаты через signed URL.

---

## Документы

| Файл | Содержание |
| --- | --- |
| [`docs/tz.md`](docs/tz.md) | продуктовое ТЗ (каталог, генерация, auth, профиль) |
| [`docs/pay.md`](docs/pay.md) | черновик; актуальная спека — [`docs/superpowers/specs/2026-09-06-yookassa-points-payment-design.md`](docs/superpowers/specs/2026-09-06-yookassa-points-payment-design.md) |
| [`docs/comment.md`](docs/comment.md) | короткая заметка (`npm run dev`) |
| [`docs/superpowers/specs/`](docs/superpowers/specs/2026-09-04-app-shell-sidebar-topbar-design.md) | дизайн оболочки (сайдбар / topbar) |
| [`docs/superpowers/specs/2026-09-06-yookassa-points-payment-design.md`](docs/superpowers/specs/2026-09-06-yookassa-points-payment-design.md) | спека пополнения через YooKassa |
| [`docs/superpowers/plans/`](docs/superpowers/plans/2026-09-04-app-shell-sidebar-topbar.md) | план той же задачи |
| [`docs/superpowers/plans/2026-09-06-yookassa-points-payment.md`](docs/superpowers/plans/2026-09-06-yookassa-points-payment.md) | план пополнения через YooKassa |

Оплата: URL функций берётся из `VITE_SUPABASE_URL` в `.env.local`. Секреты YooKassa и `PUBLIC_APP_URL` — в `supabase secrets`, не в клиент. Чек 54-ФЗ пока не отправляется (`buildReceipt` — заглушка).

**Перед живыми платежами (обязательно).** Автотестов на `private.finalize_yookassa_payment` нет. На живой БД подтвердить вручную: первый `succeeded` начисляет пакет один раз; повторный `succeeded` с тем же `provider_payment_id` баланс не удваивает; `canceled` не начисляет; нет строки в `payment_transactions` — ошибка, начисления нет; `succeeded`, затем `canceled` — баланс не откатывается.

---

## Что уже есть и чего нет

**Есть:** оболочка кабинета, попап входа/регистрации (email + пароль, без confirm-письма), бонус при регистрации, гостевые экраны без остатка баланса после выхода, модалка генерации, списание/рефанд баллов, каталог с превью, деплой API на Vercel, пополнение через YooKassa: `create-payment` + `yookassa-webhook`, пакеты `starter` / `growth` / `pro`.

**Пока заглушки или только в ТЗ:**
- «забыли пароль» из ТЗ не сделано;
- отдельной страницы товара / повторного скачивания всех материалов нет — каталог показывает превью генераций.
