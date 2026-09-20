# Security policy

F2PX is a privacy and security tool, so vulnerability reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting: open the repository's **Security** tab → **Report a vulnerability**.
Include what you found, how to reproduce it, the F2PX version (*Settings → About*) and, if you can, a suggested fix.

You can expect an acknowledgement within a few days. Once a fix is released you are welcome to be credited in the changelog.

## What counts

Especially interesting:

* a web page reaching the `window.f2px` bridge, the main process, or the local file system;
* a way around the privacy guarantees: traffic that leaves outside the selected route (proxy / Tor), a DNS or WebRTC leak,
  a request the browser UI makes on its own, data that survives **Fire** or a private / Tor window;
* a way around the page shield (fingerprint protection, third-party cookie blocking) that is not already listed in the README's "Honest limits";
* weaknesses in the encrypted vault (`f2px.vault`) or the start-up password handling;
* a filter list line that can break out of the element-hiding stylesheet or freeze the browser.

Known limits (not vulnerabilities): F2PX is not Tor Browser and does not make every user look identical; the installer is unsigned;
Chromium is updated only by rebuilding on a newer Electron.

## Supported versions

Only the latest release receives security fixes.
