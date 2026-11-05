# Akyuu's Music Box

<img width="1264" height="844" alt="Screenshot From 2026-11-05 14-42-15" src="https://github.com/user-attachments/assets/57fd425f-829c-46f9-a03c-7081b7270783" />

A small (well not really it's electron) Linux desktop player for Touhou arrangements. Pick a genre, a game, a character or a song (or hit **Roll**),
and it finds arrangements on YouTube and plays them in the embedded YouTube player in the app.

*Unofficial fan project. Not affiliated with or endorsed by ZUN / Team Shanghai Alice or YouTube.*

## Themes
<img width="1264" height="844" alt="Screenshot From 2026-11-05 14-41-08" src="https://github.com/user-attachments/assets/6905463a-1bd5-43d0-93bd-c518f931a910" />
<img width="1264" height="844" alt="Screenshot From 2026-11-05 14-41-06" src="https://github.com/user-attachments/assets/23c7ebe5-369c-4c44-b67b-51d22653265d" />
<img width="1264" height="844" alt="Screenshot From 2026-11-05 14-41-04" src="https://github.com/user-attachments/assets/8f540d48-0bc2-4bf2-8efe-02db1c2b62ad" />
<img width="1264" height="844" alt="Screenshot From 2026-11-05 14-41-01" src="https://github.com/user-attachments/assets/bf54fa4a-b295-46f0-a108-1b98ccca445e" />
<img width="1264" height="844" alt="Screenshot From 2026-11-05 14-40-58" src="https://github.com/user-attachments/assets/b74b8f28-437b-4bbd-a161-77d5536f0496" />
<img width="1264" height="844" alt="Screenshot From 2026-11-05 14-40-51" src="https://github.com/user-attachments/assets/8439f427-abed-4a36-a858-01cef17e33c2" />

## Features
- One search bar for everything: genres (about 130, grouped), Touhou 1 to 20 with their characters, famous songs, free text, and options (newest, hidden gems, vocal, instrumental, short, long, and more)
- Nothing plays by itself on launch, and captions are never switched on for you
- Playlist (with search, drag to reorder, shuffle) and history (with search, select and delete)
- Pastel themes in dark and light, any installed system font, optional per-song window title
- Software rendering by default; OpenGL (EGL or desktop) and Vulkan are available and fall back to software if they crash
- Automatic safe mode if a start ever fails to finish

## Install
Download the `.AppImage` from the **Releases** page, then:

    chmod +x Akyuus-Music-Box-*.AppImage
    ./Akyuus-Music-Box-*.AppImage

AppImages need FUSE 2 (`libfuse2`). If it is missing you can run `./Akyuus-Music-Box-*.AppImage --appimage-extract-and-run`.

## Build from source
Needs Node.js 22 or newer.

    npm ci
    npm run minify && npm start     # run from source
    npm run dist                    # build the AppImage into dist/

GitHub Actions builds the AppImage on every push (download it from the run's artifacts) and attaches it to a Release
when you push a version tag such as `v1.6.0`.

## Privacy and files
- The only file the app writes is `~/.akyuus-music-box/store.json` (settings, playlist, history). It writes no log files.
- Chromium's own scratch data lives in a RAM-backed folder (`$XDG_RUNTIME_DIR` or `/dev/shm`) and is deleted on exit.
- Chromium's Google update, component and Safe Browsing hosts are never contacted. Settings has an optional switch that also blocks YouTube analytics requests.
- Playing a video of course contacts YouTube.

## Troubleshooting
- Starts with problems: run with `--safe` (software rendering, default Chromium options).
- Player goes gray in a GPU mode: press **Reload player**, or switch Rendering to Software in Settings.
- Run from a terminal to see Chromium's console output; the app itself keeps no logs.

## Notes
- Search reads YouTube's public results page (no API key). That is not an official API, so it can break if YouTube changes its page.
- The pixel-art character logo is fan art, source: <https://www.pixiv.net/en/artworks/128368391>.

## License
MIT, see `LICENSE`. Electron and Chromium are under their own licenses (included in the AppImage).
