// Stub for web builds — these should never be called directly
// (HttpTransport handles all communication)
export function invoke(): never {
  throw new Error('@tauri-apps/api/core is not available in web mode');
}

export function checkPermissions(): Promise<Record<string, string>> {
  return Promise.resolve({})
}

// Channel stub — used by @tauri-apps/plugin-geolocation and other plugins
export class Channel {
  constructor(_topic: string, _value?: unknown) {}
}
