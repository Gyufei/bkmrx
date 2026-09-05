export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error) {
    if ('code' in error && error.code === 'settings_revision_conflict') {
      return '设置已在其他位置更新，请重新加载后再保存；当前输入仍会保留。';
    }
    if ('message' in error) return String(error.message);
  }
  return '操作失败';
}
