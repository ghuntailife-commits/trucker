# Dispatch — logo and app icons

The mark is a globe drawn on a keypad grid: two meridians and two parallels cut
it into nine keys, and the 3-5-7 diagonal is green. The lines are real cut-outs
(transparent), so the mark sits on any background without a box behind it.

## Colours

| Use | Day | Night |
|---|---|---|
| Globe | `#1E3A6E` navy | `#3A5A9A` lifted blue |
| Diagonal keys | `#2E7D40` green | `#3A9450` green |
| Wordmark | `#101B2E` ink | `#F1F3F7` off-white |

App icon: tile `#1E3A6E`, globe `#F4F1EA` cream, keys `#2E8B47` green.

Wordmark: Newsreader SemiBold (600), converted to outlines, so the files
need no font installed.

## What to use where

| File | Use it for |
|---|---|
| `logo/dispatch-lockup.svg` / `-night.svg` | Mark and name together: sign-in page, emails, documents |
| `logo/dispatch-mark.svg` / `-night.svg` | The mark alone, above 48px |
| `logo/dispatch-mark-small.svg` / `-small-night.svg` | The mark at 48px and below (the app header). Its lines are thicker so they don't fill in |
| `logo/dispatch-mark-mono-navy.svg` / `-mono-white.svg` | One-colour printing, stamps, watermarks |
| `logo/dispatch-wordmark.svg` / `-night.svg` | The name alone |
| `logo/png/` | PNGs of all the above (lockups at 96, 192 and 384px tall) |
| `app-icon/ios/` | `AppIcon-1024.png` for the App Store plus every device size. Square, with no transparency; iOS rounds the corners |
| `app-icon/android/` | Legacy `ic_launcher.png` per density, plus the adaptive-icon foreground and monochrome layers, and `play-store-512.png` |
| `app-icon/pwa/` | `icon-192/512.png` (rounded) and `maskable-192/512.png` (full bleed) for the web-app manifest |
| `favicon/` | `favicon.svg` (switches to the night colours when the browser is in dark mode), `favicon.ico` (16/32/48), `apple-touch-icon.png` |
| `*.svg` in `app-icon/` | The icon masters, if a size is missing |

## Web app: drop-in snippets

Copy `favicon/*` and `app-icon/pwa/*` into your `public/` folder, then:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111A2B" media="(prefers-color-scheme: dark)">
```

`manifest.webmanifest`:

```json
{
  "name": "Dispatch",
  "short_name": "Dispatch",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "background_color": "#1E3A6E",
  "theme_color": "#1E3A6E"
}
```

## Android adaptive icon

Copy each `mipmap-*` folder into `res/`, then add
`res/mipmap-anydpi-v26/ic_launcher.xml`:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
```

and `<color name="ic_launcher_background">#1E3A6E</color>` in `res/values/colors.xml`.

## Rules

- Keep clear space around the mark of at least a quarter of its width.
- Use the night colours on anything darker than mid-grey; never put the day navy on navy.
- Don't recolour the keys, add an outline or shadow, or stretch the globe.
