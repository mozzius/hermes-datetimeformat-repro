# Hermes `Intl.DateTimeFormat` styled hour-cycle reproducer

Standalone React Native/Expo 57 app using the same React Native, Lingui,
FormatJS imports, and `expo-localization` clock preference as Bluesky social-app
PR [#11709](https://github.com/bluesky-social/social-app/pull/11709).

The screen compares native Hermes and a WebView side by side. Both run the same
cases with `en-GB`, a fixed instant (`2026-05-29T14:54:00Z`), and an explicit
`Europe/Helsinki` time zone (local time `17:54`). Every cell shows the formatted
string, `resolvedOptions().hourCycle`, `resolvedOptions().hour12`, and the
`formatToParts()` types. The header also executes the original PR helper via
Lingui, driven by the device's actual 12/24-hour setting.

## Run

Requirements: Xcode and an iOS simulator (or Android SDK/emulator), Node.js,
and pnpm. Run a **development build**, not Expo Go, to use the pinned RN/Hermes
version:

```sh
pnpm install
pnpm ios
```

For the exact PR path, set the iOS simulator's **Settings → General → Date &
Time → 24-Hour Time** to off and press “Rerun comparison.” The explicit
`hour12: true` row reproduces regardless of that setting. `pnpm android` runs
the same probe on Android.

Expected on affected iOS Hermes: `timeStyle: 'short', hour12: true` gives
`17:54`, with `hourCycle` and `hour12` missing from `resolvedOptions()`. The
WebView gives a 12-hour time with a PM marker, and `h12`/`true`. The locale
extension `en-GB-u-hc-h12` and explicit `{hour, minute}` rows are controls.
Additional rows cover precedence between locale and options, the absence of
hour-cycle fields for a date-only style, and Japanese midnight (`h11`).

On Android 15 (API 35) with RN 0.86.3, the original `hour12: true` request
*does* produce a 12-hour time. A separate Hermes defect is visible at
midnight: `en-GB` reports `h11` for `hour12: true` while formatting `12:54 am`
(`h12` behavior), and explicitly requesting `h11` still formats `12:54 am`.
Likewise, `en-US` reports `h24` for `hour12: false` while formatting `00:54`
(`h23` behavior); explicitly requesting `h24` still formats `00:54`. The
Chromium WebView displays `00:54 am` for explicit `h11` and `24:54` for
explicit `h24`. These Android rows are distinct from the iOS styled-hour
failure and are described in the spec notes.

The same failing engine call can be tried without the UI:

```js
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeStyle: 'short',
  hour12: true,
  timeZone: 'Europe/Helsinki',
})
console.log(formatter.format(new Date('2026-05-29T14:54:00Z')))
console.log(formatter.resolvedOptions())
```

An iOS WebView runs WebKit, **not Chrome**; an Android WebView runs Chromium.
This app makes the engine distinction visible in the header. It does not
require login, network services, or any Bluesky code.

See [SPEC_NOTES.md](SPEC_NOTES.md) for the ECMA-402 algorithm, observed browser
results, and the related but distinct Hermes backend gaps.
