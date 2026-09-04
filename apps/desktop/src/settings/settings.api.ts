import {
  invokeGetSystemInfo,
  invokeGetSettings,
  invokeUpdateSettings,
  invokeListProviders,
  invokeActivateProvider,
  invokeDeactivateProvider,
  invokeExportBookmarks,
  invokePreviewBookmarkImport,
  invokeApplyBookmarkImport,
  AppSettings,
} from '../lib/invoke';

export const SettingsQueryApiKey = {
  SYSTEM_INFO: 'systemInfo',
  SETTINGS: 'settings',
  PROVIDERS: 'providers',
};

export async function getSystemInfoApi() {
  return await invokeGetSystemInfo();
}

export async function getSettingsApi() {
  return await invokeGetSettings();
}

export async function updateSettingsApi(settings: AppSettings) {
  return await invokeUpdateSettings(settings);
}

export async function listProvidersApi() {
  return await invokeListProviders();
}

export async function activateProviderApi(capability: 'translation' | 'ai', providerId: string) {
  return await invokeActivateProvider(capability, providerId);
}

export async function deactivateProviderApi(capability: 'translation' | 'ai') {
  return await invokeDeactivateProvider(capability);
}

export function exportBookmarksApi(path: string) {
  return invokeExportBookmarks(path);
}

export function previewBookmarkImportApi(path: string) {
  return invokePreviewBookmarkImport(path);
}

export function applyBookmarkImportApi({ path, fileHash }: { path: string; fileHash: string }) {
  return invokeApplyBookmarkImport(path, fileHash);
}
