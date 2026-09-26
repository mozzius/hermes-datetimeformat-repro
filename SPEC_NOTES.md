# ECMA-402 comparison: styled hours in Hermes

Scope: `Intl.DateTimeFormat` with `timeStyle`/`dateStyle` and hour-cycle
selection, not an audit of every Intl API. The observations below used
`2026-05-29T14:54:00Z`, `timeZone: 'UTC'`, and `en-GB` unless noted. The app
uses the same instant in `Europe/Helsinki` to reproduce the original `17:54`
report independent of the device's own time zone.

| Options / locale | Unpatched Apple Hermes (`static_h` `8eff1a6`) | Chrome 153 | Firefox 156 |
| --- | --- | --- | --- |
| `{timeStyle:'short'}` | `14:54` | `14:54` | `14:54` |
| `{timeStyle:'short', hour12:true}` | `14:54`; `hourCycle` and `hour12` absent | `02:54 pm`; `h12`, `true` | `2:54 pm`; `h12`, `true` |
| `{timeStyle:'short', hourCycle:'h12'}` | `14:54`; both fields absent | `02:54 pm`; `h12`, `true` | `2:54 pm`; `h12`, `true` |
| `en-GB-u-hc-h12`, `{timeStyle:'short'}` | `2:54 pm`; both fields absent | `2:54 pm`; `h12`, `true` | `2:54 pm`; `h12`, `true` |

The browser difference in the leading zero is permitted locale-data/pattern
variation; the ignored 12-hour request is not. Apple Hermes independently
reproduces the problem in its command-line runtime, without React Native,
Lingui, or FormatJS.

## Spec mapping

In [CreateDateTimeFormat](https://tc39.es/ecma402/#sec-createdatetimeformat),
`hour12` takes precedence over an explicit `hourCycle` and the `hc` locale
extension. The selected cycle comes from the locale's preferred
`[[hourCycle12]]` or `[[hourCycle24]]`, **not** from simply pairing the locale's
default 24-hour cycle with a 12-hour cycle that has the same start hour.
For example, `en-GB`'s default is `h23`, but its preferred 12-hour cycle is
`h12` (midnight `12:54 am`); `ja-JP` instead prefers `h11` (midnight `0:54`).

`DateTimeStyleFormat` includes an hour when `timeStyle` is present. Therefore
`[[HourCycle]]` is set, and
[`resolvedOptions()`](https://tc39.es/ecma402/#sec-intl.datetimeformat.prototype.resolvedoptions)
must expose both `hourCycle` and `hour12`. With `dateStyle` alone, no hour is
present, so both fields remain absent. An unsupported `hc` locale extension
must be ignored. These are covered by Test262's
[`hourCycle-timeStyle.js`](https://github.com/tc39/test262/blob/main/test/intl402/DateTimeFormat/prototype/resolvedOptions/hourCycle-timeStyle.js),
[`hourCycle-dateStyle.js`](https://github.com/tc39/test262/blob/main/test/intl402/DateTimeFormat/prototype/resolvedOptions/hourCycle-dateStyle.js),
and locale/option precedence tests.

## Hermes backend trace

- Apple (`lib/Platform/Intl/PlatformIntlApple.mm`) previously cleared
  `hourCycle_` whenever the explicit `hour` option was absent, even with
  `timeStyle`. `initializeNSDateFormatter()` then returned after setting a
  style, without applying an option-selected hour cycle to the formatter's
  locale. The upstream patch handles the styled hour, uses Foundation's
  preferred `h`/`H` template to choose 12/24-hour variants, and gives the
  style formatter a locale containing the resolved `hc` extension.
- The non-Apple C++ ICU backend (`PlatformIntlICU.cpp`) has the same
  `!hour_.has_value()` clearing condition, and its styled `udat_open` path
  does not apply `hourCycle_`. This is a source-level finding, **not** a
  runtime-tested claim about a particular Linux build.
- Android's Java `DateTimeFormat.java` accounts for `timeStyle` when deciding
  whether an hour exists. The API 24+ ICU and older `java.text` formatter
  paths have separate behavior; the device observations below are for API 35.

## Android device comparison

The standalone RN 0.86.3 repro ran on a Pixel 9 Pro Android 15 (API 35)
emulator, with Hermes `250829098.0.17` and Chromium WebView 124.0.6367.219.
The fixed instant and `Europe/Helsinki` zone were used in both engines. The
device's 24-hour clock preference was **off**, and the original Bluesky/Lingui
path formatted `5:54 pm` on Hermes. Thus Android does **not** reproduce the
Apple backend's ignored `timeStyle` + `hour12` behavior.

| Locale, options, local time | Android Hermes: format / `hourCycle` | Chromium WebView: format / `hourCycle` |
| --- | --- | --- |
| `en-GB`, `timeStyle: 'short', hour12: true`, 17:54 | `5:54 pm` / `h11` | `05:54 pm` / `h12` |
| same options, 00:54 | `12:54 am` / `h11` | `12:54 am` / `h12` |
| `en-GB`, explicit `hourCycle: 'h11'`, 00:54 | `12:54 am` / `h11` | `00:54 am` / `h11` |
| `en-US`, `timeStyle: 'short', hour12: false`, 00:54 | `00:54` / `h24` | `00:54` / `h23` |
| `en-US`, explicit `hourCycle: 'h24'`, 00:54 | `00:54` / `h24` | `24:54` / `h24` |
| `ja-JP`, `timeStyle: 'short', hour12: true`, 00:54 | `午前0:54` / `h11` | `午前0:54` / `h11` |

The explicit `h11`/`h24` cases establish a conformance failure independent
of browser-specific locale-data choices: the requested cycle and reported
cycle agree, but the hour at midnight is wrong. For `hour12` alone, Android
also reports the opposite cycle from the one its output actually uses.
`formatToParts()` classifies the hour and day period correctly in these rows,
unlike the separate Apple combined-style issue noted above.

In Android's `DateTimeFormat.java`, the `hour12` selection pairs a default
`h23` with `h11` and a default `h12` with `h24` instead of obtaining the
locale's preferred 12- and 24-hour cycles. In
`PlatformDateTimeFormatterICU.java`, both `H11` and `H12` are collapsed to an
`h` skeleton, and both `H23` and `H24` to `k`; the resulting pattern on this
device formats midnight as `12` or `00` regardless of the requested starting
hour. The Android Test262 harness currently skips its
`resolvedOptions/hourCycle-timeStyle.js` test. The Apple-only upstream PR does
not change either Android Java file, so this needs a separate upstream fix and
Android regression tests (including API-level coverage).

The Apple patch passes the existing Apple formatter test, its new regression
test, and the focused Test262 `hourCycle-timeStyle`, `hourCycle-dateStyle`,
`hourCycle`, and locale-precedence tests. A broader Test262 style-output test
still disagrees on full-style UTC zone wording (`GMT+00:00` vs
`Coordinated Universal Time`); that is separate from the hour-cycle failure
and may be locale-data/implementation variation. In a separate observed case,
Apple Hermes `formatToParts()` classified the time portion of a combined
`dateStyle` + `timeStyle` result as literals. That too is outside the
hour-cycle patch and deserves its own targeted regression.

The RN repro intentionally shows `formatToParts()` types to make that
additional difference visible. On iOS its WebView uses WebKit, not Chrome or
Firefox; the browser numbers above were obtained separately in those browsers.
