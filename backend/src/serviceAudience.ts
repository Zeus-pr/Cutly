/** Who a menu line is for. Stored on ShopService.audience; UNISEX = everyone. */
export const SERVICE_AUDIENCES = ['MEN', 'WOMEN', 'KIDS', 'UNISEX'] as const;
export type ServiceAudience = (typeof SERVICE_AUDIENCES)[number];

export function isServiceAudience(value: unknown): value is ServiceAudience {
  return typeof value === 'string' && (SERVICE_AUDIENCES as readonly string[]).includes(value);
}

/**
 * Name-based guess used when a partner does not pick an audience (setup / older clients).
 * Keep in sync with the SQL backfill in prisma/migrations/*_shop_service_audience.
 */
export function inferServiceAudience(name: string): ServiceAudience {
  if (/kids|baby|child/i.test(name)) return 'KIDS';
  if (/(^|[^a-z])men('?s)?([^a-z]|$)|beard|shave/i.test(name) && !/women/i.test(name)) return 'MEN';
  if (/bridal|lash|makeup|women/i.test(name)) return 'WOMEN';
  return 'UNISEX';
}

export function resolveServiceAudience(name: string, explicit?: unknown): ServiceAudience {
  return isServiceAudience(explicit) ? explicit : inferServiceAudience(name);
}
