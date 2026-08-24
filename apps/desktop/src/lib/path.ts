export function formatPathForDisplay(path: string) {
  const separator = path.includes('\\') ? '\\' : '/';
  const segments = path.split(/[\\/]/).filter(Boolean);
  if (segments.length <= 6) return path;

  const prefix = path.startsWith(separator) ? separator : '';
  return `${prefix}${segments.slice(0, 3).join(separator)}${separator}…${separator}${segments.slice(-3).join(separator)}`;
}

export function sanitizeFilenameSegment(value: string) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[. ]+$/g, '')
    .trim();
  return sanitized || '未命名';
}

export function joinDirectoryAndFilename(directory: string | null | undefined, filename: string) {
  const trimmed = directory?.trim();
  if (!trimmed) return filename;
  if (/[\\/]$/.test(trimmed)) return `${trimmed}${filename}`;
  const separator = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/';
  return `${trimmed}${separator}${filename}`;
}
