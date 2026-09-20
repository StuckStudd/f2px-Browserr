/**
 * Built-in list of well-known advertising, analytics and cross-site tracking hosts.
 *
 * This is deliberately a compact, conservative list (host suffixes, matched only for THIRD-PARTY requests),
 * not a replacement for a full filter-list blocker such as uBlock Origin. It is chosen to remove the most
 * common cross-site trackers while rarely breaking sites.
 */

/** Blocked at "standard" and "strict". */
export const TRACKER_HOSTS: readonly string[] = [
  // Google advertising / analytics
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com', 'googletagservices.com',
  'adservice.google.com', 'analytics.google.com', '2mdn.net', 'admob.com', 'app-measurement.com',
  // ad exchanges & DSPs
  'adnxs.com', 'adsrvr.org', 'advertising.com', 'adform.net', 'criteo.com', 'criteo.net', 'rubiconproject.com',
  'pubmatic.com', 'openx.net', 'casalemedia.com', 'indexww.com', 'amazon-adsystem.com', 'smartadserver.com',
  'mediamath.com', 'bidswitch.net', 'contextweb.com', 'districtm.io', 'sitescout.com', 'simpli.fi', 'adroll.com',
  'sharethrough.com', 'teads.tv', 'yieldmo.com', '33across.com', 'sovrn.com', 'lijit.com', 'gumgum.com',
  'media.net', 'tapad.com', 'turn.com', 'zemanta.com', 'adsymptotic.com', 'adition.com', 'improvedigital.com',
  'adcolony.com', 'applovin.com', 'unityads.unity3d.com', 'inmobi.com', 'mopub.com', 'smaato.net',
  'ad.gt', 'adtechus.com', 'adtech.com', 'servedby-buysellads.com', 'exponential.com', 'undertone.com',
  // native ads / recommendation widgets
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com', 'zergnet.com', 'sponsoredtweets.com',
  // measurement & audience data
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'moatads.com', 'chartbeat.com', 'chartbeat.net',
  'demdex.net', 'omtrdc.net', '2o7.net', 'everesttech.net', 'krxd.net', 'bluekai.com', 'bkrtx.com', 'exelator.com',
  'eyeota.net', 'lotame.com', 'crwdcntrl.net', 'agkn.com', 'rlcdn.com', 'mathtag.com', 'liveramp.com',
  'permutive.com', 'id5-sync.com', 'adsafeprotected.com', 'doubleverify.com', 'iasds01.com', 'serving-sys.com',
  'tiqcdn.com', 'ensighten.com', 'nr-data.net', 'branch.io', 'appsflyer.com', 'adjust.com', 'kochava.com',
  // behaviour analytics / session replay
  'hotjar.com', 'hotjar.io', 'mixpanel.com', 'mxpnl.com', 'amplitude.com', 'fullstory.com', 'mouseflow.com',
  'crazyegg.com', 'luckyorange.com', 'heapanalytics.com', 'kissmetrics.com', 'inspectlet.com', 'clarity.ms',
  'smartlook.com', 'logrocket.com', 'segment.io', 'stats.wp.com', 'pixel.wp.com', 'statcounter.com',
  // social / platform tracking pixels
  'ads-twitter.com', 'analytics.twitter.com', 'ads.linkedin.com', 'px.ads.linkedin.com', 'snap.licdn.com',
  'analytics.tiktok.com', 'ct.pinterest.com', 'tr.snapchat.com', 'sc-static.net', 'alb.reddit.com',
  'bat.bing.com', 'ads.yahoo.com', 'analytics.yahoo.com', 'pixel.facebook.com',
  // Russian-language web
  'mc.yandex.ru', 'mc.yandex.com', 'an.yandex.ru', 'yandexadexchange.net', 'adfox.ru', 'adriver.ru', 'begun.ru',
  'counter.yadro.ru', 'top-fwz1.mail.ru', 'top.mail.ru', 'mc.webvisor.org', 'liveinternet.ru', 'ad.mail.ru',
  'relap.io', 'marketgid.com'
]

/** Additionally blocked at "strict": social widgets and fingerprinting scripts. */
export const STRICT_TRACKER_HOSTS: readonly string[] = [
  'connect.facebook.net', 'staticxx.facebook.com', 'platform.twitter.com', 'syndication.twitter.com',
  'platform.linkedin.com', 'platform.instagram.com', 'assets.pinterest.com', 'widgets.pinterest.com',
  'addthis.com', 'sharethis.com', 'addtoany.com', 'disqus.com', 'disquscdn.com',
  'fpjs.io', 'fpcdn.io', 'fingerprintjs.com', 'iovation.com', 'perimeterx.net'
]

/** `host` + path-prefix rules for trackers that live on otherwise useful domains. */
export const TRACKER_PATHS: ReadonlyArray<{ host: string; prefix: string }> = [
  { host: 'www.facebook.com', prefix: '/tr' },
  { host: 'facebook.com', prefix: '/tr' },
  { host: 'www.google.com', prefix: '/pagead/' },
  { host: 'www.google.com', prefix: '/ads/' },
  { host: 'www.youtube.com', prefix: '/pagead/' },
  { host: 'stats.g.doubleclick.net', prefix: '/' }
]
