import {
  invokeGetSystemInfo,
  invokeGetSettings,
  invokeUpdateSettings,
  invokeActivateProvider,
  invokeDeactivateProvider,
  invokeExportBookmarkDataset,
  invokeGetBookmarkInitializationStatus,
  invokeInitializeBookmarks,
  AppSettings,
} from '../lib/invoke';

export const SettingsQueryApiKey = {
  SYSTEM_INFO: 'systemInfo',
  SETTINGS: 'settings',
};

export async function getSystemInfoApi() {
  return await invokeGetSystemInfo();
}

export async function getSettingsApi() {
  return await invokeGetSettings();
}

export async function updateSettingsApi(expectedRevision: number, settings: AppSettings) {
  return await invokeUpdateSettings(expectedRevision, settings);
}

export async function activateProviderApi(
  expectedRevision: number,
  capability: 'translation' | 'ai',
  providerId: string,
) {
  return await invokeActivateProvider(expectedRevision, capability, providerId);
}

export async function deactivateProviderApi(
  expectedRevision: number,
  capability: 'translation' | 'ai',
) {
  return await invokeDeactivateProvider(expectedRevision, capability);
}

export function exportBookmarksApi(path: string) {
  return invokeExportBookmarkDataset(path);
}

export function bookmarkInitializationStatusApi() {
  return invokeGetBookmarkInitializationStatus();
}

export function initializeBookmarksApi(path: string) {
  return invokeInitializeBookmarks(path);
}
