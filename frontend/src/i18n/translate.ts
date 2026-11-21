export function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  let result = template;
  for (const [name, value] of Object.entries(vars)) {
    result = result.split(`{${name}}`).join(String(value));
  }
  return result;
}
