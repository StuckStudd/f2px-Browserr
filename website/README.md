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

Сайт — обычная папка `website/`, её можно выложить на любой статический хостинг.
Установщик весит ~98 МБ, поэтому **лучше хранить `.exe` отдельно от сайта** (у многих хостингов есть лимит на размер файла:
Cloudflare Pages — 25 МБ, GitHub Pages — жёсткий предел 100 МБ на файл).

### Вариант A (рекомендуется): сайт на хостинге, файлы в GitHub Releases

1. Создайте Release `v1.0.0` в репозитории и приложите к нему `release/F2PX-Browser-Setup.exe` и `release/F2PX-Browser.exe`.
2. Подготовьте сайт со ссылками на Release (файлы при этом не копируются):

   ```bash
   npm run site:prepare -- --base-url https://github.com/USER/REPO/releases/download/v1.0.0/
   ```

3. Загрузите содержимое `website/` (без `downloads/`) на GitHub Pages / Netlify / Cloudflare Pages / любой хостинг.

### Вариант B: всё на одном сервере

`npm run site:prepare` (без `--base-url`) копирует `.exe` в `website/downloads/`. Загрузите всю папку `website/` на свой сервер/VPS
(nginx, Caddy, Apache). Убедитесь, что сервер отдаёт `.exe` без ограничений по размеру.

## Выпуск новой версии

1. Поднимите `version` в `package.json`.
2. `npm run dist` → `npm run site:prepare` (с `--base-url` для нового тега, если используете Releases).
3. Опубликуйте `website/`. Версия, размер и хеши на странице обновятся сами из `downloads.js`.

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
