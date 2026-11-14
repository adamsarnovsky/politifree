<img src="outputs/Politifree-Chrome/logo.png" alt="Politifree" width="300">

Politifree hides political content while preserving ordinary content. The Chrome extension uses local text rules and an optional Windows companion for image/OCR, semantic and sampled media analysis. This is an early community release, not a guarantee that every political item will disappear.

## Install from source

1. Download this repository as a ZIP and extract it to a permanent folder.
2. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `outputs/Politifree-Chrome` (the folder containing `manifest.json`).
3. For local media analysis on Windows, follow [the companion instructions](outputs/Politifree-Companion/README.md). This requires a separate Python environment and model downloads. Text filtering works without it. Companion setup is not yet a one-click cross-platform install.
4. After updating these files, click **Reload** in Chrome and refresh your pages.

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

The build writes `dist/politifree-<version>.zip`, with `manifest.json` at the ZIP root. Extract before loading in Chrome. The companion has its own pinned Python dependencies. Do not commit environments, model weights, runtime tokens, or captured private content.

## Limits

Exact-match community rules are scoped to one hostname. They do not execute remote JavaScript, accept arbitrary CSS selectors, or block entire domains. Allow rules only apply to text-only units so a matching caption cannot exempt an unrelated political image or video. Media/model problems may need code changes instead of filter-list changes. Protected media, unseen video frames and audio can remain unverified. Unknown content stays visible to reduce false removals.

Source code is MIT licensed. Third-party libraries and model weights keep their own licenses; see [THIRD_PARTY](THIRD_PARTY.md). The Politifree name and supplied artwork identify this project; the MIT license does not grant trademark rights or imply endorsement of forks.
