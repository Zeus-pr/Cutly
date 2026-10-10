import type { PrismaClient } from '@prisma/client';
import { assertPaidPricePaise } from './price';

export type PackageLine = {
  serviceId: string;
  name: string;
  durationMinutes: number;
  pricePaise: number;
  bufferMinutes: number;
};

export type ServicePackage = {
  lines: PackageLine[];
  durationMinutes: number;
  /** Single turnover buffer after the whole package (max of line buffers). */
  bufferMinutes: number;
  totalPaise: number;
  label: string;
  serviceIdsKey: string;
};

/** Normalize `serviceIds` or legacy single `serviceId`. */
export function normalizeServiceIds(input: { serviceId?: string; serviceIds?: string[] }): string[] {
  const fromList = (input.serviceIds || []).map((id) => id.trim()).filter(Boolean);
  if (fromList.length) {
    // Preserve selection order, drop dupes.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of fromList) {
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
    return ordered;
  }
  const one = input.serviceId?.trim();
  if (one) return [one];
  return [];
}

export async function resolveServicePackage(
  prisma: PrismaClient,
  shopId: string,
  serviceIds: string[]
): Promise<ServicePackage> {
  if (!serviceIds.length) throw new Error('Pick at least one service.');
  const links = await prisma.shopService.findMany({
    where: { shopId, serviceId: { in: serviceIds } },
    include: { service: true, shop: true }
  });
  if (links.length !== serviceIds.length) throw new Error('Shop or service not available.');
  if (!links[0]?.shop.setupDone) throw new Error('Shop or service not available.');

  const byId = new Map(links.map((row) => [row.serviceId, row]));
  const lines: PackageLine[] = serviceIds.map((id) => {
    const link = byId.get(id)!;
    assertPaidPricePaise(link.pricePaise);
    const durationMinutes = link.durationMinutes || link.service.durationMinutes;
    const bufferMinutes = link.bufferMinutes ?? link.service.bufferMinutes ?? 0;
    return {
      serviceId: link.serviceId,
      name: link.service.name,
      durationMinutes,
      pricePaise: link.pricePaise,
      bufferMinutes
    };
  });

  const durationMinutes = lines.reduce((sum, line) => sum + line.durationMinutes, 0);
  const bufferMinutes = Math.max(0, ...lines.map((line) => line.bufferMinutes));
  const totalPaise = lines.reduce((sum, line) => sum + line.pricePaise, 0);
  const sortedKey = [...serviceIds].sort().join('+');

  return {
    lines,
    durationMinutes,
    bufferMinutes,
    totalPaise,
    label: lines.map((line) => line.name).join(' · '),
    serviceIdsKey: sortedKey
  };
}
