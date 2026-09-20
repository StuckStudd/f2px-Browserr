/* F2PX download page: i18n (RU/EN), download links + checksums from downloads.js, screenshot tabs. */
;(function () {
  'use strict'

  var I18N = {
    ru: {
      "q10.a": "Восстановить данные нельзя — в этом смысл шифрования. На окне ввода пароля есть «Forgot password?»: он стирает все данные F2PX и начинает с чистого профиля. Пароль необязателен: без него данные всё равно зашифрованы ключом вашей учётной записи Windows.",
      "q10.q": "Что будет, если я забуду пароль на запуск?",
      "q9.a": "История, закладки, настройки, список загрузок и сохранённая сессия хранятся на диске зашифрованными (AES-256-GCM). Ключ защищён вашей учётной записью Windows (DPAPI) или, если вы задали, паролем на запуск. Адреса сайтов запрашиваются через зашифрованный DNS (DoH), а сами сайты открываются по HTTPS.",
      "q9.q": "Что именно шифруется?",
      "i3.d": "F2PX Browser появится в меню «Пуск» и на рабочем столе. Установка не требует прав администратора. При первом запуске мастер предложит профиль (и пароль по желанию), тему, поисковик (рекомендуем DuckDuckGo) и уровень приватности.",
      "pv.not5": "Зашифрованы данные самого F2PX. Кэш и localStorage сайтов хранит Chromium (cookies он защищает средствами Windows). Пароль на запуск нельзя восстановить: если вы его забыли, остаётся только стереть данные.",
      "pv5.d": "История, закладки, настройки и сессия хранятся зашифрованными (AES-256). Ключ защищён Windows или вашим паролем на запуск. Нет аккаунта, облака и синхронизации. Поиск по умолчанию — DuckDuckGo.",
      "pv5.t": "Данные зашифрованы на диске",
      "pv3.d": "Сайты открываются по защищённому соединению, а их адреса запрашиваются через зашифрованный DNS (DoH). Если у сайта нет HTTPS, вы увидите предупреждение, а не молчаливый обычный HTTP.",
      "pv3.t": "HTTPS и зашифрованный DNS",
      "pv2.d": "Встроенный список известных рекламных и аналитических трекеров (режимы «Стандарт» и «Строгий») и очистка ссылок от utm, fbclid и gclid. Счётчик заблокированного — прямо в адресной строке.",
      "alt.setup": "Мастер первого запуска F2PX: выбор поисковой системы",
      "s.setup": "Мастер",
      "q8.a": "Запустите его за любым логирующим прокси или в Wireshark: в простое трафика нет. В исходниках проекта есть автоматический тест tests/e2e/06-no-background-traffic.mjs, который делает ровно это.",
      "q8.q": "Как проверить, что браузер ничего не отправляет сам?",
      "q7.a": "Нет. F2PX защищает от слежки: блокирует трекеры, не шлёт данные разработчикам и не хранит ничего в облаке. Но он не скрывает ваш IP-адрес и не маскирует отпечаток браузера. Если вам нужна настоящая анонимность, используйте Tor Browser.",
      "q7.q": "F2PX — это анонимный браузер вроде Tor?",
      "q2.a": "Google блокирует вход во встроенных браузерах, поэтому в F2PX есть режим «Chrome compatibility» (Настройки → Privacy, включён по умолчанию). Он помогает, но это мера совместимости без гарантий — Google может изменить проверки. Для самой нейтральной идентичности режим можно выключить.",
      "pv.not4": "Режим «Chrome compatibility» (нужен для входа в Google) сообщает сайтам, что вы используете Chrome; его можно выключить в Settings → Privacy.",
      "pv.not3": "Список трекеров компактный и консервативный: он убирает самое частое, но не заменяет полноценный блокировщик вроде uBlock Origin.",
      "pv.not2": "Отпечаток браузера (fingerprint) у Chromium индивидуален, F2PX его не унифицирует. Для этого нужен Tor Browser.",
      "pv.not1": "F2PX — не Tor и не VPN. Он не скрывает ваш IP-адрес и не делает вас анонимным: сайты и провайдер по-прежнему видят, откуда вы.",
      "pv.not.t": "Чего F2PX не делает",
      "pv7.t": "Защита от фишинга и вредоносных сайтов",
      "pv7.d": "Встроенный офлайн-список около 387 тысяч опасных сайтов (URLhaus и Phishing.Database). Переход останавливается до загрузки страницы. Плюс предупреждения о «похожих» адресах вроде paypa1.com. Список можно обновлять раз в сутки — по желанию.",
      "pv8.t": "Безопасные загрузки",
      "pv8.d": "Каждый файл получает метку «скачано из интернета», поэтому Windows SmartScreen и Defender проверяют его. Программы вида invoice.pdf.exe помечаются как замаскированные, а запуск исполняемых файлов требует подтверждения.",
      "pv9.t": "Уведомления об обновлениях",
      "pv9.d": "По желанию браузер раз в сутки спрашивает, вышла ли новая версия, и показывает ссылку на страницу загрузки. Он ничего не скачивает и не запускает сам, поэтому взломанный сервер не сможет выполнить код на вашем компьютере.",
      "pv.not6": "Менеджера паролей в F2PX нет намеренно: хранилище паролей в браузере — главная цель для вредоносных программ. Используйте отдельный менеджер (Bitwarden, KeePassXC).",
      "pv.not7": "Список опасных сайтов — снимок на дату сборки, пока вы не включите обновление, а предупреждения о похожих адресах иногда срабатывают зря. Сам Chromium обновляется только новой версией F2PX. Защита снижает риск, но не заменяет осторожность и антивирус.",
      "pv.stat.d": "Браузер запускался за логирующим прокси, открывал свои страницы и простаивал: прокси не увидел ни одного запроса. Ваши переходы на сайты, конечно, идут в сеть.",
      "pv.stat": "сетевых запросов за 30 секунд запуска и простоя",
      "pv6.d": "Приватные окна ничего не сохраняют. Дополнительно можно очищать cookies и историю при каждом закрытии браузера.",
      "pv6.t": "Стирается по вашему желанию",
      "pv4.d": "WebRTC не раскрывает адрес в локальной сети, проверка орфографии выключена (иначе словари качаются с серверов Google), подсказки поиска выключены, Do Not Track и GPC включены.",
      "pv4.t": "Без утечек",
      "pv2.t": "Блокировка трекеров",
      "pv1.d": "В простое браузер ничего не отправляет в сеть: ни телеметрии, ни синхронизации. Обновление списка защиты и проверка новой версии — по вашему выбору и выключены, пока вы их не включите. Мы проверяем это автоматическим тестом с логирующим прокси.",
      "pv1.t": "Ноль запросов без вас",
      "pv.lead": "Конфиденциальность в F2PX — не отдельная настройка, а поведение по умолчанию. Вот что это значит на практике.",
      "alt.privacy": "Настройки приватности F2PX",
      "s.privacy": "Приватность",
      "hero.lead": "Быстрый браузер на движке Chromium, в котором конфиденциальность включена по умолчанию: блокировка трекеров, только HTTPS и никакой телеметрии.",
      'nav.features': 'Возможности', 'nav.screens': 'Скриншоты', 'nav.install': 'Установка', 'nav.privacy': 'Приватность', 'nav.faq': 'FAQ', 'nav.download': 'Скачать',
            'dl.setup': 'Скачать для Windows', 'dl.portable': 'Portable-версия, без установки', 'dl.notwin': 'F2PX пока доступен только для Windows 10/11.',
      'dl.warn': 'Установщик пока не подписан цифровым сертификатом, поэтому Windows может показать предупреждение SmartScreen. <a href="#install">Как продолжить</a>.',
      'f1.t': 'Движок Chromium', 'f1.d': 'Современные сайты, видео и веб-приложения работают так же, как в привычных браузерах.',
      'f2.t': 'Менеджер загрузок', 'f2.d': 'Прогресс, скорость, пауза, повтор и запуск файла. По умолчанию в Downloads\\F2PX.',
      'f3.t': 'Вкладки без лишнего', 'f3.d': 'Закрепление, перетаскивание, возврат закрытых вкладок и восстановление прошлой сессии.',
      'f4.t': 'Приватные окна', 'f4.d': 'История, cookies и кэш стираются, когда закрывается последнее приватное окно.',
      'f5.t': 'Стартовая страница', 'f5.d': 'Быстрый доступ к любимым сайтам: добавляйте, переставляйте, меняйте названия и иконки.',
      'f6.t': 'Закладки и история', 'f6.d': 'Папки, поиск, перетаскивание. Импорт и экспорт закладок из Chrome, Edge и Firefox.',
      'f7.t': 'Горячие клавиши', 'f7.d': 'Ctrl+T, Ctrl+L, Ctrl+D, Ctrl+J, Ctrl+Shift+T — всё, к чему вы привыкли.',
      'f8.t': 'Только локально', 'f8.d': 'Без аккаунта, синхронизации и телеметрии. История и настройки лежат на вашем диске.',
      's.home': 'Старт', 's.downloads': 'Загрузки', 's.bookmarks': 'Закладки', 's.settings': 'Настройки',
      'i1.t': 'Скачайте установщик', 'i1.d': 'Кнопка «Скачать для Windows» вверху страницы. Файл F2PX-Browser-Setup.exe.',
      'i2.t': 'Запустите его', 'i2.d': 'Если Windows покажет «Система Windows защитила ваш компьютер», нажмите <b>Подробнее</b>, затем <b>Выполнить в любом случае</b>. Это нормально для приложений без платной подписи.',
      'i3.t': 'Готово',
      'req.t': 'Требования', 'req.disk': 'Диск', 'req.ram': 'от 4 GB', 'req.eng': 'Движок',
      'ver.t': 'Проверка файла (SHA-256)', 'ver.d': 'Сравните хеш скачанного файла с указанным ниже. Если они различаются, не запускайте файл.', 'ver.copy': 'Копировать', 'ver.copied': 'Скопировано', 'ver.cmd': 'В PowerShell:',
      'p1': 'Всё хранится на вашем компьютере: история, закладки, настройки, загрузки и сессия.',
      'p2': 'У F2PX нет собственного сервера, аккаунтов и телеметрии — он ничего не отправляет разработчикам.',
      'p3': 'Сеть используется только для открываемых вами сайтов и, если включено, для поисковых подсказок выбранной поисковой системы.',
      'p4': 'Опционально: сигналы Do Not Track и Global Privacy Control, очистка cookies и кэша в один клик.',
      'q1.q': 'Почему Windows показывает предупреждение при запуске?', 'q1.a': 'Установщик пока не подписан платным сертификатом разработчика, поэтому SmartScreen не знает его издателя. Скачивайте файл только с этого сайта и сверяйте SHA-256 из раздела «Установка».',
      'q2.q': 'Работает ли вход в Gmail / аккаунт Google?',
      'q3.q': 'Будут ли работать Netflix, Spotify и другой защищённый контент?', 'q3.a': 'Нет: защита контента Widevine (DRM) в F2PX недоступна. Обычные сайты, видео и музыка без DRM работают.',
      'q4.q': 'Поддерживаются ли расширения Chrome?', 'q4.a': 'Пока нет.',
      'q5.q': 'Где хранятся мои данные и как всё удалить?', 'q5.a': 'В папке %APPDATA%\\F2PX Browser. Удалите программу через «Параметры → Приложения» — данные при этом остаются; чтобы стереть их полностью, удалите эту папку.',
      'q6.q': 'Есть ли версии для macOS и Linux?', 'q6.a': 'Пока только Windows 10/11 (x64).',
      'foot.note': 'Chromium · Electron · Windows 10/11',
      'alt.home': 'Стартовая страница F2PX', 'alt.downloads': 'Страница загрузок F2PX', 'alt.bookmarks': 'Менеджер закладок F2PX', 'alt.settings': 'Настройки F2PX'
    },
    en: {
      "q10.a": "The data cannot be recovered — that is the point of encryption. The password window has “Forgot password?”, which erases all F2PX data and starts with a clean profile. The password is optional: without it your data is still encrypted with a key tied to your Windows account.",
      "q10.q": "What if I forget the startup password?",
      "q9.a": "History, bookmarks, settings, the download list and the saved session are stored encrypted on disk (AES-256-GCM). The key is protected by your Windows account (DPAPI) or, if you set one, by a startup password. Site addresses are looked up through encrypted DNS (DoH) and sites open over HTTPS.",
      "q9.q": "What exactly is encrypted?",
      "i3.d": "F2PX Browser appears in the Start menu and on the desktop. No administrator rights are required. On first launch a wizard offers a profile (and an optional password), a theme, a search engine (we recommend DuckDuckGo) and a privacy level.",
      "pv.not5": "F2PX’s own data is encrypted. Websites’ cache and localStorage are kept by Chromium (which protects cookies with Windows). A startup password cannot be recovered: if you forget it, the only way in is to erase the data.",
      "pv5.d": "History, bookmarks, settings and session are stored encrypted (AES-256). The key is protected by Windows or by your startup password. No account, no cloud, no sync. The default search engine is DuckDuckGo.",
      "pv5.t": "Data encrypted on disk",
      "pv3.d": "Sites open over an encrypted connection and their addresses are looked up through encrypted DNS (DoH). If a site has no HTTPS you see a warning instead of a silent plain-HTTP page.",
      "pv3.t": "HTTPS and encrypted DNS",
      "pv2.d": "A built-in list of well-known advertising and analytics trackers (Standard and Strict modes) plus cleaning of utm, fbclid and gclid parameters from links. A blocked counter sits right in the address bar.",
      "alt.setup": "F2PX first-run wizard: choosing a search engine",
      "s.setup": "Setup",
      "q8.a": "Run it behind any logging proxy or in Wireshark: there is no traffic while idle. The project source includes an automated test, tests/e2e/06-no-background-traffic.mjs, that does exactly this.",
      "q8.q": "How can I check that the browser sends nothing on its own?",
      "q7.a": "No. F2PX protects you from tracking: it blocks trackers, sends nothing to its developers and stores nothing in the cloud. But it does not hide your IP address or mask your browser fingerprint. If you need real anonymity, use Tor Browser.",
      "q7.q": "Is F2PX an anonymous browser like Tor?",
      "q2.a": "Google blocks sign-in in embedded browsers, so F2PX has a “Chrome compatibility” mode (Settings → Privacy, on by default). It helps, but it is a compatibility measure without guarantees — Google may change its checks. Turn it off for the most neutral identity.",
      "pv.not4": "“Chrome compatibility” (needed for Google sign-in) tells websites you are using Chrome; you can turn it off in Settings → Privacy.",
      "pv.not3": "The tracker list is compact and conservative: it removes the most common trackers but is not a replacement for a full blocker such as uBlock Origin.",
      "pv.not2": "The browser fingerprint of Chromium is distinctive, and F2PX does not make it uniform. For that you need Tor Browser.",
      "pv.not1": "F2PX is not Tor and not a VPN. It does not hide your IP address or make you anonymous: websites and your ISP still see where you connect from.",
      "pv.not.t": "What F2PX does not do",
      "pv7.t": "Phishing and malware protection",
      "pv7.d": "A built-in offline list of about 387,000 dangerous sites (URLhaus and Phishing.Database). Navigation is stopped before the page loads. It also warns about look-alike addresses such as paypa1.com. The list can be refreshed once a day — if you want.",
      "pv8.t": "Safer downloads",
      "pv8.d": "Every file is tagged as “downloaded from the Internet”, so Windows SmartScreen and Defender check it. Programs like invoice.pdf.exe are flagged as disguised, and running an executable always asks first.",
      "pv9.t": "Update notifications",
      "pv9.d": "If you enable it, the browser asks once a day whether a new version exists and shows a link to the download page. It never downloads or runs anything by itself, so a hacked server cannot execute code on your computer.",
      "pv.not6": "F2PX has no password manager on purpose: a password vault inside a browser is the top target for malware. Use a dedicated manager (Bitwarden, KeePassXC).",
      "pv.not7": "The dangerous-site list is a snapshot from the build date until you enable updates, and look-alike warnings sometimes fire needlessly. Chromium itself is updated only by a new F2PX release. Protection lowers the risk; it does not replace care or an antivirus.",
      "pv.stat.d": "The browser ran behind a logging proxy, opened its own pages and sat idle: the proxy saw no requests at all. Pages you choose to visit do use the network, of course.",
      "pv.stat": "network requests in 30 seconds of startup and idle",
      "pv6.d": "Private windows save nothing. You can also clear cookies and history every time the browser closes.",
      "pv6.t": "Erased when you want",
      "pv4.d": "WebRTC does not reveal your local network address, spell check is off (its dictionaries are downloaded from Google servers), search suggestions are off, Do Not Track and GPC are on.",
      "pv4.t": "No leaks",
      "pv2.t": "Tracker blocking",
      "pv1.d": "When idle, the browser sends nothing to the network: no telemetry, no sync. Refreshing the protection list and checking for a new version are your choice and stay off until you turn them on. We verify this with an automated test behind a logging proxy.",
      "pv1.t": "Zero requests on its own",
      "pv.lead": "In F2PX privacy is not a setting you have to find — it is the default behaviour. Here is what that means in practice.",
      "alt.privacy": "F2PX privacy settings",
      "s.privacy": "Privacy",
      "hero.lead": "A fast Chromium-based browser where privacy is on by default: tracker blocking, HTTPS-only and zero telemetry.",
      'nav.features': 'Features', 'nav.screens': 'Screenshots', 'nav.install': 'Install', 'nav.privacy': 'Privacy', 'nav.faq': 'FAQ', 'nav.download': 'Download',
            'dl.setup': 'Download for Windows', 'dl.portable': 'Portable version, no installation', 'dl.notwin': 'F2PX is currently available for Windows 10/11 only.',
      'dl.warn': 'The installer is not signed with a code-signing certificate yet, so Windows may show a SmartScreen warning. <a href="#install">How to continue</a>.',
      'f1.t': 'Chromium engine', 'f1.d': 'Modern sites, video and web apps work just like in the browsers you know.',
      'f2.t': 'Download manager', 'f2.d': 'Progress, speed, pause, retry and open file. Saved to Downloads\\F2PX by default.',
      'f3.t': 'Tabs, without the noise', 'f3.d': 'Pin, drag, restore closed tabs and your previous session.',
      'f4.t': 'Private windows', 'f4.d': 'History, cookies and cache are wiped when the last private window closes.',
      'f5.t': 'Start page', 'f5.d': 'Quick access to favourite sites: add, reorder, rename and change icons.',
      'f6.t': 'Bookmarks & history', 'f6.d': 'Folders, search, drag & drop. Import and export bookmarks from Chrome, Edge and Firefox.',
      'f7.t': 'Keyboard shortcuts', 'f7.d': 'Ctrl+T, Ctrl+L, Ctrl+D, Ctrl+J, Ctrl+Shift+T — everything you are used to.',
      'f8.t': 'Local only', 'f8.d': 'No account, no sync, no telemetry. History and settings live on your disk.',
      's.home': 'Start', 's.downloads': 'Downloads', 's.bookmarks': 'Bookmarks', 's.settings': 'Settings',
      'i1.t': 'Download the installer', 'i1.d': 'Use the “Download for Windows” button at the top. The file is F2PX-Browser-Setup.exe.',
      'i2.t': 'Run it', 'i2.d': 'If Windows shows “Windows protected your PC”, click <b>More info</b>, then <b>Run anyway</b>. This is normal for apps without a paid signature.',
      'i3.t': 'Done',
      'req.t': 'Requirements', 'req.disk': 'Disk', 'req.ram': '4 GB or more', 'req.eng': 'Engine',
      'ver.t': 'Verify the file (SHA-256)', 'ver.d': 'Compare the hash of the downloaded file with the one below. If they differ, do not run the file.', 'ver.copy': 'Copy', 'ver.copied': 'Copied', 'ver.cmd': 'In PowerShell:',
      'p1': 'Everything is stored on your computer: history, bookmarks, settings, downloads and session.',
      'p2': 'F2PX has no server of its own, no accounts and no telemetry — it sends nothing to the developers.',
      'p3': 'The network is used only for the sites you open and, if enabled, for search suggestions from your chosen search engine.',
      'p4': 'Optional: Do Not Track and Global Privacy Control signals, one-click cookie and cache clearing.',
      'q1.q': 'Why does Windows show a warning when I run it?', 'q1.a': 'The installer is not signed with a paid developer certificate yet, so SmartScreen does not know its publisher. Download the file only from this site and compare the SHA-256 from the Install section.',
      'q2.q': 'Does signing in to Gmail / a Google account work?',
      'q3.q': 'Will Netflix, Spotify and other protected content work?', 'q3.a': 'No: Widevine content protection (DRM) is not available in F2PX. Regular sites, video and music without DRM work.',
      'q4.q': 'Are Chrome extensions supported?', 'q4.a': 'Not yet.',
      'q5.q': 'Where is my data stored and how do I remove it?', 'q5.a': 'In %APPDATA%\\F2PX Browser. Uninstalling via Settings → Apps keeps the data; delete that folder to remove it completely.',
      'q6.q': 'Are there macOS and Linux versions?', 'q6.a': 'Windows 10/11 (x64) only for now.',
      'foot.note': 'Chromium · Electron · Windows 10/11',
      'alt.home': 'F2PX start page', 'alt.downloads': 'F2PX downloads page', 'alt.bookmarks': 'F2PX bookmark manager', 'alt.settings': 'F2PX settings'
    }
  }

  var SHOTS = {
    home: { title: 'New tab', addr: '' },
    downloads: { title: 'Downloads', addr: 'f2px://downloads' },
    bookmarks: { title: 'Bookmarks', addr: 'f2px://bookmarks' },
    setup: { title: 'Welcome to F2PX', addr: 'f2px://welcome' },
    privacy: { title: 'Settings', addr: 'f2px://settings' },
    settings: { title: 'Settings', addr: 'f2px://settings' }
  }

  var data = window.F2PX_DOWNLOADS || null
  var lang = 'ru'
  var currentShot = 'home'

  function $(sel) { return document.querySelector(sel) }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)) }
  function mb(bytes) { return (bytes / 1048576).toFixed(1).replace('.', lang === 'ru' ? ',' : '.') + ' MB' }
  function store(key, value) { try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value) } catch (e) { return null } }

  function applyLang(next) {
    lang = next
    var dict = I18N[lang]
    document.documentElement.lang = lang
    all('[data-i18n]').forEach(function (el) { var t = dict[el.getAttribute('data-i18n')]; if (t != null) el.textContent = t })
    all('[data-i18n-html]').forEach(function (el) { var t = dict[el.getAttribute('data-i18n-html')]; if (t != null) el.innerHTML = t })
    all('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)) })
    document.title = lang === 'ru' ? 'F2PX Browser — скачать для Windows' : 'F2PX Browser — download for Windows'
    $('#shot').alt = dict['alt.' + currentShot]
    renderDownloads()
    store('f2px-lang', lang)
  }

  function renderDownloads() {
    if (!data || !data.files) return
    var setup = data.files.setup
    var portable = data.files.portable
    if (setup) {
      $('#dl-setup').href = setup.url
      $('#dl-meta').textContent = 'v' + data.version + ' · Windows 10/11 · x64 · ' + mb(setup.size)
      $('#hash-setup').textContent = setup.sha256
    }
    if (portable) {
      $('#dl-portable').href = portable.url
      $('#dl-portable-size').textContent = mb(portable.size)
      $('#hash-portable').textContent = portable.sha256
    }
    $('#foot-version').textContent = 'v' + data.version
  }

  function showShot(name) {
    currentShot = name
    var img = $('#shot')
    img.src = 'assets/shots/' + name + '.png'
    img.alt = I18N[lang]['alt.' + name]
    $('#frame-title').textContent = SHOTS[name].title
    $('#frame-addr').textContent = SHOTS[name].addr || 'Search or enter address'
    all('[data-shot]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-shot') === name)) })
  }

  // language
  all('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')) }) })
  var saved = store('f2px-lang')
  var browserRu = /^(ru|uk|be|kk)/i.test(navigator.language || '')
  applyLang(saved === 'en' || saved === 'ru' ? saved : browserRu ? 'ru' : 'en')

  // screenshots
  all('[data-shot]').forEach(function (b) { b.addEventListener('click', function () { showShot(b.getAttribute('data-shot')) }) })

  // copy hashes
  all('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = ($('#' + btn.getAttribute('data-copy')).textContent || '').trim()
      if (!text || text === '—') return
      var done = function () {
        var old = btn.textContent
        btn.textContent = I18N[lang]['ver.copied']
        setTimeout(function () { btn.textContent = old }, 1400)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {})
      else {
        var ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        try { document.execCommand('copy'); done() } catch (e) { /* ignore */ }
        document.body.removeChild(ta)
      }
    })
  })

  // non-Windows visitors get a heads-up (the download stays available)
  if (!/Windows/i.test(navigator.userAgent)) $('#notwin').hidden = false
})()
