# Raffi Flatpak

This directory contains Raffi's local Flatpak packaging.

`al.kaleid.raffi.yml` packages the `release/linux-unpacked` build created by Electron Builder.

```sh
cd apps/desktop
bash flatpak/build-local.sh
flatpak run al.kaleid.raffi
```

The build script expects `flatpak-builder` and the required Flatpak runtimes to be installed locally.

To create a distributable Flatpak bundle from an existing `release/linux-unpacked` build:

```sh
cd apps/desktop
bash flatpak/build-bundle.sh
```

Validate the desktop and AppStream metadata with:

```sh
cd apps/desktop/flatpak
desktop-file-validate al.kaleid.raffi.desktop
appstreamcli validate --no-net al.kaleid.raffi.metainfo.xml
```
