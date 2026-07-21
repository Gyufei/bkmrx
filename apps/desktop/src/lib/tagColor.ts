export function tagColor(tag: string): { color: string; backgroundColor: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return {
    color: `hsl(${hue}, 60%, 40%)`,
    backgroundColor: `hsla(${hue}, 60%, 40%, 0.12)`,
  };
}
