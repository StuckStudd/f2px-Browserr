/* F2PX site: i18n (RU/EN), download links + checksums from downloads.js, screenshot gallery. Generated text, hand-written logic. */
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
      "pv2.d": "Фильтр-списки EasyList, EasyPrivacy, uBlock Origin и RU AdList (около 175 тысяч правил) работают офлайн и скрывают пустые рекламные блоки. Счётчик — в адресной строке, а щит сайта отключает защиту для одного сайта, если он из-за неё не работает.",
      "alt.setup": "Мастер первого запуска F2PX: выбор поисковой системы",
      "q8.a": "Запустите его за любым логирующим прокси или в Wireshark: в простое трафика нет. В исходниках проекта есть автоматический тест tests/e2e/06-no-background-traffic.mjs, который делает ровно это.",
      "q8.q": "Как проверить, что браузер ничего не отправляет сам?",
      "q7.a": "Не совсем. Ваш IP-адрес скрывается только в режиме Tor (уровень Anonymous или Tor-окно): для этого нужен Tor Browser или tor.exe — F2PX его не содержит. Защита от фингерпринтинга делает вас трудноотслеживаемым между сайтами, но браузер не станет неотличимым от других пользователей Tor. Для максимальной анонимности используйте Tor Browser.",
      "q7.q": "F2PX — это анонимный браузер вроде Tor Browser?",
      "q2.a": "Google блокирует вход во встроенных браузерах, поэтому в F2PX есть режим «Chrome compatibility» (Настройки → Privacy, включён по умолчанию). Он помогает, но это мера совместимости без гарантий — Google может изменить проверки. Для самой нейтральной идентичности режим можно выключить.",
      "pv.not4": "Режим «Chrome compatibility» (нужен для входа в Google) сообщает сайтам, что вы используете Chrome; его можно выключить в Settings → Privacy.",
      "pv.not3": "Фильтр-движок понимает основные правила EasyList и uBlock, но не скриптлеты и не переписывание ответов: например, пропуск рекламы на YouTube ему недоступен.",
      "pv.not2": "Защита от фингерпринтинга делает вас трудноотслеживаемым между сайтами, но не одним из тысяч одинаковых: шрифты, точная геометрия окна и поведение GPU всё равно немного отличаются.",
      "pv.not1": "F2PX — не Tor Browser. Ваш IP-адрес скрывается только в режиме Tor (нужен Tor Browser или tor.exe — F2PX его не содержит) или через ваш прокси / VPN. Без этого сайты и провайдер видят, откуда вы.",
      "pv.not.t": "Чего F2PX не делает",
      "pv7.t": "Защита от фишинга и вредоносных сайтов",
      "pv7.d": "Встроенный офлайн-список около 387 тысяч опасных сайтов (URLhaus и Phishing.Database). Переход останавливается до загрузки страницы. Плюс предупреждения о «похожих» адресах вроде paypa1.com. Список можно обновлять раз в сутки — по желанию.",
      "pv8.t": "Безопасные загрузки",
      "pv8.d": "Каждый файл получает метку «скачано из интернета», поэтому Windows SmartScreen и Defender проверяют его. Программы вида invoice.pdf.exe помечаются как замаскированные, а запуск исполняемых файлов требует подтверждения.",
      "pv9.t": "Уведомления об обновлениях",
      "pv9.d": "По желанию браузер раз в сутки спрашивает, вышла ли новая версия, и показывает ссылку на страницу загрузки. Он ничего не скачивает и не запускает сам, поэтому взломанный сервер не сможет выполнить код на вашем компьютере.",
      "pv10.t": "Защита от фингерпринтинга",
      "pv10.d": "Canvas-, audio- и WebGL-отпечатки различаются для каждого сайта и каждой сессии, поэтому трекеры не могут связать вас между сайтами. Работает и в чужих iframe. В режиме Strict устройство, экран, часовой пояс и язык выглядят одинаково у всех.",
      "pv11.t": "Tor и прокси",
      "pv11.d": "Tor-окно (Ctrl+Shift+Alt+N) и уровень Anonymous направляют весь трафик через Tor: имена сайтов уходят прокси неразрешёнными, без DNS-утечки. Если Tor недоступен, ничего не отправляется напрямую.",
      "pv12.t": "Fire и уровни приватности",
      "pv12.d": "Ctrl+Shift+Del мгновенно закрывает окна и стирает историю, cookies, кэш и разрешения — и выдаёт сайтам новую «личность». Уровни Standard, Strict и Anonymous настраивают всё сразу.",
      "s.privacycenter": "Центр приватности",
      "alt.privacycenter": "Центр приватности F2PX: уровни Standard, Strict и Anonymous",
      "s.shield": "Щит",
      "alt.shield": "Щит сайта: что заблокировано на странице",
      "s.fire": "Fire",
      "alt.fire": "Fire: стереть всё одним действием",
      "s.palette": "Палитра",
      "alt.palette": "Командная палитра F2PX",
      "pv.not6": "Менеджера паролей в F2PX нет намеренно: хранилище паролей в браузере — главная цель для вредоносных программ. Используйте отдельный менеджер (Bitwarden, KeePassXC).",
      "pv.not7": "Список опасных сайтов — снимок на дату сборки, пока вы не включите обновление, а предупреждения о похожих адресах иногда срабатывают зря. Сам Chromium обновляется только новой версией F2PX. Защита снижает риск, но не заменяет осторожность и антивирус.",
      "pv.stat.d": "Браузер запускался за логирующим прокси, открывал свои страницы и простаивал: прокси не увидел ни одного запроса. Ваши переходы на сайты, конечно, идут в сеть.",
      "pv.stat": "сетевых запросов за 30 секунд запуска и простоя",
      "pv6.d": "Приватные окна ничего не сохраняют. Дополнительно можно очищать cookies и историю при каждом закрытии браузера.",
      "pv6.t": "Стирается по вашему желанию",
      "pv4.d": "WebRTC не раскрывает адрес в локальной сети, проверка орфографии выключена (иначе словари качаются с серверов Google), подсказки поиска выключены, Do Not Track и GPC включены.",
      "pv4.t": "Без утечек",
      "pv2.t": "Блокировка рекламы и трекеров",
      "pv1.d": "В простое браузер ничего не отправляет в сеть: ни телеметрии, ни синхронизации. Обновление списка защиты и проверка новой версии — по вашему выбору и выключены, пока вы их не включите. Мы проверяем это автоматическим тестом с логирующим прокси.",
      "pv1.t": "Ноль запросов без вас",
      "pv.lead": "Приватность в F2PX — не настройка, которую нужно искать, а поведение по умолчанию. Вот что это значит на практике.",
      "alt.privacy": "Настройки приватности F2PX",
      "s.privacy": "Приватность",
      "hero.lead": "Быстрый браузер на движке Chromium, в котором приватность включена по умолчанию: блокировка рекламы и трекеров, защита от фингерпринтинга, режим Tor и ни одного запроса без вашего ведома.",
      "nav.features": "Возможности",
      "nav.screens": "Скриншоты",
      "nav.install": "Установка",
      "nav.privacy": "Приватность",
      "nav.faq": "FAQ",
      "nav.download": "Скачать",
      "dl.setup": "Скачать для Windows",
      "dl.portable": "Portable-версия, без установки",
      "dl.notwin": "F2PX пока доступен только для Windows 10/11.",
      "dl.warn": "Установщик пока не подписан цифровым сертификатом, поэтому Windows может показать предупреждение SmartScreen. <a href=\"#install\">Как продолжить</a>.",
      "f1.t": "Движок Chromium",
      "f1.d": "Современные сайты, видео и веб-приложения работают так же, как в привычных браузерах.",
      "f2.t": "Менеджер загрузок",
      "f2.d": "Прогресс, скорость, пауза, повтор и запуск файла. По умолчанию в Downloads\\F2PX.",
      "f3.t": "Вкладки без лишнего",
      "f3.d": "Закрепление, перетаскивание, возврат закрытых вкладок и восстановление прошлой сессии.",
      "f4.t": "Приватные окна",
      "f4.d": "История, cookies и кэш стираются, когда закрывается последнее приватное окно.",
      "f5.t": "Стартовая страница",
      "f5.d": "Быстрый доступ к любимым сайтам: добавляйте, переставляйте, меняйте названия и иконки.",
      "f6.t": "Закладки и история",
      "f6.d": "Папки, поиск, перетаскивание. Импорт и экспорт закладок из Chrome, Edge и Firefox.",
      "f7.t": "Горячие клавиши",
      "f7.d": "Ctrl+T, Ctrl+L, Ctrl+D, Ctrl+J, Ctrl+Shift+T — всё, к чему вы привыкли.",
      "f8.t": "Только локально",
      "f8.d": "Без аккаунта, синхронизации и телеметрии. История и настройки лежат на вашем диске.",
      "s.home": "Старт",
      "s.downloads": "Загрузки",
      "s.bookmarks": "Закладки",
      "s.settings": "Настройки",
      "i1.t": "Скачайте установщик",
      "i1.d": "Кнопка «Скачать для Windows» вверху страницы. Файл F2PX-Browser-Setup.exe.",
      "i2.t": "Запустите его",
      "i2.d": "Если Windows покажет «Система Windows защитила ваш компьютер», нажмите <b>Подробнее</b>, затем <b>Выполнить в любом случае</b>. Это нормально для приложений без платной подписи.",
      "i3.t": "Готово",
      "req.t": "Требования",
      "req.disk": "Диск",
      "req.ram": "от 4 GB",
      "req.eng": "Движок",
      "ver.t": "Проверка файла (SHA-256)",
      "ver.d": "Сравните хеш скачанного файла с указанным ниже. Если они различаются, не запускайте файл.",
      "ver.copy": "Копировать",
      "ver.copied": "Скопировано",
      "ver.cmd": "В PowerShell:",
      "p1": "Всё хранится на вашем компьютере: история, закладки, настройки, загрузки и сессия.",
      "p2": "У F2PX нет собственного сервера, аккаунтов и телеметрии — он ничего не отправляет разработчикам.",
      "p3": "Сеть используется только для открываемых вами сайтов и, если включено, для поисковых подсказок выбранной поисковой системы.",
      "p4": "Опционально: сигналы Do Not Track и Global Privacy Control, очистка cookies и кэша в один клик.",
      "q1.q": "Почему Windows показывает предупреждение при запуске?",
      "q1.a": "Установщик пока не подписан платным сертификатом разработчика, поэтому SmartScreen не знает его издателя. Скачивайте файл только с этого сайта и сверяйте SHA-256 из раздела «Установка».",
      "q2.q": "Работает ли вход в Gmail / аккаунт Google?",
      "q3.q": "Будут ли работать Netflix, Spotify и другой защищённый контент?",
      "q3.a": "Нет: защита контента Widevine (DRM) в F2PX недоступна. Обычные сайты, видео и музыка без DRM работают.",
      "q4.q": "Поддерживаются ли расширения Chrome?",
      "q4.a": "Нет. Зато блокировка рекламы и трекеров уже встроена.",
      "q5.q": "Где хранятся мои данные и как всё удалить?",
      "q5.a": "В папке %APPDATA%\\F2PX Browser. Удалите программу через «Параметры → Приложения» — данные при этом остаются; чтобы стереть их полностью, удалите эту папку.",
      "q6.q": "Есть ли версии для macOS и Linux?",
      "q6.a": "Пока только Windows 10/11 (x64).",
      "foot.note": "Chromium · Electron · Windows 10/11 · MIT",
      "alt.home": "Стартовая страница F2PX",
      "alt.downloads": "Страница загрузок F2PX",
      "alt.bookmarks": "Менеджер закладок F2PX",
      "alt.settings": "Настройки F2PX",
      "meta.title": "F2PX Browser — приватный браузер для Windows: блокировка рекламы, защита от слежки, режим Tor",
      "nav.levels": "Уровни",
      "nav.open": "Открытый код",
      "pill1": "175 000+ правил блокировки",
      "pill2": "0 запросов в простое",
      "pill3": "Tor · Fire · 3 уровня",
      "pill4": "Открытый код · MIT",
      "dl.all": "Все версии и исходный код на GitHub",
      "lv.lead": "Три готовых набора настроек. Выберите в мастере первого запуска или в Центре приватности (Ctrl+Shift+P); если вы что-то поменяете вручную, уровень станет «Custom».",
      "lv.feature": "Что включено",
      "lv.default": "по умолчанию",
      "lv.r1": "Реклама и трекеры блокируются (фильтр-списки + встроенный список)",
      "lv.r2": "Canvas-, audio- и WebGL-отпечатки обезврежены",
      "lv.r3": "Только HTTPS, зашифрованный DNS, очистка ссылок от меток",
      "lv.r4": "Сторонние cookies заблокированы",
      "lv.r5": "Межсайтовый Referer убран, WebRTC без прямых соединений",
      "lv.r6": "Одинаковые железо, экран, часовой пояс (UTC) и язык у всех пользователей",
      "lv.r7": "Сайты из интернета не могут обращаться к localhost и вашей сети",
      "lv.r8": "Весь трафик через Tor (без прямого соединения)",
      "lv.r9": "Cookies и история стираются при выходе",
      "sp1.t": "Щит сайта: видно, что происходит",
      "sp1.d": "Значок щита в адресной строке показывает, сколько рекламы, трекеров, попыток снять отпечаток и сторонних cookies остановлено на этой странице. Один переключатель отключает защиту для сайта, если он из-за неё не работает.",
      "sp1.b1": "Счётчики для каждой страницы",
      "sp1.b2": "Исключения для отдельных сайтов",
      "sp1.b3": "Очистка данных сайта в одно нажатие",
      "sp2.t": "Три уровня вместо сотни переключателей",
      "sp2.d": "Standard подходит всем и почти ничего не ломает. Strict блокирует сторонние cookies и делает ваше устройство неотличимым от остальных пользователей F2PX. Anonymous направляет весь трафик через Tor.",
      "sp2.b1": "Центр приватности: живые счётчики и все настройки на одной странице",
      "sp2.b2": "Фильтр-списки, cookies, Referer, WebRTC, Tor",
      "sp2.b3": "Честно сказано, чего защита не делает",
      "alt.privacy-center": "Центр приватности F2PX: уровни Standard, Strict и Anonymous",
      "sp3.t": "Tor и прокси без утечек",
      "sp3.d": "Tor-окно работает через Tor, даже если остальной браузер подключён напрямую. Имена сайтов передаются прокси без локального разрешения, WebRTC не может обойти маршрут, а если Tor недоступен — вы увидите ошибку, а не незащищённое соединение.",
      "sp3.b1": "System, Direct, свой прокси или Tor",
      "sp3.b2": "Находит запущенный Tor Browser или запускает ваш tor.exe",
      "sp3.b3": "Запросы самого браузера идут тем же маршрутом",
      "alt.privacy-connection": "Центр приватности: подключение через Tor или прокси",
      "sp4.t": "Fire: стереть всё одним действием",
      "sp4.d": "Ctrl+Shift+Del закрывает окна и стирает историю, сессию, cookies, кэш, список загрузок и разрешения — в обычных, приватных и Tor-окнах. Каждый сайт получает новую «личность», поэтому вас не свяжут с прошлым визитом.",
      "sp4.b1": "Вы выбираете, что именно стереть",
      "sp4.b2": "Работает из любого окна",
      "sp4.b3": "Новая личность для защиты от фингерпринтинга",
      "sp5.t": "Командная палитра",
      "sp5.d": "Ctrl+Shift+K: команды, открытые вкладки, закладки и история в одном поле. Переключить уровень приватности, выключить щит, открыть Tor-окно — не отрываясь от клавиатуры. Поиск по вкладкам — Ctrl+Shift+A.",
      "sp5.b1": "Нечёткий поиск по командам",
      "sp5.b2": "Вкладки, закладки и история",
      "sp5.b3": "Сохранение в PDF и снимок экрана",
      "f9.t": "Командная палитра",
      "f9.d": "Ctrl+Shift+K — команды, вкладки, закладки и история в одном поле. Ctrl+Shift+A — поиск по вкладкам.",
      "f10.t": "Поиск без слежки",
      "f10.d": "DuckDuckGo по умолчанию; Brave Search, Startpage, Qwant и Mojeek под рукой. Подсказки поиска выключены.",
      "f11.t": "PDF и снимки экрана",
      "f11.d": "Сохраните страницу как PDF или сделайте снимок — из меню или палитры.",
      "f12.t": "Встроен в Windows",
      "f12.d": "Кнопки окна с Snap Layouts, трей, автозапуск, тёмная / светлая / системная тема.",
      "s.levels": "Мастер",
      "alt.levels": "Мастер первого запуска F2PX: выбор уровня приватности",
      "s.connection": "Tor / прокси",
      "os.lead": "F2PX написан открыто. Читайте код, собирайте сами, проверяйте тесты — вся защита описана в README и покрыта автоматическими проверками.",
      "os1.t": "Исходный код",
      "os1.d": "Лицензия MIT. Electron, TypeScript, React. 152 юнит-теста и 300 сквозных проверок реального приложения.",
      "os2.t": "Что нового",
      "os2.d": "Список изменений каждой версии: что добавлено, что изменено и как это проверено.",
      "os3.t": "Нашли уязвимость?",
      "os3.d": "Сообщите приватно через GitHub Security Advisories — публичный issue не нужен.",
      "os.cta": "Открыть →",
      "os.tests": "Проверка «ноль запросов»: tests/e2e/06-no-background-traffic.mjs",
      "q11.q": "Что нужно для режима Tor?",
      "q11.a": "Запустите Tor Browser — F2PX найдёт его на 127.0.0.1:9150 — или скачайте Tor Expert Bundle и укажите tor.exe в Центре приватности: F2PX сам запустит и остановит его. Пока Tor недоступен, страницы в этом режиме не открываются: так и задумано, чтобы ничего не ушло напрямую.",
      "q12.q": "Сайт не работает или просит капчу в режиме Strict. Что делать?",
      "q12.a": "Такое бывает: сторонние cookies нужны кнопкам входа и платёжным формам, а одинаковый «отпечаток» иногда вызывает проверку на бота. Нажмите значок щита в адресной строке и отключите защиту или разрешите сторонние cookies для этого сайта.",
      "q13.q": "Блокирует ли F2PX рекламу на YouTube?",
      "q13.a": "Он блокирует рекламу и трекеры по спискам EasyList, uBlock и RU AdList, но не умеет пропускать рекламные ролики YouTube: для этого нужны скриптлеты, которых во встроенном движке нет.",
      "q14.q": "Открыт ли код? Под какой лицензией?",
      "q14.a": "Да, код открыт на GitHub под лицензией MIT. Фильтр-списки и список опасных сайтов — сторонние данные под своими лицензиями (см. THIRD_PARTY_NOTICES.md).",
      "q15.q": "Как обновляться?",
      "q15.a": "F2PX не обновляется сам. Если включить проверку, он лишь покажет ссылку на новую версию — установщик вы скачаете здесь и сверите его SHA-256. Так взломанный сервер обновлений не сможет выполнить код на вашем компьютере.",
      "foot.src": "Исходный код",
      "foot.rel": "Релизы",
      "foot.log": "Изменения",
      "foot.sec": "Безопасность",
      "skip": "К содержимому"
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
      "pv2.d": "EasyList, EasyPrivacy, uBlock Origin and RU AdList (about 175,000 rules) work offline and hide empty ad slots. The counter sits in the address bar, and the site shield turns protection off for a single site that does not work with it.",
      "alt.setup": "F2PX first-run wizard: choosing a search engine",
      "q8.a": "Run it behind any logging proxy or in Wireshark: there is no traffic while idle. The project source includes an automated test, tests/e2e/06-no-background-traffic.mjs, that does exactly this.",
      "q8.q": "How can I check that the browser sends nothing on its own?",
      "q7.a": "Not quite. Your IP address is hidden only in Tor mode (the Anonymous level or a Tor window): you need Tor Browser or tor.exe — F2PX does not include it. Fingerprint protection makes you hard to follow between sites, but the browser does not become indistinguishable from other Tor users. For maximum anonymity use Tor Browser.",
      "q7.q": "Is F2PX an anonymous browser like Tor Browser?",
      "q2.a": "Google blocks sign-in in embedded browsers, so F2PX has a “Chrome compatibility” mode (Settings → Privacy, on by default). It helps, but it is a compatibility measure without guarantees — Google may change its checks. Turn it off for the most neutral identity.",
      "pv.not4": "“Chrome compatibility” (needed for Google sign-in) tells websites you are using Chrome; you can turn it off in Settings → Privacy.",
      "pv.not3": "The filter engine understands the main EasyList and uBlock rules, but not scriptlets or response rewriting: for example, it cannot skip ads on YouTube.",
      "pv.not2": "Fingerprint protection makes you hard to follow between sites, but not one of thousands of identical users: fonts, exact window geometry and GPU behaviour still differ slightly.",
      "pv.not1": "F2PX is not Tor Browser. Your IP address is hidden only in Tor mode (you need Tor Browser or tor.exe — F2PX does not include it) or through your own proxy / VPN. Otherwise websites and your ISP see where you connect from.",
      "pv.not.t": "What F2PX does not do",
      "pv7.t": "Phishing and malware protection",
      "pv7.d": "A built-in offline list of about 387,000 dangerous sites (URLhaus and Phishing.Database). Navigation is stopped before the page loads. It also warns about look-alike addresses such as paypa1.com. The list can be refreshed once a day — if you want.",
      "pv8.t": "Safer downloads",
      "pv8.d": "Every file is tagged as “downloaded from the Internet”, so Windows SmartScreen and Defender check it. Programs like invoice.pdf.exe are flagged as disguised, and running an executable always asks first.",
      "pv9.t": "Update notifications",
      "pv9.d": "If you enable it, the browser asks once a day whether a new version exists and shows a link to the download page. It never downloads or runs anything by itself, so a hacked server cannot execute code on your computer.",
      "pv10.t": "Fingerprint protection",
      "pv10.d": "Canvas, audio and WebGL fingerprints differ for every site and every session, so trackers cannot connect you across sites. It works inside third-party iframes too. In Strict mode the device, screen, time zone and language look the same for everyone.",
      "pv11.t": "Tor and proxies",
      "pv11.d": "A Tor window (Ctrl+Shift+Alt+N) and the Anonymous level send all traffic through Tor: site names reach the proxy unresolved, with no DNS leak. If Tor is unavailable nothing is sent directly.",
      "pv12.t": "Fire and privacy levels",
      "pv12.d": "Ctrl+Shift+Del instantly closes windows and erases history, cookies, cache and permissions — and gives sites a brand-new identity. The Standard, Strict and Anonymous levels configure everything at once.",
      "s.privacycenter": "Privacy center",
      "alt.privacycenter": "F2PX privacy center: Standard, Strict and Anonymous levels",
      "s.shield": "Shield",
      "alt.shield": "Site shield: what was blocked on this page",
      "s.fire": "Fire",
      "alt.fire": "Fire: erase everything in one action",
      "s.palette": "Palette",
      "alt.palette": "F2PX command palette",
      "pv.not6": "F2PX has no password manager on purpose: a password vault inside a browser is the top target for malware. Use a dedicated manager (Bitwarden, KeePassXC).",
      "pv.not7": "The dangerous-site list is a snapshot from the build date until you enable updates, and look-alike warnings sometimes fire needlessly. Chromium itself is updated only by a new F2PX release. Protection lowers the risk; it does not replace care or an antivirus.",
      "pv.stat.d": "The browser ran behind a logging proxy, opened its own pages and sat idle: the proxy saw no requests at all. Pages you choose to visit do use the network, of course.",
      "pv.stat": "network requests in 30 seconds of startup and idle",
      "pv6.d": "Private windows save nothing. You can also clear cookies and history every time the browser closes.",
      "pv6.t": "Erased when you want",
      "pv4.d": "WebRTC does not reveal your local network address, spell check is off (its dictionaries are downloaded from Google servers), search suggestions are off, Do Not Track and GPC are on.",
      "pv4.t": "No leaks",
      "pv2.t": "Ad and tracker blocking",
      "pv1.d": "When idle, the browser sends nothing to the network: no telemetry, no sync. Refreshing the protection list and checking for a new version are your choice and stay off until you turn them on. We verify this with an automated test behind a logging proxy.",
      "pv1.t": "Zero requests on its own",
      "pv.lead": "In F2PX privacy is not a setting you have to hunt for — it is the default behaviour. Here is what that means in practice.",
      "alt.privacy": "F2PX privacy settings",
      "s.privacy": "Privacy",
      "hero.lead": "A fast Chromium-based browser where privacy is on by default: ad and tracker blocking, fingerprint protection, a Tor mode and not a single request without your say-so.",
      "nav.features": "Features",
      "nav.screens": "Screenshots",
      "nav.install": "Install",
      "nav.privacy": "Privacy",
      "nav.faq": "FAQ",
      "nav.download": "Download",
      "dl.setup": "Download for Windows",
      "dl.portable": "Portable version, no installation",
      "dl.notwin": "F2PX is currently available for Windows 10/11 only.",
      "dl.warn": "The installer is not signed with a code-signing certificate yet, so Windows may show a SmartScreen warning. <a href=\"#install\">How to continue</a>.",
      "f1.t": "Chromium engine",
      "f1.d": "Modern sites, video and web apps work just like in the browsers you know.",
      "f2.t": "Download manager",
      "f2.d": "Progress, speed, pause, retry and open file. Saved to Downloads\\F2PX by default.",
      "f3.t": "Tabs, without the noise",
      "f3.d": "Pin, drag, restore closed tabs and your previous session.",
      "f4.t": "Private windows",
      "f4.d": "History, cookies and cache are wiped when the last private window closes.",
      "f5.t": "Start page",
      "f5.d": "Quick access to favourite sites: add, reorder, rename and change icons.",
      "f6.t": "Bookmarks & history",
      "f6.d": "Folders, search, drag & drop. Import and export bookmarks from Chrome, Edge and Firefox.",
      "f7.t": "Keyboard shortcuts",
      "f7.d": "Ctrl+T, Ctrl+L, Ctrl+D, Ctrl+J, Ctrl+Shift+T — everything you are used to.",
      "f8.t": "Local only",
      "f8.d": "No account, no sync, no telemetry. History and settings live on your disk.",
      "s.home": "Start",
      "s.downloads": "Downloads",
      "s.bookmarks": "Bookmarks",
      "s.settings": "Settings",
      "i1.t": "Download the installer",
      "i1.d": "Use the “Download for Windows” button at the top. The file is F2PX-Browser-Setup.exe.",
      "i2.t": "Run it",
      "i2.d": "If Windows shows “Windows protected your PC”, click <b>More info</b>, then <b>Run anyway</b>. This is normal for apps without a paid signature.",
      "i3.t": "Done",
      "req.t": "Requirements",
      "req.disk": "Disk",
      "req.ram": "4 GB or more",
      "req.eng": "Engine",
      "ver.t": "Verify the file (SHA-256)",
      "ver.d": "Compare the hash of the downloaded file with the one below. If they differ, do not run the file.",
      "ver.copy": "Copy",
      "ver.copied": "Copied",
      "ver.cmd": "In PowerShell:",
      "p1": "Everything is stored on your computer: history, bookmarks, settings, downloads and session.",
      "p2": "F2PX has no server of its own, no accounts and no telemetry — it sends nothing to the developers.",
      "p3": "The network is used only for the sites you open and, if enabled, for search suggestions from your chosen search engine.",
      "p4": "Optional: Do Not Track and Global Privacy Control signals, one-click cookie and cache clearing.",
      "q1.q": "Why does Windows show a warning when I run it?",
      "q1.a": "The installer is not signed with a paid developer certificate yet, so SmartScreen does not know its publisher. Download the file only from this site and compare the SHA-256 from the Install section.",
      "q2.q": "Does signing in to Gmail / a Google account work?",
      "q3.q": "Will Netflix, Spotify and other protected content work?",
      "q3.a": "No: Widevine content protection (DRM) is not available in F2PX. Regular sites, video and music without DRM work.",
      "q4.q": "Are Chrome extensions supported?",
      "q4.a": "No. Ad and tracker blocking is already built in, though.",
      "q5.q": "Where is my data stored and how do I remove it?",
      "q5.a": "In %APPDATA%\\F2PX Browser. Uninstalling via Settings → Apps keeps the data; delete that folder to remove it completely.",
      "q6.q": "Are there macOS and Linux versions?",
      "q6.a": "Windows 10/11 (x64) only for now.",
      "foot.note": "Chromium · Electron · Windows 10/11 · MIT",
      "alt.home": "F2PX start page",
      "alt.downloads": "F2PX downloads page",
      "alt.bookmarks": "F2PX bookmark manager",
      "alt.settings": "F2PX settings",
      "meta.title": "F2PX Browser — private browser for Windows: ad blocking, anti-tracking, Tor mode",
      "nav.levels": "Levels",
      "nav.open": "Open source",
      "pill1": "175,000+ blocking rules",
      "pill2": "0 requests when idle",
      "pill3": "Tor · Fire · 3 levels",
      "pill4": "Open source · MIT",
      "dl.all": "All versions and source code on GitHub",
      "lv.lead": "Three ready-made bundles of settings. Pick one in the first-run wizard or in the Privacy center (Ctrl+Shift+P); if you change something by hand the level becomes “Custom”.",
      "lv.feature": "What is on",
      "lv.default": "default",
      "lv.r1": "Ads and trackers blocked (filter lists + built-in list)",
      "lv.r2": "Canvas, audio and WebGL fingerprints neutralised",
      "lv.r3": "HTTPS-only, encrypted DNS, tracking parameters removed",
      "lv.r4": "Third-party cookies blocked",
      "lv.r5": "Cross-site Referer removed, no direct WebRTC",
      "lv.r6": "Same hardware, screen, time zone (UTC) and language for every user",
      "lv.r7": "Public sites cannot reach localhost or your local network",
      "lv.r8": "All traffic through Tor (never direct)",
      "lv.r9": "Cookies and history erased on exit",
      "sp1.t": "The site shield: see what is going on",
      "sp1.d": "The shield icon in the address bar shows how many ads, trackers, fingerprinting attempts and third-party cookies were stopped on this page. One switch turns protection off for a site that does not work with it.",
      "sp1.b1": "Counters for every page",
      "sp1.b2": "Exceptions for individual sites",
      "sp1.b3": "Clear a site’s data in one click",
      "sp2.t": "Three levels instead of a hundred switches",
      "sp2.d": "Standard suits everyone and rarely breaks anything. Strict blocks third-party cookies and makes your device look like every other F2PX user’s. Anonymous sends all traffic through Tor.",
      "sp2.b1": "Privacy center: live counters and every setting on one page",
      "sp2.b2": "Filter lists, cookies, Referer, WebRTC, Tor",
      "sp2.b3": "It plainly says what the protection does not do",
      "alt.privacy-center": "F2PX privacy center: Standard, Strict and Anonymous levels",
      "sp3.t": "Tor and proxies without leaks",
      "sp3.d": "A Tor window goes through Tor even when the rest of the browser connects directly. Site names are handed to the proxy without local resolution, WebRTC cannot bypass the route, and if Tor is unavailable you get an error — not an unprotected connection.",
      "sp3.b1": "System, Direct, your own proxy or Tor",
      "sp3.b2": "Finds a running Tor Browser or starts your tor.exe",
      "sp3.b3": "The browser’s own requests use the same route",
      "alt.privacy-connection": "Privacy center: connecting through Tor or a proxy",
      "sp4.t": "Fire: erase everything in one action",
      "sp4.d": "Ctrl+Shift+Del closes windows and erases history, session, cookies, cache, download list and permissions — in normal, private and Tor windows. Every site gets a new identity, so it cannot connect you with your last visit.",
      "sp4.b1": "You choose exactly what to erase",
      "sp4.b2": "Works from any window",
      "sp4.b3": "A new fingerprint identity for every site",
      "sp5.t": "Command palette",
      "sp5.d": "Ctrl+Shift+K: commands, open tabs, bookmarks and history in one box. Switch the privacy level, turn the shield off, open a Tor window — without leaving the keyboard. Search tabs with Ctrl+Shift+A.",
      "sp5.b1": "Fuzzy search over commands",
      "sp5.b2": "Tabs, bookmarks and history",
      "sp5.b3": "Save as PDF and screenshots",
      "f9.t": "Command palette",
      "f9.d": "Ctrl+Shift+K — commands, tabs, bookmarks and history in one box. Ctrl+Shift+A searches tabs.",
      "f10.t": "Search without tracking",
      "f10.d": "DuckDuckGo by default; Brave Search, Startpage, Qwant and Mojeek at hand. Search suggestions are off.",
      "f11.t": "PDF and screenshots",
      "f11.d": "Save a page as PDF or take a screenshot — from the menu or the palette.",
      "f12.t": "At home on Windows",
      "f12.d": "Native window controls with Snap Layouts, tray, autostart, dark / light / system theme.",
      "s.levels": "Setup",
      "alt.levels": "F2PX first-run wizard: choosing a privacy level",
      "s.connection": "Tor / proxy",
      "os.lead": "F2PX is written in the open. Read the code, build it yourself, run the tests — every protection is described in the README and covered by automated checks.",
      "os1.t": "Source code",
      "os1.d": "MIT licence. Electron, TypeScript, React. 152 unit tests and 300 end-to-end checks of the real app.",
      "os2.t": "What’s new",
      "os2.d": "The changelog of every version: what was added, what changed and how it was tested.",
      "os3.t": "Found a vulnerability?",
      "os3.d": "Report it privately through GitHub Security Advisories — no public issue needed.",
      "os.cta": "Open →",
      "os.tests": "The “zero requests” check: tests/e2e/06-no-background-traffic.mjs",
      "q11.q": "What do I need for Tor mode?",
      "q11.a": "Start Tor Browser — F2PX finds it at 127.0.0.1:9150 — or download the Tor Expert Bundle and point F2PX at tor.exe in the Privacy center: F2PX starts and stops it for you. While Tor is unavailable pages do not open in this mode: that is by design, so nothing is ever sent directly.",
      "q12.q": "A site breaks or asks for a captcha in Strict mode. What now?",
      "q12.a": "It happens: third-party cookies are needed by sign-in buttons and payment forms, and an identical “fingerprint” sometimes triggers a bot check. Click the shield icon in the address bar and turn protection off, or allow third-party cookies, for that site.",
      "q13.q": "Does F2PX block ads on YouTube?",
      "q13.a": "It blocks ads and trackers with the EasyList, uBlock and RU AdList filter lists, but it cannot skip YouTube video ads: that needs scriptlets, which the built-in engine does not have.",
      "q14.q": "Is the source open? Which licence?",
      "q14.a": "Yes, the code is open on GitHub under the MIT licence. The filter lists and the dangerous-site list are third-party data under their own licences (see THIRD_PARTY_NOTICES.md).",
      "q15.q": "How do I update?",
      "q15.a": "F2PX does not update itself. If you enable the check it only shows a link to the new version — you download the installer here and verify its SHA-256. That way a compromised update server cannot run code on your computer.",
      "foot.src": "Source",
      "foot.rel": "Releases",
      "foot.log": "Changelog",
      "foot.sec": "Security",
      "skip": "Skip to content"
    }
  }

  var SHOTS = {
      "home": {
          "title": "New tab",
          "addr": "",
          "bare": false,
          "w": 1920,
          "h": 1140
      },
      "privacy-center": {
          "title": "Privacy center",
          "addr": "f2px://privacy",
          "bare": false,
          "w": 1920,
          "h": 1140
      },
      "shield": {
          "title": "",
          "addr": "",
          "bare": true,
          "w": 960,
          "h": 750
      },
      "fire": {
          "title": "",
          "addr": "",
          "bare": true,
          "w": 960,
          "h": 810
      },
      "palette": {
          "title": "",
          "addr": "",
          "bare": true,
          "w": 1140,
          "h": 1050
      },
      "levels": {
          "title": "Welcome to F2PX",
          "addr": "f2px://welcome",
          "bare": false,
          "w": 1920,
          "h": 1140
      },
      "privacy-connection": {
          "title": "Privacy center",
          "addr": "f2px://privacy",
          "bare": false,
          "w": 1920,
          "h": 1140
      },
      "downloads": {
          "title": "Downloads",
          "addr": "f2px://downloads",
          "bare": false,
          "w": 1920,
          "h": 1140
      },
      "bookmarks": {
          "title": "Bookmarks",
          "addr": "f2px://bookmarks",
          "bare": false,
          "w": 1920,
          "h": 1140
      },
      "settings": {
          "title": "Settings",
          "addr": "f2px://settings",
          "bare": false,
          "w": 1920,
          "h": 1140
      }
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
    all('[data-alt]').forEach(function (el) { var t = dict[el.getAttribute('data-alt')]; if (t != null) el.alt = t })
    all('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)) })
    document.title = dict['meta.title']
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
    var shot = SHOTS[name]
    img.width = shot.w
    img.height = shot.h
    // the popup shots already contain the browser's own tab strip and toolbar
    $('#frame').classList.toggle('frame--bare', !!shot.bare)
    $('#frame-title').textContent = shot.title
    $('#frame-addr').textContent = shot.addr || 'Search or enter address'
    all('[data-shot]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-shot') === name)) })
  }

  // language
  all('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')) }) })
  var saved = store('f2px-lang')
  var browserRu = /^(ru|uk|be|kk)/i.test(navigator.language || '')
  applyLang(saved === 'en' || saved === 'ru' ? saved : browserRu ? 'ru' : 'en')

  // screenshots: click and arrow keys
  var tabs = all('[data-shot]')
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () { showShot(b.getAttribute('data-shot')) })
    b.addEventListener('keydown', function (e) {
      var next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1
      if (next < 0 || next >= tabs.length) return
      e.preventDefault()
      tabs[next].focus()
      showShot(tabs[next].getAttribute('data-shot'))
    })
  })

  // highlight the current section in the header
  if ('IntersectionObserver' in window) {
    var links = {}
    all('.top__nav a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a })
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || !links[e.target.id]) return
        Object.keys(links).forEach(function (k) { links[k].classList.toggle('is-current', k === e.target.id) })
      })
    }, { rootMargin: '-30% 0px -60% 0px' })
    Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) observer.observe(s) })
  }

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
