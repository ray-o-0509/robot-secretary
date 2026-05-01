const USER_AGENT = 'robot-secretary/1.0 (rayotsuka)'

const SYMBOLS: Record<string, [string, string]> = {
  clearsky:                    ['clear',        '快晴'],
  fair:                        ['sunny',        '晴れ'],
  partlycloudy:                ['partly_cloudy','晴れ時々曇り'],
  cloudy:                      ['cloudy',       '曇り'],
  fog:                         ['fog',          '霧'],
  lightrain:                   ['rain',         '弱い雨'],
  rain:                        ['rain',         '雨'],
  heavyrain:                   ['rain',         '強い雨'],
  lightrainshowers:            ['showers',      '弱いにわか雨'],
  rainshowers:                 ['showers',      'にわか雨'],
  heavyrainshowers:            ['showers',      '激しいにわか雨'],
  lightsleet:                  ['rain',         '弱いみぞれ'],
  sleet:                       ['rain',         'みぞれ'],
  heavysleet:                  ['rain',         '強いみぞれ'],
  lightsnow:                   ['snow',         '弱い雪'],
  snow:                        ['snow',         '雪'],
  heavysnow:                   ['snow',         '強い雪'],
  lightsnowshowers:            ['snow',         '弱いにわか雪'],
  snowshowers:                 ['snow',         'にわか雪'],
  lightrainandthunder:         ['thunderstorm', '雷雨'],
  rainandthunder:              ['thunderstorm', '雷雨'],
  heavyrainandthunder:         ['thunderstorm', '激しい雷雨'],
  lightrainshowersandthunder:  ['thunderstorm', '雷雨'],
  rainshowersandthunder:       ['thunderstorm', '雷雨'],
  heavyrainshowersandthunder:  ['thunderstorm', '激しい雷雨'],
}

function mapSymbol(code?: string): [string, string] {
  if (!code) return ['cloudy', '曇り']
  const base = code.replace(/_(day|night|polartwilight)$/, '')
  return SYMBOLS[base] ?? ['cloudy', '曇り']
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土']

function windDir(deg: number | null): string {
  if (deg == null) return ''
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  return dirs[Math.round(deg / 45) % 8]
}

function localParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour === '24' ? '00' : parts.hour,
    weekday: new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`).getUTCDay(),
  }
}

type MetDetails = {
  air_temperature?: number
  wind_from_direction?: number
  wind_speed?: number
  wind_speed_of_gust?: number
  relative_humidity?: number
  air_pressure_at_sea_level?: number
  dew_point_temperature?: number
  cloud_area_fraction?: number
  ultraviolet_index_clear_sky?: number
}
type MetEntry = {
  time: string
  _hour: string
  _date: string
  data?: {
    instant?: { details?: MetDetails }
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number; probability_of_precipitation?: number } }
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number; probability_of_precipitation?: number } }
    next_12_hours?: { summary?: { symbol_code?: string } }
  }
}
type GeoResult = {
  results?: { name: string; latitude: number; longitude: number; timezone: string }[]
}

export async function getWeather(location: string) {
  // 1. Geocode
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=ja&format=json`
  )
  if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`)
  const geo = (await geoRes.json()) as GeoResult
  if (!geo.results?.length) throw new Error(`Location not found: ${location}`)
  const place = geo.results[0]
  const loc = {
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  }

  // 2. met.no
  const metRes = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${loc.latitude.toFixed(4)}&lon=${loc.longitude.toFixed(4)}`,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
  )
  if (!metRes.ok) throw new Error(`met.no API error: ${metRes.status}`)
  const j = (await metRes.json()) as { properties?: { timeseries?: Omit<MetEntry, '_hour' | '_date'>[] } }
  const rawSeries = j.properties?.timeseries ?? []
  if (!rawSeries.length) throw new Error('No weather data returned')

  // 3. Group by local date
  const byDate = new Map<string, MetEntry[]>()
  for (const entry of rawSeries) {
    const { date, hour } = localParts(new Date(entry.time), loc.timezone)
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push({ ...entry, _hour: hour, _date: date })
  }
  const series: MetEntry[] = [...byDate.values()].flat()

  // Current conditions
  const first = series[0]
  const cur = first.data?.instant?.details ?? {}
  const curSym =
    first.data?.next_1_hours?.summary?.symbol_code ??
    first.data?.next_6_hours?.summary?.symbol_code ??
    first.data?.next_12_hours?.summary?.symbol_code
  const [condition, conditionLabel] = mapSymbol(curSym)

  // Hourly (next 24 from now)
  const nowMs = Date.now()
  const hourly = rawSeries
    .filter((e) => new Date(e.time).getTime() >= nowMs)
    .slice(0, 24)
    .map((e) => {
      const lp = localParts(new Date(e.time), loc.timezone)
      const sym = e.data?.next_1_hours?.summary?.symbol_code ?? e.data?.next_6_hours?.summary?.symbol_code
      const [c] = mapSymbol(sym)
      return {
        time: lp.hour,
        temp: e.data?.instant?.details?.air_temperature != null ? Math.round(e.data.instant.details.air_temperature) : null,
        condition: c,
        precip: Math.round(
          (e.data?.next_1_hours?.details?.probability_of_precipitation ??
            e.data?.next_6_hours?.details?.probability_of_precipitation) ?? 0
        ),
        precipAmount: Math.round(((e.data?.next_1_hours?.details?.precipitation_amount) ?? 0) * 10) / 10,
      }
    })

  // Daily (7 days)
  const sortedDates = [...byDate.keys()].sort().slice(0, 7)
  const daily = sortedDates.map((d, i) => {
    const entries = byDate.get(d)!
    let high = -Infinity, low = Infinity, totalPrecip = 0
    for (const e of entries) {
      const t = e.data?.instant?.details?.air_temperature
      if (t != null) { if (t > high) high = t; if (t < low) low = t }
      if (e.data?.next_1_hours?.details?.precipitation_amount != null) {
        totalPrecip += e.data.next_1_hours.details.precipitation_amount
      } else if (e.data?.next_6_hours?.details?.precipitation_amount != null) {
        totalPrecip += e.data.next_6_hours.details.precipitation_amount
      }
    }
    const rep = entries.find((e) => e._hour === '12') ?? entries.find((e) => e._hour === '09') ?? entries[0]
    const sym =
      rep.data?.next_6_hours?.summary?.symbol_code ??
      rep.data?.next_1_hours?.summary?.symbol_code ??
      rep.data?.next_12_hours?.summary?.symbol_code
    const [c, label] = mapSymbol(sym)
    return {
      day: i === 0 ? '今日' : WEEKDAY_JA[localParts(new Date(`${d}T12:00:00Z`), loc.timezone).weekday],
      high: high === -Infinity ? null : Math.round(high),
      low: low === Infinity ? null : Math.round(low),
      condition: c,
      conditionLabel: label,
      precipAmount: Math.round(totalPrecip * 10) / 10,
    }
  })

  const dir = windDir(cur.wind_from_direction ?? null)
  return {
    location: loc.name,
    timezone: loc.timezone,
    temp: cur.air_temperature != null ? Math.round(cur.air_temperature) : null,
    tempHigh: daily[0]?.high ?? null,
    tempLow: daily[0]?.low ?? null,
    condition,
    conditionLabel,
    precipAmount: daily[0]?.precipAmount ?? 0,
    humidity: cur.relative_humidity != null ? Math.round(cur.relative_humidity) : null,
    wind: cur.wind_speed != null ? `${dir} ${Math.round(cur.wind_speed)}m/s` : null,
    windSpeed: cur.wind_speed != null ? Math.round(cur.wind_speed) : null,
    windDir: dir,
    windGust: cur.wind_speed_of_gust != null ? Math.round(cur.wind_speed_of_gust) : null,
    pressure: cur.air_pressure_at_sea_level != null ? Math.round(cur.air_pressure_at_sea_level) : null,
    dewPoint: cur.dew_point_temperature != null ? Math.round(cur.dew_point_temperature) : null,
    cloudCover: cur.cloud_area_fraction != null ? Math.round(cur.cloud_area_fraction) : null,
    uvIndex: cur.ultraviolet_index_clear_sky != null ? Math.round(cur.ultraviolet_index_clear_sky * 10) / 10 : null,
    hourly,
    daily,
  }
}
