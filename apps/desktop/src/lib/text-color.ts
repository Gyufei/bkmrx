export function colorStyleForText(text: string): { color: string; backgroundColor: string } {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = text.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return {
    color: `hsl(${hue}, 60%, 40%)`,
    backgroundColor: `hsla(${hue}, 60%, 40%, 0.12)`,
  };
}
