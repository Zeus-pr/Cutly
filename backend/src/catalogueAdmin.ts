import { PrismaClient } from '@prisma/client';
import { CATEGORY_META, claimCategoryId } from './serviceCategoryMeta';
import { STANDARD_SKUS_BY_CATEGORY } from './standardCatalogueSkus';

const prisma = new PrismaClient();

export function normalizeServiceName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function nameKey(name: string) {
  return normalizeServiceName(name).toLowerCase();
}

/** Ensure category rows exist (idempotent). */
export async function ensureServiceCategories() {
  for (const cat of CATEGORY_META) {
    await prisma.serviceCategory.upsert({
      where: { id: cat.id },
      create: {
        id: cat.id,
        label: cat.label,
        gridLabel: cat.gridLabel ?? null,
        sortOrder: cat.sortOrder,
        active: true
      },
      update: {
        label: cat.label,
        gridLabel: cat.gridLabel ?? null,
        sortOrder: cat.sortOrder
      }
    });
  }
}

function slugCategoryId(label: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'category';
}

/** Ops: add a new global browse tile (beyond the seeded set). */
export async function adminCreateCategory(input: { label: string; gridLabel?: string; id?: string }) {
  await ensureServiceCategories();
  const label = input.label.trim().slice(0, 60);
  if (label.length < 2) throw new Error('Category name required (min 2 characters).');
  const gridLabel = input.gridLabel?.trim().slice(0, 24) || null;
  let id = (input.id || slugCategoryId(label)).trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,47}$/.test(id)) {
    throw new Error('Category id must be lowercase letters, numbers, hyphens.');
  }
  if (id === 'other') throw new Error('Reserved category id.');
  const exists = await prisma.serviceCategory.findUnique({ where: { id } });
  if (exists) {
    if (!exists.active) {
      const maxSort = await prisma.serviceCategory.aggregate({ _max: { sortOrder: true } });
      return prisma.serviceCategory.update({
        where: { id },
        data: {
          active: true,
          label,
          gridLabel,
          sortOrder: (maxSort._max.sortOrder || 0) + 1
        }
      });
    }
    throw new Error(`Category “${id}” already exists.`);
  }
  const maxSort = await prisma.serviceCategory.aggregate({ _max: { sortOrder: true } });
  return prisma.serviceCategory.create({
    data: {
      id,
      label,
      gridLabel,
      sortOrder: Math.min(98, (maxSort._max.sortOrder || 0) + 1),
      active: true
    }
  });
}

/**
 * Assign categoryId for every Service missing one (name-regex claim).
 * Safe to re-run; does not move already-assigned SKUs (Ops owns placement after).
 */
export async function autoMigrateServiceCategories() {
  await ensureServiceCategories();
  const rows = await prisma.service.findMany({
    where: { OR: [{ categoryId: null }, { categoryId: '' }] },
    select: { id: true, name: true }
  });
  let updated = 0;
  for (const row of rows) {
    const categoryId = claimCategoryId(row.name);
    await prisma.service.update({ where: { id: row.id }, data: { categoryId } });
    updated += 1;
  }
  return { updated, totalUnassigned: rows.length };
}

/**
 * Collapse duplicate Service rows that share the same name (case-insensitive).
 * Historical partner setup created one Service per shop — Ops catalogue must be unique.
 */
export async function dedupeCatalogueServices() {
  await ensureServiceCategories();
  const rows = await prisma.service.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      categoryId: true,
      durationMinutes: true,
      bufferMinutes: true,
      kind: true,
      _count: { select: { shops: true, bookings: true } }
    }
  });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = nameKey(row.name);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  let mergedGroups = 0;
  let retired = 0;

  for (const [, list] of groups) {
    if (list.length < 2) continue;
    mergedGroups += 1;
    list.sort((a, b) => {
      const score = (r: (typeof list)[number]) =>
        r._count.shops * 1000 +
        r._count.bookings * 10 +
        (r.categoryId && r.categoryId !== 'other' ? 5 : 0);
      return score(b) - score(a) || a.id.localeCompare(b.id);
    });
    const winner = list[0]!;
    const losers = list.slice(1);
    const canonicalName = normalizeServiceName(winner.name);

    for (const loser of losers) {
      const shopLinks = await prisma.shopService.findMany({ where: { serviceId: loser.id } });
      for (const link of shopLinks) {
        const already = await prisma.shopService.findUnique({
          where: { shopId_serviceId: { shopId: link.shopId, serviceId: winner.id } }
        });
        if (already) {
          await prisma.shopService.delete({
            where: { shopId_serviceId: { shopId: link.shopId, serviceId: loser.id } }
          });
        } else {
          await prisma.shopService.delete({
            where: { shopId_serviceId: { shopId: link.shopId, serviceId: loser.id } }
          });
          await prisma.shopService.create({
            data: {
              shopId: link.shopId,
              serviceId: winner.id,
              pricePaise: link.pricePaise,
              durationMinutes: link.durationMinutes,
              bufferMinutes: link.bufferMinutes,
              audience: link.audience
            }
          });
        }
      }

      const bookingLinks = await prisma.bookingService.findMany({ where: { serviceId: loser.id } });
      for (const link of bookingLinks) {
        const already = await prisma.bookingService.findUnique({
          where: { bookingId_serviceId: { bookingId: link.bookingId, serviceId: winner.id } }
        });
        if (already) {
          await prisma.bookingService.delete({
            where: { bookingId_serviceId: { bookingId: link.bookingId, serviceId: loser.id } }
          });
        } else {
          await prisma.bookingService.delete({
            where: { bookingId_serviceId: { bookingId: link.bookingId, serviceId: loser.id } }
          });
          await prisma.bookingService.create({
            data: {
              bookingId: link.bookingId,
              serviceId: winner.id,
              pricePaise: link.pricePaise,
              durationMinutes: link.durationMinutes
            }
          });
        }
      }

      const stillShops = await prisma.shopService.count({ where: { serviceId: loser.id } });
      const stillBooks = await prisma.bookingService.count({ where: { serviceId: loser.id } });
      if (stillShops === 0 && stillBooks === 0) {
        await prisma.service.delete({ where: { id: loser.id } });
      } else {
        await prisma.service.update({
          where: { id: loser.id },
          data: { active: false, categoryId: null }
        });
      }
      retired += 1;
    }

    await prisma.service.update({
      where: { id: winner.id },
      data: {
        name: canonicalName,
        active: true,
        categoryId: winner.categoryId || claimCategoryId(canonicalName)
      }
    });
  }

  return { mergedGroups, retired };
}

/** Find active catalogue SKU by name, or create one (never duplicate names). */
export async function findOrCreateCatalogueService(input: {
  name: string;
  durationMinutes: number;
  bufferMinutes?: number;
  kind?: string | null;
  categoryId?: string | null;
}) {
  await ensureServiceCategories();
  const name = normalizeServiceName(input.name).slice(0, 80);
  if (!name) throw new Error('Service name required.');
  const hit = await prisma.service.findFirst({
    where: { active: true, name: { equals: name, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      categoryId: true,
      durationMinutes: true,
      bufferMinutes: true
    }
  });
  if (hit) {
    if (input.categoryId && hit.categoryId !== input.categoryId) {
      await prisma.service.update({
        where: { id: hit.id },
        data: { categoryId: input.categoryId }
      });
      return { ...hit, categoryId: input.categoryId };
    }
    return hit;
  }
  const bufferMinutes =
    input.bufferMinutes != null
      ? Math.max(0, Math.min(120, Math.round(Number(input.bufferMinutes))))
      : /consultation/i.test(name)
        ? 0
        : 10;
  return prisma.service.create({
    data: {
      name,
      durationMinutes: input.durationMinutes,
      bufferMinutes,
      kind: (input.kind as never) || null,
      categoryId: input.categoryId || claimCategoryId(name),
      active: true
    }
  });
}

/** Idempotent: ensure each global tile has common standard SKUs Ops can pick. */
export async function seedStandardCatalogueSkus() {
  await ensureServiceCategories();
  let created = 0;
  for (const [categoryId, skus] of Object.entries(STANDARD_SKUS_BY_CATEGORY)) {
    const cat = await prisma.serviceCategory.findUnique({ where: { id: categoryId } });
    if (!cat) continue;
    for (const sku of skus) {
      const before = await prisma.service.findFirst({
        where: { active: true, name: { equals: sku.name, mode: 'insensitive' } },
        select: { id: true }
      });
      if (before) {
        const row = await prisma.service.findUnique({
          where: { id: before.id },
          select: { categoryId: true }
        });
        // Keep Ops placement if already set; only fill category when missing.
        if (!row?.categoryId) {
          await prisma.service.update({
            where: { id: before.id },
            data: { categoryId }
          });
        }
        continue;
      }
      await findOrCreateCatalogueService({
        name: sku.name,
        durationMinutes: sku.durationMinutes,
        bufferMinutes: sku.bufferMinutes,
        categoryId
      });
      created += 1;
    }
  }
  return { created };
}

export async function adminListCatalogue() {
  await ensureServiceCategories();
  await autoMigrateServiceCategories();
  await dedupeCatalogueServices();
  await seedStandardCatalogueSkus();
  const categories = await prisma.serviceCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      services: {
        where: { active: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          bufferMinutes: true,
          kind: true,
          _count: { select: { shops: true } }
        }
      }
    }
  });
  return categories.map((cat) => ({
    id: cat.id,
    label: cat.label,
    gridLabel: cat.gridLabel,
    sortOrder: cat.sortOrder,
    services: cat.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      bufferMinutes: s.bufferMinutes,
      kind: s.kind,
      shopCount: s._count.shops
    }))
  }));
}

export async function adminCreateCatalogueService(input: {
  categoryId: string;
  name: string;
  durationMinutes?: number;
  bufferMinutes?: number;
}) {
  await ensureServiceCategories();
  const categoryId = input.categoryId.trim();
  const cat = await prisma.serviceCategory.findUnique({ where: { id: categoryId } });
  if (!cat || !cat.active) throw new Error('Unknown category.');
  const name = normalizeServiceName(input.name).slice(0, 80);
  if (!name) throw new Error('Service name required.');
  const durationMinutes = Math.round(Number(input.durationMinutes ?? 30));
  if (!Number.isFinite(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
    throw new Error('Duration must be 10–480 minutes.');
  }
  const existing = await prisma.service.findFirst({
    where: { active: true, name: { equals: name, mode: 'insensitive' } }
  });
  if (existing) {
    const updated = await prisma.service.update({
      where: { id: existing.id },
      data: { categoryId, name }
    });
    return {
      id: updated.id,
      name: updated.name,
      categoryId: updated.categoryId,
      durationMinutes: updated.durationMinutes,
      bufferMinutes: updated.bufferMinutes,
      reused: true as const
    };
  }
  const created = await findOrCreateCatalogueService({
    name,
    durationMinutes,
    bufferMinutes: input.bufferMinutes,
    categoryId
  });
  return {
    id: created.id,
    name: created.name,
    categoryId: created.categoryId,
    durationMinutes: created.durationMinutes,
    bufferMinutes: created.bufferMinutes,
    reused: false as const
  };
}

/** Move a global SKU under another category (Ops placement). */
export async function adminMoveCatalogueService(serviceId: string, categoryId: string) {
  await ensureServiceCategories();
  const cat = await prisma.serviceCategory.findUnique({ where: { id: categoryId.trim() } });
  if (!cat || !cat.active) throw new Error('Unknown category.');
  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) throw new Error('Service not found.');
  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: { categoryId: cat.id }
  });
  return { id: updated.id, name: updated.name, categoryId: updated.categoryId };
}

/** Rename a global SKU (does not change category). */
export async function adminRenameCatalogueService(serviceId: string, name: string) {
  const trimmed = normalizeServiceName(name).slice(0, 80);
  if (!trimmed) throw new Error('Service name required.');
  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) throw new Error('Service not found.');
  const clash = await prisma.service.findFirst({
    where: {
      active: true,
      id: { not: serviceId },
      name: { equals: trimmed, mode: 'insensitive' }
    }
  });
  if (clash) throw new Error(`SKU “${trimmed}” already exists. Names must be unique.`);
  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: { name: trimmed }
  });
  return { id: updated.id, name: updated.name, categoryId: updated.categoryId };
}

/**
 * Remove SKU from catalogue: drop all shop menu links, then delete or deactivate.
 * Historic booking lines keep the service id (deactivate if bookings exist).
 */
export async function adminRemoveCatalogueService(serviceId: string) {
  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) throw new Error('Service not found.');
  const shopCount = await prisma.shopService.count({ where: { serviceId } });
  await prisma.shopService.deleteMany({ where: { serviceId } });
  const bookingCount = await prisma.bookingService.count({ where: { serviceId } });
  if (bookingCount === 0) {
    await prisma.service.delete({ where: { id: serviceId } });
    return {
      id: serviceId,
      deleted: true as const,
      deactivated: false as const,
      shopsUnlinked: shopCount
    };
  }
  await prisma.service.update({
    where: { id: serviceId },
    data: { active: false, categoryId: null }
  });
  return {
    id: serviceId,
    deleted: false as const,
    deactivated: true as const,
    shopsUnlinked: shopCount
  };
}

/** Default category for a newly created partner/shop SKU. */
export async function assignCategoryForNewService(serviceId: string, name: string) {
  await ensureServiceCategories();
  const categoryId = claimCategoryId(name);
  await prisma.service.update({ where: { id: serviceId }, data: { categoryId } });
  return categoryId;
}
