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
  try {
    console.log(`[Diary] Fetching weather for ${lat}, ${lon}`);
    const resp = await fetch(`https://wttr.in/${lat},${lon}?format=%C+%t&lang=zh`, {
      mode: 'cors'
    });
    if (resp.ok) {
      const text = await resp.text();
      console.log('[Diary] Weather response:', text);
      return text.trim();
    }
    console.log('[Diary] Weather fetch failed:', resp.status);
  } catch (e) {
    console.error('[Diary] Weather fetch error:', e);
  }
  return null;
}

// Get weather by IP-based location (fallback)
async function getWeatherByIP(): Promise<string | null> {
  try {
    const resp = await fetch('https://wttr.in/?format=%C+%t&lang=zh', { mode: 'cors' });
    if (resp.ok) {
      return (await resp.text()).trim();
    }
  } catch {}
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

  if (!coords || !weather) {
    console.log('[Diary] Returning null - missing location or weather');
    return null;
  }

  return {
    location: `${coords.lat.toFixed(2)}°N, ${coords.lon.toFixed(2)}°E`,
    weather,
  };
}