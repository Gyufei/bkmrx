export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return '操作失败';
}

export function formatPathForDisplay(path: string) {
  const separator = path.includes('\\') ? '\\' : '/';
  const segments = path.split(/[\\/]/).filter(Boolean);
  if (segments.length <= 6) return path;

  const prefix = path.startsWith(separator) ? separator : '';
  return `${prefix}${segments.slice(0, 3).join(separator)}${separator}…${separator}${segments.slice(-3).join(separator)}`;
}
