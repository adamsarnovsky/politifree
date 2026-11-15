# Politifree Windows setup

Extension 0.7.0 · Companion 0.6.14

Package: `Politifree-Setup-v0.7.0.zip`

![Politifree](logo.png)

This is the standard Windows download. It includes the Chrome extension,
the companion, and its analysis models. Keep them together: the companion
provides the image, semantic, and sampled-media analysis used by Politifree.
The small extension-only archive is a developer artifact, not the complete app.

1. Extract the complete setup ZIP.
2. Double-click **Install-Politifree.bat**. It installs dependencies and connects
   the local analysis engine to Chrome automatically.
3. In Chrome Extensions, enable Developer mode, choose **Load unpacked**, and
   select the folder shown: `%LOCALAPPDATA%\Politifree\Chrome`.
4. Open a website. Politifree is on by default. Use its single switch to pause
   everything, or Pause on this website for a site exception.

The companion is part of setup, not a separate download. No token copying or
separate model switch is needed. Models load on demand and
the helper exits after 90 seconds of inactivity. Off stops it immediately. The
installer removes Politifree's former sign-in shortcut during upgrades.

For later updates, rerun this installer and click Reload on the same extension.
Refresh open websites. If an old copy was loaded from another folder, disable
that copy to prevent duplicate filtering. Custom site lists in that copy remain
there and can be copied into the new extension's Settings.

The supported location stays the same across updates. Do not load the ZIP itself
or a Pictures/Downloads parent folder. The folder must contain manifest.json.

The helper requires 64-bit Windows and Python 3.12 (installed automatically when
possible). Initial setup needs internet for dependencies. Allow at least 3 GB
free disk space; a recent quad-core computer with 8 GB RAM is recommended. These
are provisional recommendations, not measurements across low-end computers.

Analysis stays local. Uncertain content and inaccessible media remain visible.
