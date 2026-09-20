# Third-party data and notices

F2PX Browser itself is MIT-licensed (see `package.json`). It ships with, and can download, the following third-party
**data files**. They are not linked into the program; they are loaded as data at runtime and can be replaced or deleted.

## Ad- and tracker-blocking filter lists (`build/filters.txt.gz`)

The bundle is a condensed copy (comments and rule kinds F2PX cannot use are removed) of these lists. Every rule stays the work
of its authors; the lists are distributed under their own licences:

| List | Source | Licence |
| --- | --- | --- |
| EasyList | https://easylist.to/ | GPL-3.0 or CC BY-SA 3.0 |
| EasyPrivacy | https://easylist.to/ | GPL-3.0 or CC BY-SA 3.0 |
| uBlock filters (filters, privacy, badware, unbreak) | https://github.com/uBlockOrigin/uAssets | GPL-3.0 |
| RU AdList (RU, UA, UZ, KZ) | https://easylist-downloads.adblockplus.org/advblock.txt | CC BY-SA 3.0 |

Rebuild the bundle with `npm run filters:update`. Inside the app the lists can be refreshed from the Privacy center; the
sources are listed in `src/main/privacy/filterSources.json`.

## Malware / phishing host list (`build/threats.bin`)

| List | Source | Licence |
| --- | --- | --- |
| URLhaus host file | https://urlhaus.abuse.ch/ | CC0 |
| Phishing.Database (ACTIVE) | https://github.com/mitchellkrogza/Phishing.Database | MIT |

Rebuild with `npm run threats:update`.

## Fonts

`@fontsource/ibm-plex-mono` (SIL Open Font License 1.1) and `@fontsource-variable/inter` (SIL Open Font License 1.1).

## Runtime

F2PX is built on Electron (MIT) and Chromium (BSD-style and other licences, see `LICENSES.chromium.html` in an installed copy).
