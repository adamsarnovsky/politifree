# Politifree Windows setup

Extension 0.7.1 · Companion 0.6.15

Package: `Politifree-Setup-v0.7.1.zip`

![Politifree](logo.png)

This is the standard Windows download. It includes the Chrome extension,
the companion, and its analysis models. Keep them together: the companion
provides the image, semantic, and sampled-media analysis used by Politifree.
The small extension-only archive is a developer artifact, not the complete app.

## Install

1. In Windows File Explorer, right-click the downloaded ZIP and choose
   **Extract All**. Open the extracted folder; do not open or run files from
   inside the ZIP.
2. Double-click **Install-Politifree.bat** in the extracted folder. Wait until
   setup says **Windows files are ready**. The first dependency installation may
   take several minutes.
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose
   **Load unpacked**, and select `%LOCALAPPDATA%\Politifree\Chrome`.
   Select the installed Chrome folder, not the ZIP or a Downloads parent.
4. Refresh open pages. Open Politifree from Chrome’s toolbar and confirm it
   says **Filtering active · media checked automatically**.

If the toolbar does not show that status, rerun **Install-Politifree.bat**, then
open `chrome://extensions` and reload the Politifree extension loaded from
`%LOCALAPPDATA%\Politifree\Chrome`. Refresh your pages and check the toolbar
status again.

The companion is part of setup, not a separate download. No token copying or
separate model switch is needed. Models load on demand and the helper exits
after 90 seconds of inactivity. Off stops it immediately. The installer removes
Politifree’s former sign-in shortcut during upgrades.

## Updates

For later updates, download and extract the new setup ZIP, then rerun the
installer. Keep the same installed folder, reload the Politifree extension at
`chrome://extensions`, and refresh open websites. If an old copy was loaded
from another folder, disable that copy to prevent duplicate filtering. Custom
site lists in that copy remain there and can be copied into the new extension’s
Settings.

The helper requires 64-bit Windows and Python 3.12 (installed automatically
when possible). Initial setup needs internet for dependencies. Allow at least
3 GB free disk space; a recent quad-core computer with 8 GB RAM is recommended.
These are provisional recommendations, not measurements across low-end
computers.

Analysis stays local. Uncertain content and inaccessible media may remain
visible; filtering coverage is not guaranteed for every item.
