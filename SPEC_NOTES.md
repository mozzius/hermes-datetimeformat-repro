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
  whether an hour exists. Its ICU and legacy `java.text` formatters have
  separate style-handling code that warrants Android-specific tests before
  asserting conformance or changing them.

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
