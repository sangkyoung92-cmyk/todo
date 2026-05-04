const WEATHER_CACHE_KEY = "assistant_weather_forecast";
const CACHE_MAX_AGE_MS = 1000 * 60 * 30;
const LOCATION_MATCH_DELTA = 0.08;
const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const WEATHER_LABELS = {
  0: "맑음",
  1: "대체로 맑음",
  2: "구름 조금",
  3: "흐림",
  45: "안개",
  48: "서리 안개",
  51: "약한 이슬비",
  53: "이슬비",
  55: "강한 이슬비",
  56: "어는 이슬비",
  57: "강한 어는 이슬비",
  61: "약한 비",
  63: "비",
  65: "강한 비",
  66: "어는 비",
  67: "강한 어는 비",
  71: "약한 눈",
  73: "눈",
  75: "강한 눈",
  77: "싸락눈",
  80: "약한 소나기",
  81: "소나기",
  82: "강한 소나기",
  85: "약한 눈 소나기",
  86: "강한 눈 소나기",
  95: "뇌우",
  96: "우박 동반 뇌우",
  99: "강한 우박 동반 뇌우",
};

export function readCachedWeather() {
  try {
    return JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

export function writeCachedWeather(weather) {
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));
}

export function isWeatherFresh(weather) {
  if (!weather?.fetchedAt) return false;
  return Date.now() - new Date(weather.fetchedAt).getTime() < CACHE_MAX_AGE_MS;
}

export function isWeatherForLocation(weather, location) {
  if (!weather?.location || !location) return false;
  return Math.abs(Number(weather.location.latitude) - Number(location.latitude)) < LOCATION_MATCH_DELTA
    && Math.abs(Number(weather.location.longitude) - Number(location.longitude)) < LOCATION_MATCH_DELTA;
}

export async function fetchWeatherForecast(location) {
  const params = new URLSearchParams({
    latitude: roundCoordinate(location.latitude),
    longitude: roundCoordinate(location.longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_gusts_10m",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "uv_index_max",
    ].join(","),
    timezone: "auto",
    forecast_days: "1",
  });

  const response = await fetch(`${OPEN_METEO_ENDPOINT}?${params}`);
  if (!response.ok) throw new Error(`Weather API failed: ${response.status}`);

  const data = await response.json();
  return normalizeWeather(data, location);
}

export function buildWeatherInsights(weather, weatherStatus, hasLocation) {
  if (weather && ["ready", "stale", "loading"].includes(weatherStatus)) {
    const summary = formatWeatherSummary(weather, weatherStatus);
    const carryItems = buildCarryItems(weather);
    const scheduleWarnings = buildWeatherWarnings(weather, weatherStatus);
    return { weatherSummary: summary, carryItems, scheduleWarnings };
  }

  if (weatherStatus === "loading") {
    return {
      weatherSummary: "현재 위치 기준 날씨를 확인하고 있어요.",
      carryItems: [],
      scheduleWarnings: [],
    };
  }

  if (weatherStatus === "failed") {
    return {
      weatherSummary: "날씨를 불러오지 못했어요. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      carryItems: [],
      scheduleWarnings: ["날씨 연결이 실패해 준비물 제안은 잠시 보류했어요."],
    };
  }

  return {
    weatherSummary: hasLocation
      ? "위치는 확인했어요. 날씨를 다시 받아오면 준비물을 제안할 수 있어요."
      : "현재 위치 권한이 필요해요.",
    carryItems: [],
    scheduleWarnings: hasLocation ? ["날씨 새로고침이 필요해요."] : ["현재 위치를 허용하면 날씨 준비물을 제안할 수 있어요."],
  };
}

function normalizeWeather(data, location) {
  const current = data.current || {};
  const daily = data.daily || {};
  const todayCode = pickFirst(daily.weather_code);
  const currentCode = toNumber(current.weather_code);

  return {
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
    timezone: data.timezone || null,
    location: {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: Number(location.accuracy) || null,
    },
    current: {
      time: current.time || null,
      temperature: toNumber(current.temperature_2m),
      apparentTemperature: toNumber(current.apparent_temperature),
      precipitation: toNumber(current.precipitation),
      rain: toNumber(current.rain),
      showers: toNumber(current.showers),
      snowfall: toNumber(current.snowfall),
      weatherCode: currentCode,
      weatherLabel: weatherLabel(currentCode),
      cloudCover: toNumber(current.cloud_cover),
      windSpeed: toNumber(current.wind_speed_10m),
      windGusts: toNumber(current.wind_gusts_10m),
    },
    daily: {
      date: pickFirst(daily.time),
      weatherCode: toNumber(todayCode),
      weatherLabel: weatherLabel(todayCode),
      temperatureMax: toNumber(pickFirst(daily.temperature_2m_max)),
      temperatureMin: toNumber(pickFirst(daily.temperature_2m_min)),
      precipitationSum: toNumber(pickFirst(daily.precipitation_sum)),
      precipitationProbabilityMax: toNumber(pickFirst(daily.precipitation_probability_max)),
      windSpeedMax: toNumber(pickFirst(daily.wind_speed_10m_max)),
      uvIndexMax: toNumber(pickFirst(daily.uv_index_max)),
    },
  };
}

function formatWeatherSummary(weather, weatherStatus) {
  const current = weather.current;
  const daily = weather.daily;
  const stalePrefix = weatherStatus === "stale" ? "최근 저장된 날씨 기준, " : "";
  const parts = [
    `${stalePrefix}현재 ${formatTemp(current.temperature)} ${current.weatherLabel}`,
    `체감 ${formatTemp(current.apparentTemperature)}`,
    `오늘 ${formatTemp(daily.temperatureMin)}~${formatTemp(daily.temperatureMax)}`,
  ];

  if (Number.isFinite(daily.precipitationProbabilityMax)) {
    parts.push(`강수확률 최대 ${Math.round(daily.precipitationProbabilityMax)}%`);
  }
  if (Number.isFinite(current.windSpeed)) {
    parts.push(`바람 ${Math.round(current.windSpeed)}km/h`);
  }

  return `${parts.join(", ")}.`;
}

function buildCarryItems(weather) {
  const items = [];
  const { current, daily } = weather;

  if (isWetWeather(current.weatherCode) || isWetWeather(daily.weatherCode) || daily.precipitationProbabilityMax >= 45 || daily.precipitationSum >= 1) {
    items.push("우산");
  }
  if (isSnowWeather(current.weatherCode) || isSnowWeather(daily.weatherCode)) {
    items.push("미끄럼 주의 신발");
  }
  if (
    (isFiniteNumber(daily.temperatureMin) && daily.temperatureMin <= 10)
    || (isFiniteNumber(current.apparentTemperature) && current.apparentTemperature <= 10)
    || temperatureGap(daily) >= 10
  ) {
    items.push("겉옷");
  }
  if (daily.windSpeedMax >= 30 || current.windSpeed >= 25 || current.windGusts >= 35) {
    items.push("바람막이");
  }
  if (daily.uvIndexMax >= 6) {
    items.push("자외선 차단");
  }
  if (isFiniteNumber(daily.temperatureMax) && daily.temperatureMax >= 28) {
    items.push("물병");
  }

  return items.length ? items : ["가벼운 복장"];
}

function buildWeatherWarnings(weather, weatherStatus) {
  const warnings = [];
  const { current, daily } = weather;

  if (weatherStatus === "stale") warnings.push("저장된 날씨라 최신 상태와 다를 수 있어요.");
  if (isWetWeather(current.weatherCode) || isWetWeather(daily.weatherCode) || daily.precipitationProbabilityMax >= 60) {
    warnings.push("비 예보가 있어 이동 일정은 여유를 두는 게 좋아요.");
  }
  if (isSnowWeather(current.weatherCode) || isSnowWeather(daily.weatherCode)) {
    warnings.push("눈 예보가 있어 이동 시간과 신발을 확인해 주세요.");
  }
  if (daily.windSpeedMax >= 35 || current.windGusts >= 40) {
    warnings.push("바람이 강할 수 있어 야외 일정은 한 번 더 확인해 주세요.");
  }
  if (temperatureGap(daily) >= 12) {
    warnings.push("일교차가 커서 겉옷을 챙기는 편이 좋아요.");
  }
  if (isFiniteNumber(daily.temperatureMax) && daily.temperatureMax >= 30) {
    warnings.push("더운 날이라 물을 챙기고 무리한 야외 일정을 줄여보세요.");
  }

  return warnings;
}

function isWetWeather(code) {
  return [
    51, 53, 55, 56, 57,
    61, 63, 65, 66, 67,
    80, 81, 82, 95, 96, 99,
  ].includes(Number(code));
}

function isSnowWeather(code) {
  return [71, 73, 75, 77, 85, 86].includes(Number(code));
}

function weatherLabel(code) {
  const numericCode = Number(code);
  if (!Number.isFinite(numericCode)) return "날씨 확인 중";
  return WEATHER_LABELS[numericCode] || "날씨 확인 중";
}

function formatTemp(value) {
  return Number.isFinite(value) ? `${Math.round(value)}도` : "기온 확인 중";
}

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundCoordinate(value) {
  return Number(value).toFixed(4);
}

function temperatureGap(daily) {
  if (!isFiniteNumber(daily.temperatureMax) || !isFiniteNumber(daily.temperatureMin)) return 0;
  return daily.temperatureMax - daily.temperatureMin;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}
