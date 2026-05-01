import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuSun, LuCloudSun, LuCloud, LuCloudRain, LuCloudSnow,
  LuCloudLightning, LuCloudFog, LuDroplets,
} from 'react-icons/lu'
import { CYAN, FONT_MONO } from '../display/styles'
import { DisplayShell } from '../display/DisplayShell'

type HourlyItem = {
  time: string
  temp: number | null
  condition: string
  precip: number
  precipAmount: number
}

type DailyItem = {
  day: string
  high: number | null
  low: number | null
  condition: string
  conditionLabel: string
  precipAmount: number
}

type WeatherData = {
  location: string
  timezone: string
  temp: number | null
  tempHigh: number | null
  tempLow: number | null
  condition: string
  conditionLabel: string
  precipAmount: number
  humidity: number | null
  wind: string | null
  windSpeed: number | null
  windDir: string
  windGust: number | null
  pressure: number | null
  dewPoint: number | null
  cloudCover: number | null
  uvIndex: number | null
  hourly: HourlyItem[]
  daily: DailyItem[]
}

type IconComponent = React.ComponentType<{ size?: number; style?: React.CSSProperties }>

const CONDITION_ICON: Record<string, IconComponent> = {
  clear:         LuSun,
  sunny:         LuCloudSun,
  partly_cloudy: LuCloudSun,
  cloudy:        LuCloud,
  overcast:      LuCloud,
  rain:          LuCloudRain,
  showers:       LuDroplets,
  snow:          LuCloudSnow,
  fog:           LuCloudFog,
  thunderstorm:  LuCloudLightning,
}

function Icon({ cond, size }: { cond: string; size: number }) {
  const C = CONDITION_ICON[cond] ?? LuCloud
  return <C size={size} />
}

export function WeatherApp() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const off = window.electronAPI?.onWeatherData((raw) => {
      setData(raw as WeatherData)
      setFetchedAt(Date.now())
      setLoading(false)
    })
    return () => off?.()
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: 'transparent' }}>
      <DisplayShell
        label="◢ WEATHER // MET.NO"
        fetchedAt={fetchedAt || undefined}
        loading={loading && !data}
        onClose={() => window.electronAPI?.weatherClose()}
      >
        {!data ? (
          <Standby />
        ) : (
          <>
            <CurrentWeather data={data} />
            <HourlyForecast hourly={data.hourly} />
            <DailyForecast daily={data.daily} />
            <DetailsGrid data={data} />
          </>
        )}
      </DisplayShell>
    </div>
  )
}

function Standby() {
  return (
    <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 3, color: 'rgba(0, 240, 255, 0.3)', textAlign: 'center', marginTop: 60 }}>
      STANDBY
    </div>
  )
}

function CurrentWeather({ data }: { data: WeatherData }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
      {/* 大きなアイコン */}
      <div style={{ flexShrink: 0, filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.4))' }}>
        <Icon cond={data.condition} size={52} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 44, fontWeight: 700, fontFamily: FONT_MONO, color: '#e8f6ff', lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
            {data.temp ?? '—'}°
          </span>
          <span style={{ fontSize: 11, color: 'rgba(0,240,255,0.7)', fontFamily: FONT_MONO, letterSpacing: 1 }}>
            {data.location}
          </span>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, fontFamily: FONT_MONO, color: 'rgba(200,230,255,0.75)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{data.conditionLabel}</span>
          {data.tempHigh != null && data.tempLow != null && (
            <span style={{ fontFeatureSettings: '"tnum"' }}>↑{data.tempHigh}° ↓{data.tempLow}°</span>
          )}
          {data.precipAmount > 0 && (
            <span style={{ color: '#00cfff' }}>☂ {data.precipAmount}mm</span>
          )}
        </div>
      </div>
    </div>
  )
}

function HourlyForecast({ hourly }: { hourly: HourlyItem[] }) {
  if (!hourly.length) return null
  const items = hourly.slice(0, 12)

  return (
    <div>
      <SectionLabel>HOURLY</SectionLabel>
      <div
        style={{
          display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {items.map((h, i) => (
          <div
            key={i}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              flexShrink: 0, width: 40,
              background: 'rgba(0,240,255,0.04)',
              border: '1px solid rgba(0,240,255,0.12)',
              borderRadius: 4, padding: '6px 4px',
            }}
          >
            <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: 'rgba(0,240,255,0.6)', letterSpacing: 0.5 }}>
              {h.time}
            </div>
            <div style={{ marginTop: 3, marginBottom: 3 }}><Icon cond={h.condition} size={16} /></div>
            <div style={{ fontSize: 11, fontFamily: FONT_MONO, fontWeight: 600, color: '#e8f6ff', fontFeatureSettings: '"tnum"' }}>
              {h.temp != null ? `${h.temp}°` : '—'}
            </div>
            {h.precipAmount > 0 && (
              <div style={{ fontSize: 9, fontFamily: FONT_MONO, color: '#00cfff', fontFeatureSettings: '"tnum"' }}>
                {h.precipAmount}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DailyForecast({ daily }: { daily: DailyItem[] }) {
  if (!daily.length) return null
  return (
    <div>
      <SectionLabel>7-DAY</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {daily.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px',
              background: i === 0 ? 'rgba(0,240,255,0.07)' : 'rgba(0,240,255,0.03)',
              border: `1px solid ${i === 0 ? 'rgba(0,240,255,0.2)' : 'rgba(0,240,255,0.08)'}`,
              borderRadius: 4,
            }}
          >
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: i === 0 ? CYAN : 'rgba(200,230,255,0.6)', minWidth: 24, fontWeight: i === 0 ? 700 : 400 }}>
              {d.day}
            </span>
            <Icon cond={d.condition} size={16} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(200,230,255,0.55)', flex: 1 }}>
              {d.conditionLabel}
            </span>
            {d.precipAmount > 0 && (
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#00cfff', fontFeatureSettings: '"tnum"' }}>
                ☂{d.precipAmount}mm
              </span>
            )}
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#e8f6ff', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>
              ↑{d.high ?? '—'}° ↓{d.low ?? '—'}°
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailsGrid({ data }: { data: WeatherData }) {
  const { t } = useTranslation()
  const items: [string, string | number | null][] = [
    [t('weather.humidity'), data.humidity != null ? `${data.humidity}%` : null],
    [t('weather.wind'), data.wind],
    [t('weather.gust'), data.windGust != null ? `${data.windGust}m/s` : null],
    [t('weather.pressure'), data.pressure != null ? `${data.pressure}hPa` : null],
    ['UV', data.uvIndex != null ? String(data.uvIndex) : null],
    [t('weather.dewPoint'), data.dewPoint != null ? `${data.dewPoint}°` : null],
    [t('weather.cloudCover'), data.cloudCover != null ? `${data.cloudCover}%` : null],
  ].filter(([, v]) => v != null) as [string, string][]

  if (!items.length) return null
  return (
    <div>
      <SectionLabel>DETAILS</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 12px' }}>
        {items.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(0,240,255,0.07)' }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: 'rgba(0,240,255,0.5)', letterSpacing: 0.5 }}>{k}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#c8e0f0' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: 'rgba(0,240,255,0.45)', marginBottom: 6, marginTop: 2 }}>
      {children}
    </div>
  )
}
