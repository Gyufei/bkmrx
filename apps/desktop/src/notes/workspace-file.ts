export function workspaceFileDisplayName(name: string) {
  const extensionIndex = name.lastIndexOf('.');
  return extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
}
