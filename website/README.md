# Сайт F2PX Browser

Статический сайт (HTML + CSS + JS, без сборки и зависимостей) со страницей скачивания. Языки: RU / EN.

```
website/
  index.html        страница
  assets/           style.css, app.js, шрифты (локальные, без CDN), иконка, скриншоты
  downloads.js      ссылки, размеры и SHA-256 — генерируется командой site:prepare
  SHA256SUMS.txt    контрольные суммы — генерируется
  downloads/        копии установщиков (только для self-hosted, в git не попадают)
```

## Локальный просмотр

```bash
npm run dist            # собрать установщики в release/
npm run site:prepare    # посчитать SHA-256 и скопировать .exe в website/downloads/
npm run site:serve      # http://localhost:8080
```

## Публикация

Кнопка «Скачать» ведёт прямо на файл на **этом же сайте**: `downloads/F2PX-Browser-Setup.exe` (и `downloads/F2PX-Browser.exe`
для portable-версии). Поэтому сайт нужно выкладывать вместе с папкой `downloads/`.

```bash
npm run dist            # собрать установщики в release/
npm run site:prepare    # скопировать .exe в website/downloads/ и посчитать SHA-256 (downloads.js, SHA256SUMS.txt)
```

Затем загрузите **всю папку `website/`** на свой сервер / VPS (nginx, Caddy, Apache) или на хостинг без жёсткого лимита на размер файла.
Установщик весит ~102 МБ, поэтому:

- **GitHub** не подойдёт для самих `.exe`: файлы больше 100 МБ он не принимает, а GitHub Pages не отдаёт файлы такого размера.
  Поэтому `website/downloads/*.exe` намеренно в `.gitignore`: в репозитории лежит сайт, а файлы вы копируете на хостинг отдельно.
- У Cloudflare Pages лимит 25 МБ на файл — тоже не подходит. Подойдёт свой сервер, S3-совместимое хранилище с публичным доступом
  или любой хостинг с большими файлами.
- Если `.exe` лежат на другом адресе, подготовьте сайт со ссылками на него (файлы при этом не копируются):
  `npm run site:prepare -- --base-url https://example.com/files/`.

Проверка перед выкладкой: `npm run site:prepare && npm run test:site` открывает сайт в самом F2PX, скачивает установщик через кнопку
и сверяет его SHA-256 с тем, что показано на странице.

## Выпуск новой версии

1. Поднимите `version` в `package.json` и запишите изменения в `CHANGELOG.md`.
2. `npm run dist` → `npm run site:prepare`.
3. Загрузите `website/` (с `downloads/`) на сервер. Версия, размер и хеши на странице обновятся сами из `downloads.js`.

## Скриншоты

`npm run build && npm run site:shots` пересоздаёт `assets/shots/*.png` из настоящего приложения
(пути в кадре заменяются на нейтральный `C:\Users\user\…`).

## Что стоит сделать перед публичным релизом

- Подписать установщик сертификатом Code Signing — иначе SmartScreen будет предупреждать (на странице это объяснено в разделе «Установка»).
- Подключить свой домен и HTTPS.
- Не публиковать приватные данные: в `website/` их нет (проверьте, если добавляете свои материалы).

## Update notifications (optional)

`npm run site:prepare -- --site-url https://your-site.example/` also writes `website/latest.json`:

```json
{ "version": "1.0.1", "url": "https://your-site.example/", "notes": "" }
```

Publish it next to the site, put its address into `package.json` (`"f2px": { "updateFeed": "https://your-site.example/latest.json" }`)
and rebuild. Browsers where the user enabled *Settings → About → Check for updates* then show "Update / v1.0.1 available" on the start page.
The browser never downloads or runs an update by itself — it only opens the (https) download page.

Bump `version` in `package.json` for every release, run `npm run dist`, `npm run site:prepare`, and upload `website/`.
