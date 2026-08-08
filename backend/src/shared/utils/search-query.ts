export function searchPattern(value: string): RegExp {
  const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}
