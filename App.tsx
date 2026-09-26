// Match the FormatJS imports in Bluesky's src/locale/i18n.ts. None of these
// replace Intl.DateTimeFormat.
import '@formatjs/intl-locale/polyfill-force.js'
import '@formatjs/intl-pluralrules/polyfill-force.js'
import '@formatjs/intl-numberformat/polyfill-force.js'
import '@formatjs/intl-displaynames/polyfill-force.js'
import '@formatjs/intl-pluralrules/locale-data/en.js'
import '@formatjs/intl-numberformat/locale-data/en-GB.js'
import '@formatjs/intl-displaynames/locale-data/en-GB.js'

import {useState} from 'react'
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {setupI18n} from '@lingui/core'
import {getCalendars} from 'expo-localization'
import WebView from 'react-native-webview'

const INSTANT = '2026-05-29T14:54:00Z'
const MIDNIGHT = '2026-05-28T21:54:00Z'
const TIME_ZONE = 'Europe/Helsinki' // 17:54 and 00:54 local time

type ProbeCase = {
  id: string
  label: string
  locale: string
  instant: string
  options: Intl.DateTimeFormatOptions
}

const CASES: ProbeCase[] = [
  {
    id: 'baseline',
    label: 'en-GB · timeStyle short',
    locale: 'en-GB',
    instant: INSTANT,
    options: {timeStyle: 'short'},
  },
  {
    id: 'hour12',
    label: 'timeStyle short + hour12 true',
    locale: 'en-GB',
    instant: INSTANT,
    options: {timeStyle: 'short', hour12: true},
  },
  {
    id: 'hourCycle',
    label: 'timeStyle short + hourCycle h12',
    locale: 'en-GB',
    instant: INSTANT,
    options: {timeStyle: 'short', hourCycle: 'h12'},
  },
  {
    id: 'locale',
    label: 'locale en-GB-u-hc-h12',
    locale: 'en-GB-u-hc-h12',
    instant: INSTANT,
    options: {timeStyle: 'short'},
  },
  {
    id: 'explicit',
    label: 'explicit hour + minute + hour12',
    locale: 'en-GB',
    instant: INSTANT,
    options: {hour: 'numeric', minute: 'numeric', hour12: true},
  },
  {
    id: 'dateTime',
    label: 'dateStyle medium + timeStyle short + hour12',
    locale: 'en-GB',
    instant: INSTANT,
    options: {dateStyle: 'medium', timeStyle: 'short', hour12: true},
  },
  {
    id: 'midnight',
    label: 'midnight · timeStyle short + hour12',
    locale: 'en-GB',
    instant: MIDNIGHT,
    options: {timeStyle: 'short', hour12: true},
  },
  {
    id: 'hour12Precedence',
    label: 'locale h24 overridden by hour12 true',
    locale: 'en-GB-u-hc-h24',
    instant: INSTANT,
    options: {timeStyle: 'short', hour12: true},
  },
  {
    id: 'hourCyclePrecedence',
    label: 'locale h12 overridden by hourCycle h23',
    locale: 'en-GB-u-hc-h12',
    instant: INSTANT,
    options: {timeStyle: 'short', hourCycle: 'h23'},
  },
  {
    id: 'dateOnly',
    label: 'dateStyle only · no hour cycle',
    locale: 'en-GB',
    instant: INSTANT,
    options: {dateStyle: 'medium', hour12: true},
  },
  {
    id: 'japaneseMidnight',
    label: 'ja-JP midnight · preferred h11',
    locale: 'ja-JP',
    instant: MIDNIGHT,
    options: {timeStyle: 'short', hour12: true},
  },
  {
    id: 'inverse',
    label: 'en-US · timeStyle short + hour12 false',
    locale: 'en-US',
    instant: INSTANT,
    options: {timeStyle: 'short', hour12: false},
  },
]

type ProbeResult = {
  id: string
  formatted?: string
  locale?: string
  hourCycle?: string
  hour12?: boolean
  parts?: Intl.DateTimeFormatPart[]
  error?: string
}

function runNativeCase(test: ProbeCase): ProbeResult {
  try {
    const formatter = new Intl.DateTimeFormat(test.locale, {
      ...test.options,
      timeZone: TIME_ZONE,
    })
    const date = new Date(test.instant)
    const resolved = formatter.resolvedOptions()
    return {
      id: test.id,
      formatted: formatter.format(date),
      locale: resolved.locale,
      hourCycle: resolved.hourCycle,
      hour12: resolved.hour12,
      parts: formatter.formatToParts(date),
    }
  } catch (error) {
    return {id: test.id, error: String(error)}
  }
}

const WEBVIEW_HTML = `<!doctype html><meta charset="utf-8"><script>
const tests = ${JSON.stringify(CASES)};
const timeZone = ${JSON.stringify(TIME_ZONE)};
const results = tests.map(test => {
  try {
    const formatter = new Intl.DateTimeFormat(test.locale, {
      ...test.options,
      timeZone,
    });
    const date = new Date(test.instant);
    const resolved = formatter.resolvedOptions();
    return {
      id: test.id,
      formatted: formatter.format(date),
      locale: resolved.locale,
      hourCycle: resolved.hourCycle,
      hour12: resolved.hour12,
      parts: formatter.formatToParts(date),
    };
  } catch (error) {
    return {id: test.id, error: String(error)};
  }
});
window.ReactNativeWebView.postMessage(JSON.stringify({
  userAgent: navigator.userAgent,
  results,
}));
</script>`

const i18n = setupI18n()
i18n.loadAndActivate({locale: 'en-GB', messages: {}})

// Exact code path from Bluesky PR #11709, before the local workaround.
function originalFormatDateTime(date: Date, options: Intl.DateTimeFormatOptions) {
  const uses24hourClock = getCalendars()[0]?.uses24hourClock ?? null
  return i18n.date(date, {
    ...options,
    ...(uses24hourClock === null ? {} : {hour12: !uses24hourClock}),
  })
}

function Result({result}: {result?: ProbeResult}) {
  if (!result) return <Text style={styles.small}>Loading…</Text>
  if (result.error) return <Text style={styles.error}>{result.error}</Text>

  return (
    <View>
      <Text selectable style={styles.value}>{result.formatted}</Text>
      <Text selectable style={styles.small}>
        hc: {String(result.hourCycle ?? 'undefined')} · hour12:{' '}
        {String(result.hour12 ?? 'undefined')}
      </Text>
      <Text selectable style={styles.small}>
        parts: {result.parts?.map(part => part.type).join(', ')}
      </Text>
    </View>
  )
}

export default function App() {
  const [refresh, setRefresh] = useState(0)
  const [webResults, setWebResults] = useState<ProbeResult[]>([])
  const [userAgent, setUserAgent] = useState('Loading…')
  const nativeResults = CASES.map(runNativeCase)
  const uses24hourClock = getCalendars()[0]?.uses24hourClock ?? null
  const isHermes = Boolean(
    (globalThis as typeof globalThis & {HermesInternal?: unknown}).HermesInternal,
  )
  let originalResult: string
  try {
    originalResult = originalFormatDateTime(new Date(INSTANT), {
      timeStyle: 'short',
      timeZone: TIME_ZONE,
    })
  } catch (error) {
    originalResult = `Error: ${String(error)}`
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Intl.DateTimeFormat: Hermes vs WebView</Text>
        <Text selectable style={styles.intro}>
          RN engine: {isHermes ? 'Hermes' : 'not Hermes'} · Device 24-hour clock:{' '}
          {String(uses24hourClock)}
          {'\n'}Bluesky PR #11709 path: {originalResult}
          {'\n'}Locale en-GB · zone {TIME_ZONE} · {INSTANT}
          {'\n'}WebView: {userAgent}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rerun the Intl comparison"
          style={styles.button}
          onPress={() => {
            setWebResults([])
            setRefresh(current => current + 1)
          }}>
          <Text style={styles.buttonText}>Rerun comparison</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <Text style={styles.columnHeader}>Native {isHermes ? 'Hermes' : 'JS'}</Text>
          <Text style={styles.columnHeader}>WebView</Text>
        </View>
        {CASES.map((test, index) => (
          <View key={test.id} style={styles.case}>
            <Text style={styles.label}>{test.label}</Text>
            <View style={styles.row}>
              <View style={styles.column}>
                <Result result={nativeResults[index]} />
              </View>
              <View style={styles.column}>
                <Result result={webResults.find(item => item.id === test.id)} />
              </View>
            </View>
          </View>
        ))}
        <Text style={styles.small}>
          Select text to copy. On iOS, WebView is WebKit; on Android it is Chromium.
          The midnight row also tests h12 vs h11 semantics.
        </Text>
        <WebView
          key={refresh}
          source={{html: WEBVIEW_HTML}}
          originWhitelist={['*']}
          style={styles.hiddenWebView}
          onMessage={event => {
            try {
              const report = JSON.parse(event.nativeEvent.data) as {
                userAgent: string
                results: ProbeResult[]
              }
              setUserAgent(report.userAgent)
              setWebResults(report.results)
            } catch (error) {
              setUserAgent(`Message error: ${String(error)}`)
            }
          }}
          onError={event => setUserAgent(event.nativeEvent.description)}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#f6f8fa'},
  content: {padding: 16, gap: 12},
  heading: {fontSize: 19, fontWeight: '700'},
  intro: {fontSize: 12, lineHeight: 20},
  button: {backgroundColor: '#0057bd', borderRadius: 8, padding: 12},
  buttonText: {color: 'white', textAlign: 'center', fontWeight: '600'},
  headerRow: {flexDirection: 'row', gap: 12},
  columnHeader: {flex: 1, fontWeight: '700', fontSize: 13},
  case: {backgroundColor: 'white', borderRadius: 8, padding: 10, gap: 8},
  label: {fontSize: 13, fontWeight: '600'},
  row: {flexDirection: 'row', gap: 12},
  column: {flex: 1, minWidth: 0},
  value: {fontSize: 14, fontWeight: '600'},
  small: {fontSize: 11, color: '#475569', lineHeight: 16},
  error: {fontSize: 11, color: '#b42318'},
  hiddenWebView: {width: 1, height: 1, opacity: 0},
})
