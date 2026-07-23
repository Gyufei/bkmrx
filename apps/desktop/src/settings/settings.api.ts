import {
  invokeGetSystemInfo,
  invokeGetSettings,
  invokeUpdateSettings,
  invokeExportBookmarks,
  invokePreviewBookmarkImport,
  invokeApplyBookmarkImport,
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

export function exportBookmarksApi(path: string) {
  return invokeExportBookmarks(path);
}

export function previewBookmarkImportApi(path: string) {
  return invokePreviewBookmarkImport(path);
}

export function applyBookmarkImportApi({
  path,
  fileHash,
}: {
  path: string;
  fileHash: string;
}) {
  return invokeApplyBookmarkImport(path, fileHash);
}
