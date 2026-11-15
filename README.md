<img src="outputs/Politifree-Chrome/logo.png" alt="Politifree" width="300">

Politifree combines a Chrome extension and a Windows companion to filter political content while preserving ordinary content. The companion provides local image/OCR, semantic, and sampled-media analysis. This is an early community release, not a guarantee that every political item will disappear.

## Install on Windows

**[Download the complete Windows installer](https://github.com/adamsarnovsky/politifree/releases/download/v0.7.1/Politifree-Setup-v0.7.1.zip)** (246 MB). It bundles the Chrome extension, companion, and analysis models. This is the standard user download; keep both parts installed.

1. Extract the complete ZIP, then double-click `Install-Politifree.bat`.
2. Setup installs the companion dependencies and connects analysis to Chrome. Initial setup requires internet, 64-bit Windows, and at least 3 GB of free disk space. It installs Python 3.12 when needed.
3. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**. Select `%LOCALAPPDATA%\Politifree\Chrome`.
4. Refresh your tabs. The companion starts when needed. Politifree's On/Off switch controls both parts.

For updates, rerun the combined installer, click **Reload** on the same installed extension, and refresh your tabs. Disable a duplicate copy if it was loaded from another folder. See the [Windows installation guide](outputs/Politifree-Setup/README.md) and [Politifree website](https://keystonedigital.app/politifree/).

## Development source

Repository ZIPs and the small extension-only release asset are for development; they do not include the complete Windows runtime and models. To inspect the extension, load `outputs/Politifree-Chrome` in Chrome. For a source-based media engine, follow the [companion development instructions](outputs/Politifree-Companion/README.md). The supported user installation is the combined bundle above.

## Report a mistake

Open the extension and choose **Report a filtering mistake**. Choose missed political content or a false removal, then load and select an item from the current page. Edit out private information. Public URL entry is optional and manual. The exact report preview must be approved before saving JSON or opening a public GitHub issue draft. Submit the draft on GitHub to send it to maintainers. No report is sent automatically.

Community reports never directly become global blocks. Maintainers review evidence, add positive and negative tests, and sign a versioned data-only filter release. Enabled clients check every six hours. The report page also offers manual checks, an opt-out, and rollback. Failed downloads or signatures retain the last working rules.

Initial shared filters are empty; existing built-in filtering remains active. See [CONTRIBUTING](CONTRIBUTING.md) for accepted changes and [PRIVACY](PRIVACY.md) for reporting and update requests.

## Develop and test

Requires Node.js 22+ and Python 3 for packaging. No npm dependencies are needed for these checks:

```sh
node tests/community.cjs
node tests/community-background.cjs
node tests/classifier.cjs
python3 scripts/build.py
```

The development build writes `dist/politifree-<version>.zip`, with `manifest.json` at the ZIP root. This extension-only artifact must not be offered as the complete Windows download. Public Windows releases must include the combined installer, companion, and models; see the release checklist in CONTRIBUTING.md. The companion has its own pinned Python dependencies. Do not commit environments, model weights, runtime tokens, or captured private content.

## Limits

Exact-match community rules are scoped to one hostname. They do not execute remote JavaScript, accept arbitrary CSS selectors, or block entire domains. Allow rules only apply to text-only units so a matching caption cannot exempt an unrelated political image or video. Media/model problems may need code changes instead of filter-list changes. Protected media, unseen video frames and audio can remain unverified. Unknown content stays visible to reduce false removals.

Source code is MIT licensed. Third-party libraries and model weights keep their own licenses; see [THIRD_PARTY](THIRD_PARTY.md). The Politifree name and supplied artwork identify this project; the MIT license does not grant trademark rights or imply endorsement of forks.
