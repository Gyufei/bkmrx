import {
  invokeGetSystemInfo,
  invokeGetSettings,
  invokeUpdateSettings,
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
  return invokeExportBookmarks(path);
}

export function previewBookmarkImportApi(path: string) {
  return invokePreviewBookmarkImport(path);
}

export function applyBookmarkImportApi({ path, fileHash }: { path: string; fileHash: string }) {
  return invokeApplyBookmarkImport(path, fileHash);
}
