export interface DiaryContext {
  location: string;
  weather: string;
}

// Check if running in Tauri (desktop app) vs browser
function isTauri(): boolean {
  // Check for Tauri global object or the invoke function
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Check if running in iOS PWA (standalone mode)
function isIOSPWA(): boolean {
  return (
    ('standalone' in window.navigator) &&
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function getCurrentLocation(): Promise<{ lat: number; lon: number } | null> {
  console.log('[Diary] getCurrentLocation called, iOS PWA:', isIOSPWA(), 'Tauri:', isTauri());

  // Try Tauri geolocation plugin first (desktop app)
  if (isTauri()) {
    try {
      const { getCurrentPosition } = await import('@tauri-apps/plugin-geolocation');
      const position = await getCurrentPosition();
      console.log('[Diary] Tauri geolocation success:', position.coords);
      return {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
    } catch (e) {
      console.log('[Diary] Tauri geolocation error:', e);
    }
  }

  // Fall back to browser navigator.geolocation (PWA mode)
  if (!navigator.geolocation) {
    console.log('[Diary] navigator.geolocation not supported');
    return null;
  }

  // For iOS PWA, check and request permission explicitly
  if (isIOSPWA() && navigator.permissions) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      console.log('[Diary] iOS PWA geolocation permission state:', result.state);
      if (result.state === 'denied') {
        console.log('[Diary] iOS PWA geolocation denied - needs Safari permission');
        return null;
      }
    } catch (e) {
      console.log('[Diary] Permissions query failed:', e);
    }
  }

  console.log('[Diary] Using browser navigator.geolocation');

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[Diary] Browser geolocation success:', pos.coords);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        console.error('[Diary] Browser geolocation error:', err.code, err.message);
        resolve(null);
      },
      // iOS PWA needs longer timeout, high accuracy helps
      { timeout: 60000, enableHighAccuracy: true, maximumAge: 300000 }
    );
  });
}

// Get location based on IP (fallback when GPS is unavailable)
async function getLocationByIP(): Promise<{ lat: number; lon: number } | null> {
  // Try multiple IP geolocation services (they may have different CORS policies)
  const services = [
    'https://ip-api.com/json/',
    'https://freeipapi.com/api/json/',
  ];

  for (const url of services) {
    try {
      console.log('[Diary] Trying IP service:', url);
      const resp = await fetch(url, { timeout: 8000 });
      if (resp.ok) {
        const data = await resp.json();
        console.log('[Diary] IP-based location:', data);
        // ip-api.com uses lat/lon, freeipapi uses latitude/longitude
        const lat = data.lat ?? data.latitude;
        const lon = data.lon ?? data.longitude;
        if (lat && lon) {
          return { lat, lon };
        }
      }
    } catch (e) {
      console.log('[Diary] IP service error:', url, e);
    }
  }
  return null;
}

export async function getWeather(lat: number, lon: number): Promise<string | null> {
  // 使用 fetch with timeout
  const fetchWithTimeout = async (url: string, timeoutMs: number = 8000): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      return resp;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  try {
    console.log(`[Diary] Fetching weather for ${lat}, ${lon}`);
    // 使用 open-meteo API (免费、支持 CORS)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const resp = await fetchWithTimeout(url, 8000);
    if (resp.ok) {
      const data = await resp.json();
      console.log('[Diary] Weather data:', data);
      if (data.current_weather) {
        const weatherCode = data.current_weather.weathercode;
        const temp = Math.round(data.current_weather.temperature);
        const weather = weatherCodeToText(weatherCode);
        return `${weather} ${temp}°C`;
      }
    }
    console.log('[Diary] Weather fetch failed:', resp.status);
  } catch (e) {
    console.error('[Diary] Weather fetch error:', e);
  }

  // 备选：尝试 wttr.in
  try {
    console.log('[Diary] Trying wttr.in as fallback...');
    const wttrUrl = `https://wttr.in/${lat.toFixed(2)},${lon.toFixed(2)}?format=%C+%t&lang=zh`;
    const resp = await fetchWithTimeout(wttrUrl, 5000);
    if (resp.ok) {
      const text = await resp.text();
      if (!text.includes('<!DOCTYPE') && !text.includes('<html')) {
        console.log('[Diary] wttr.in fallback success:', text);
        return text.trim();
      }
    }
  } catch (e) {
    console.log('[Diary] wttr.in fallback also failed:', e);
  }

  return null;
}

// WMO 天气代码转中文描述
function weatherCodeToText(code: number): string {
  const weatherMap: Record<number, string> = {
    0: '晴',
    1: '晴间多云',
    2: '多云',
    3: '阴',
    45: '雾',
    48: '霜雾',
    51: '小毛毛雨',
    53: '中毛毛雨',
    55: '大毛毛雨',
    56: '冻毛毛雨',
    57: '强冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '小阵雨',
    81: '中阵雨',
    82: '大阵雨',
    85: '小阵雪',
    86: '大阵雪',
    95: '雷暴',
    96: '雷暴+小冰雹',
    99: '雷暴+大冰雹',
  };
  return weatherMap[code] ?? '未知';
}

// Get weather by IP-based location (fallback)
async function getWeatherByIP(): Promise<string | null> {
  const fetchWithTimeout = async (url: string, timeoutMs: number = 8000): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      return resp;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  try {
    // 先获取 IP 位置
    const ipResp = await fetchWithTimeout('https://ip-api.com/json/', 5000);
    if (!ipResp.ok) return null;
    const ipData = await ipResp.json();
    const { lat, lon } = ipData;
    if (!lat || !lon) return null;

    // 用 IP 位置获取天气
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const resp = await fetchWithTimeout(url, 8000);
    if (resp.ok) {
      const data = await resp.json();
      if (data.current_weather) {
        const weatherCode = data.current_weather.weathercode;
        const temp = Math.round(data.current_weather.temperature);
        const weather = weatherCodeToText(weatherCode);
        return `${weather} ${temp}°C`;
      }
    }
  } catch {}
  return null;
}

// 通过后端代理获取中文地址
async function getAddressFromCoords(lat: number, lon: number): Promise<string | null> {
  // 在 Tauri 桌面模式下，后端运行在 localhost:44380
  // 在 PWA 模式下，如果前端和后端同源则用相对路径，否则需要配置
  let baseUrl = '';
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    // Tauri 桌面模式
    baseUrl = 'http://127.0.0.1:44380';
  } else if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '44380') {
    // 独立服务器模式（atomic-server 直接运行）
    baseUrl = '';
  }
  // PWA 模式（前端和后端分开部署）需要后端配置 CORS 或使用代理

  const url = `${baseUrl}/api/geocode/reverse?lat=${lat}&lon=${lon}`;
  console.log('[Diary] Calling geocoding API:', url);
  console.log('[Diary] isTauri:', typeof window !== 'undefined' && '__TAURI__' in window);
  console.log('[Diary] window.location:', window.location.hostname, window.location.port);

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    console.log('[Diary] Geocoding response status:', resp.status);
    console.log('[Diary] Geocoding response headers:', resp.headers.get('content-type'));

    if (resp.ok) {
      const text = await resp.text();
      console.log('[Diary] Geocoding raw response:', text);

      // 检查返回的是否是 JSON 而不是 HTML 错误页
      if (text.startsWith('{')) {
        const data = JSON.parse(text);
        console.log('[Diary] Geocoding parsed data:', data);
        return data.address || null;
      }
      console.log('[Diary] Geocoding returned non-JSON:', text.substring(0, 100));
    } else {
      console.log('[Diary] Geocoding failed:', resp.status, resp.statusText);
      const errorText = await resp.text();
      console.log('[Diary] Geocoding error response:', errorText);
    }
  } catch (e) {
    console.error('[Diary] Geocoding error:', e);
  }
  return null;
}

export async function getDiaryContext(): Promise<DiaryContext | null> {
  console.log('[Diary] getDiaryContext called');

  let coords = await getCurrentLocation();
  let weather: string | null = null;

  // If GPS failed, try IP-based location
  if (!coords) {
    console.log('[Diary] GPS failed, trying IP-based location');
    coords = await getLocationByIP();
    if (coords) {
      weather = await getWeatherByIP();
    }
  } else {
    weather = await getWeather(coords.lat, coords.lon);
  }

  console.log('[Diary] Final coords:', coords, 'weather:', weather);

  // 即使没有天气，只要有坐标就返回
  if (!coords) {
    console.log('[Diary] Returning null - no location');
    return null;
  }

  // 尝试获取中文地址，失败则降级到坐标显示
  const address = await getAddressFromCoords(coords.lat, coords.lon);
  const location = address || `${coords.lat.toFixed(4)}°N, ${coords.lon.toFixed(4)}°E`;

  return {
    location,
    weather: weather ?? '天气信息获取失败',
  };
}