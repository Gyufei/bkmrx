import {
  invokeGetSystemInfo,
  invokeGetSettings,
  invokeUpdateSettings,
  AppSettings,
} from '../lib/invoke';

export const SettingsQueryApiKey = {
  SYSTEM_INFO: 'systemInfo',
  SETTINGS: 'settings',
}

export async function getSystemInfoApi() {
  return await invokeGetSystemInfo();
}

export async function getSettingsApi() {
  return await invokeGetSettings();
}

export async function updateSettingsApi(settings: AppSettings) {
  return await invokeUpdateSettings(settings)
}
