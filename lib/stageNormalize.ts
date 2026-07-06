/**
 * Resolves a raw CRM stage value to an internal status name.
 * Priority order:
 *  1. Workspace custom_stage_map (per-tenant override, exact match)
 *  2. Static CRM map (bundled defaults per CRM type)
 *  3. Text normalization fallback (spaces → underscores, lowercase)
 */
export function normalizeStage(
  raw: any,
  staticMap: Record<string, string>,
  customMap: Record<string, string> = {}
): string {
  const rawStr = String(raw ?? '').trim();
  const key = rawStr.toLowerCase();

  if (customMap[rawStr]) return customMap[rawStr];
  if (customMap[key]) return customMap[key];
  if (staticMap[key]) return staticMap[key];

  return key.replace(/[\s\-]+/g, '_') || 'new';
}
