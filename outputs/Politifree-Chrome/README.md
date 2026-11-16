# Politifree 0.7.5

![Politifree](logo.png)

## One switch, automatic analysis

Turn Politifree on and browse. The popup provides On/Off, Pause on this website,
Show removed items, and Settings. Site exceptions and politics-only domain
blocking remain available. Delayed audio screening is under Advanced and must
be started explicitly for the tab you want to hear.

The local engine connects through Chrome native messaging. It loads models on
the first analysis request and closes after 90 seconds without requests. Off
disconnects it immediately, cancels pending work and restores filtered content.
There are no model toggles, pairing tokens, HTTP listener or sign-in service in
the normal product flow. A missing engine is reported; text rules keep working.

## Install or update

Extract the combined setup download and double-click Install-Politifree.bat.
Load the folder shown by the installer: %LOCALAPPDATA%\Politifree\Chrome.
Future updates use the same folder, preserving its extension ID and settings.
Click Reload in chrome://extensions after an update and refresh open websites.
If you previously loaded a different folder, disable that old copy to avoid
double filtering. Site lists remain stored in the old extension; copy them in
Settings if you choose to migrate to the supported installation folder.

The helper still requires one Windows installation. A browser-only prototype
has been implemented and measured, but is not enabled in this release: its
image path lacks OCR and its speech/video path does not yet replace the native
models. It must pass equivalent coverage and hardware tests before replacement.

## Accuracy and privacy

Content is analysed locally. Ordinary or uncertain content remains visible.
Protected streams, inaccessible media, model errors and brief inserts can cause
misses. The constructed regression corpus is not a real-world accuracy claim.

## Development and release

From the workspace, run:

    outputs/Politifree-Companion/.venv/Scripts/python.exe work/release_politifree.py

This runs regression and native browser integration tests, evaluates the real
models, builds extension/helper/setup/Store archives, verifies hashes and writes
evidence. Tests require Node and the isolated browser runtime in work. Ordinary
users do not need those development tools.

classifier.js supplies text rules; adapters.js owns platform boundaries;
content.js owns DOM restoration/removal; advanced.js schedules visible content;
decision.js is the shared model decision policy; engine.js owns the native
connection and idle lifecycle. Evaluation uses the shipping decision function.

Version 0.7.5 bundles companion 0.6.17. Exact unchanged text windows reuse
previous scores in a bounded cache, while changed windows are fully analysed.
The companion avoids redundant image, audio-hash and native-message copies.
Models, thresholds, media resolution, sampling and filtering policy are
unchanged. These optimizations help repeated work and temporary allocations;
they do not remove model memory requirements or improve detection accuracy.

Version 0.7.4 recognizes explicit public-leader wartime-safety commentary,
including tightly constrained OCR text with missing spaces. Fictional, gaming,
ordinary personal and figurative-war examples remain regression controls.
Bounded decision metadata on the existing content element helps diagnose media
mistakes without recording pixels, post text or URLs in an additional log.
This is a targeted repair; video-frame misses and false removals still require
live investigation. It is not a claim of complete political-content coverage.

Version 0.7.3 defers analysis of zero-size hidden interface elements until they
become visible, preserving the existing audible-media exception. It also removes
the complete, safely identified Facebook video post when deeply nested video
markup would otherwise leave an empty card. Classifier thresholds and analysis
limits are unchanged. Targeted regressions cover both fixes; live verification
of this update requires reloading the installed extension.

Version 0.7.2 kept the same classifiers and media coverage while coalescing
repeated DOM changes, bounding active media transfers by bytes, and hashing
large payloads in bounded chunks. The companion caches image evidence separately
from captions, so a changed political caption is still checked. New resource
checks and paired benchmark evidence accompany the bundled release.

The Store archive is ready for developer review, not published. A publisher must
upload it, host the privacy notice, complete Store disclosures and reconcile the
assigned extension identity with native registration. Chrome Store updates
cannot be claimed until the listing is approved and installed from the Store.
