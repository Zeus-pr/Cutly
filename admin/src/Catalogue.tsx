import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, partnerFetch, type PartnerShop } from './api';

type Audience = 'MEN' | 'WOMEN' | 'KIDS' | 'UNISEX';

type CatalogueService = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  kind: string | null;
  shopCount: number;
};

type CatalogueCategory = {
  id: string;
  label: string;
  gridLabel: string | null;
  sortOrder: number;
  services: CatalogueService[];
};

type ShopLine = {
  id: string;
  name: string;
  durationMinutes: string;
  bufferMinutes: string;
  priceRupees: string;
  audience: Audience;
  onShop: boolean;
};

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: 'UNISEX', label: 'Unisex' },
  { id: 'MEN', label: 'Men' },
  { id: 'WOMEN', label: 'Women' },
  { id: 'KIDS', label: 'Kids' }
];

function inferAudience(name: string): Audience {
  if (/kids|baby|child/i.test(name)) return 'KIDS';
  if (/(^|[^a-z])men('?s)?([^a-z]|$)|beard|shave/i.test(name) && !/women/i.test(name)) return 'MEN';
  if (/bridal|lash|makeup|women/i.test(name)) return 'WOMEN';
  return 'UNISEX';
}

function paiseToRupees(p: number) {
  return (p / 100).toFixed(0);
}

function rupeesToPaise(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

const MAX_SHOP_SERVICES = 120;

type MenuPayloadRow = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  pricePaise: number;
  audience: Audience;
};

/** Build PUT /partner/services body from on-shop lines; throws a clear per-row error. */
function menuPayloadFromLines(
  lines: ShopLine[],
  opts?: { excludeId?: string; allowEmpty?: boolean }
): MenuPayloadRow[] {
  const onShop = lines.filter((l) => l.onShop && l.name.trim() && l.id !== opts?.excludeId);
  if (!onShop.length) {
    if (opts?.allowEmpty) return [];
    throw new Error('Keep at least one service on the shop menu.');
  }
  if (onShop.length > MAX_SHOP_SERVICES) {
    throw new Error(`Max ${MAX_SHOP_SERVICES} on this shop (${onShop.length} selected). Turn some off, then save.`);
  }
  return onShop.map((l) => {
    const name = l.name.trim();
    const durationMinutes = Math.round(Number(l.durationMinutes));
    const bufferRaw = l.bufferMinutes.trim() === '' ? 10 : Number(l.bufferMinutes);
    const bufferMinutes = Math.round(bufferRaw);
    const pricePaise = rupeesToPaise(l.priceRupees);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
      throw new Error(`${name}: time must be 10–480 minutes.`);
    }
    if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120) {
      throw new Error(`${name}: buffer must be 0–120 minutes.`);
    }
    if (!Number.isFinite(pricePaise) || pricePaise < 1) {
      throw new Error(`${name}: enter a price in ₹.`);
    }
    return { id: l.id, name, durationMinutes, bufferMinutes, pricePaise, audience: l.audience };
  });
}

type Props = {
  shop: PartnerShop;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onFlash: (kind: 'ok' | 'err', text: string) => void;
  onSaved: () => Promise<void>;
};

/** Partner Menu tab = global category → SKU tree + which lines are on this shop. */
export function PartnerMenuCatalogue({ shop, busy, setBusy, onFlash, onSaved }: Props) {
  const [categories, setCategories] = useState<CatalogueCategory[]>([]);
  const [selectedId, setSelectedId] = useState('hair-essentials');
  const [lines, setLines] = useState<Record<string, ShopLine>>({});
  const [newName, setNewName] = useState('');
  const [newMins, setNewMins] = useState('30');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatGrid, setNewCatGrid] = useState('');
  const [loading, setLoading] = useState(true);

  const hydrateLines = useCallback((cats: CatalogueCategory[], partnerShop: PartnerShop) => {
    const onShop = new Map(partnerShop.services.map((s) => [s.id || '', s]));
    const next: Record<string, ShopLine> = {};
    for (const cat of cats) {
      for (const s of cat.services) {
        const linked = onShop.get(s.id);
        next[s.id] = linked
          ? {
              id: s.id,
              name: linked.name,
              durationMinutes: String(linked.durationMinutes),
              bufferMinutes: String(linked.bufferMinutes ?? 10),
              priceRupees: paiseToRupees(linked.pricePaise),
              audience: linked.audience || inferAudience(linked.name),
              onShop: true
            }
          : {
              id: s.id,
              name: s.name,
              durationMinutes: String(s.durationMinutes),
              bufferMinutes: String(s.bufferMinutes ?? 10),
              priceRupees: '300',
              audience: inferAudience(s.name),
              onShop: false
            };
      }
    }
    // Shop-only lines not in catalogue yet (edge) — keep under selected or other
    for (const s of partnerShop.services) {
      if (!s.id || next[s.id]) continue;
      next[s.id] = {
        id: s.id,
        name: s.name,
        durationMinutes: String(s.durationMinutes),
        bufferMinutes: String(s.bufferMinutes ?? 10),
        priceRupees: paiseToRupees(s.pricePaise),
        audience: s.audience || inferAudience(s.name),
        onShop: true
      };
    }
    setLines(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch<CatalogueCategory[]>('/admin/catalogue');
      setCategories(data);
      setSelectedId((prev) => (data.some((c) => c.id === prev) ? prev : data[0]?.id || prev));
      hydrateLines(data, shop);
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Catalogue failed');
    } finally {
      setLoading(false);
    }
  }, [hydrateLines, onFlash, shop]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => categories.find((c) => c.id === selectedId) || null,
    [categories, selectedId]
  );

  const selectedSkus = useMemo(() => {
    if (!selected) return [] as CatalogueService[];
    const known = selected.services;
    // Include orphan shop lines assigned to this category id
    const orphanIds = shop.services
      .filter((s) => s.categoryId === selected.id && s.id && !known.some((k) => k.id === s.id))
      .map((s) => ({
        id: s.id!,
        name: s.name,
        durationMinutes: s.durationMinutes,
        bufferMinutes: s.bufferMinutes,
        kind: null,
        shopCount: 1
      }));
    return [...known, ...orphanIds];
  }, [selected, shop.services]);

  const onShopCount = useMemo(
    () => Object.values(lines).filter((l) => l.onShop).length,
    [lines]
  );

  function patchLine(id: string, patch: Partial<ShopLine>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveShopMenu() {
    setBusy(true);
    try {
      const services = menuPayloadFromLines(Object.values(lines));
      await partnerFetch('/partner/services', {
        method: 'PUT',
        body: JSON.stringify({ services })
      });
      onFlash('ok', `Menu saved · ${services.length} on this shop.`);
      await onSaved();
      await load();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Menu save failed');
    } finally {
      setBusy(false);
    }
  }

  async function addSku() {
    if (!selected || !newName.trim()) return;
    setBusy(true);
    try {
      const created = await adminFetch<{
        id: string;
        name: string;
        durationMinutes: number;
        bufferMinutes: number;
      }>('/admin/catalogue/services', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: selected.id,
          name: newName.trim(),
          durationMinutes: Number(newMins) || 30
        })
      });
      // Must land on this shop or customer tiles/sidebar stay empty for the new line.
      const services = [
        ...menuPayloadFromLines(Object.values(lines), { allowEmpty: true }),
        {
          id: created.id,
          name: created.name,
          durationMinutes: created.durationMinutes,
          bufferMinutes: created.bufferMinutes ?? 10,
          pricePaise: 30000,
          audience: inferAudience(created.name)
        }
      ];
      if (services.length > MAX_SHOP_SERVICES) {
        throw new Error(`Max ${MAX_SHOP_SERVICES} on this shop. Turn some off before adding more.`);
      }
      await partnerFetch('/partner/services', {
        method: 'PUT',
        body: JSON.stringify({ services })
      });
      setNewName('');
      onFlash('ok', `Added “${created.name}” under ${selected.label} and enabled on this shop.`);
      await onSaved();
      await load();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Could not add SKU');
    } finally {
      setBusy(false);
    }
  }

  async function moveSku(serviceId: string, categoryId: string) {
    setBusy(true);
    try {
      await adminFetch(`/admin/catalogue/services/${serviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoryId })
      });
      onFlash('ok', 'Moved SKU.');
      await load();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  }

  /** Drop from this shop’s menu only — other shops keep the same-named SKU. */
  async function removeFromThisShop(service: CatalogueService) {
    const line = lines[service.id];
    if (!line?.onShop) {
      onFlash('err', `“${service.name}” is not on this shop.`);
      return;
    }
    if (!confirm(`Remove “${service.name}” from ${shop.name} only?\nOther shops keep it.`)) return;
    setBusy(true);
    try {
      const services = menuPayloadFromLines(Object.values(lines), { excludeId: service.id });
      await partnerFetch('/partner/services', {
        method: 'PUT',
        body: JSON.stringify({ services })
      });
      onFlash('ok', `Removed “${service.name}” from ${shop.name}.`);
      await onSaved();
      await load();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Could not remove from shop');
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!newCatLabel.trim()) return;
    setBusy(true);
    try {
      const created = await adminFetch<{ id: string; label: string }>('/admin/catalogue/categories', {
        method: 'POST',
        body: JSON.stringify({
          label: newCatLabel.trim(),
          gridLabel: newCatGrid.trim() || undefined
        })
      });
      setNewCatLabel('');
      setNewCatGrid('');
      setSelectedId(created.id);
      onFlash('ok', `Added global category “${created.label}”. Add SKUs under it.`);
      await load();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Could not add category');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !categories.length) {
    return (
      <div className="card">
        <p className="hint">Loading catalogue…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Menu · catalogue</h2>
      <p className="hint">
        Each tile ships with <strong>standard SKUs</strong>. Turn <strong>On shop</strong> + set this shop’s ₹, or{' '}
        <strong>Add to catalogue</strong> for a shop-specific name. Use <strong>Add category</strong> for a new global
        tile type. <strong>Remove from shop</strong> = only <strong>{shop.name}</strong>.
      </p>
      <p className="hint mono">
        {onShopCount} on shop · {Object.keys(lines).length} catalogue SKUs
      </p>

      <div className="catalogue-layout">
        <div className="catalogue-nav">
          <div className="catalogue-cat-list">
            {categories.map((cat) => {
              const count = cat.services.filter((s) => lines[s.id]?.onShop).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`catalogue-cat ${cat.id === selectedId ? 'on' : ''}`}
                  onClick={() => setSelectedId(cat.id)}
                >
                  <span>{cat.gridLabel || cat.label}</span>
                  <span className="mono">{count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 14, displayTop: '1px solid var(--line)', paddingTop: 12 }}>
            <p className="hint" style={{ marginBottom: 8 }}>
              Add global category
            </p>
            <input
              placeholder="Name (e.g. Beard bar)"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              style={{ width: '100%', marginBottom: 6 }}
            />
            <input
              placeholder="Short grid label (optional)"
              value={newCatGrid}
              onChange={(e) => setNewCatGrid(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <button
              type="button"
              className="btn accent"
              style={{ width: '100%' }}
              disabled={busy || newCatLabel.trim().length < 2}
              onClick={() => void addCategory()}
            >
              Add category
            </button>
          </div>
        </div>

        <div>
          {selected ? (
            <>
              <h3 style={{ margin: '0 0 8px' }}>{selected.label}</h3>
              <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input
                  placeholder="New SKU name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <input
                  value={newMins}
                  onChange={(e) => setNewMins(e.target.value)}
                  style={{ width: 72 }}
                  title="Minutes"
                  aria-label="Minutes"
                />
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy || !newName.trim()}
                  onClick={() => void addSku()}
                >
                  Add to catalogue
                </button>
              </div>

              {!selectedSkus.length ? (
                <p className="hint">No SKUs in this tile yet. Add one above.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>On shop</th>
                      <th>Name</th>
                      <th>Min</th>
                      <th>₹</th>
                      <th>For</th>
                      <th>Move</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSkus.map((s) => {
                      const line = lines[s.id];
                      if (!line) return null;
                      return (
                        <tr key={s.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={line.onShop}
                              onChange={(e) => patchLine(s.id, { onShop: e.target.checked })}
                              aria-label={`On shop ${line.name}`}
                            />
                          </td>
                          <td>
                            <input
                              value={line.name}
                              onChange={(e) => patchLine(s.id, { name: e.target.value })}
                              style={{ width: '100%', minWidth: 120 }}
                            />
                          </td>
                          <td>
                            <input
                              value={line.durationMinutes}
                              onChange={(e) => patchLine(s.id, { durationMinutes: e.target.value })}
                              style={{ width: 56 }}
                              disabled={!line.onShop}
                            />
                          </td>
                          <td>
                            <input
                              value={line.priceRupees}
                              onChange={(e) => patchLine(s.id, { priceRupees: e.target.value })}
                              style={{ width: 72 }}
                              disabled={!line.onShop}
                            />
                          </td>
                          <td>
                            <select
                              value={line.audience}
                              disabled={!line.onShop}
                              onChange={(e) =>
                                patchLine(s.id, { audience: e.target.value as Audience })
                              }
                            >
                              {AUDIENCES.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              defaultValue=""
                              key={`mv-${s.id}-${selectedId}`}
                              disabled={busy}
                              onChange={(e) => {
                                const next = e.target.value;
                                e.target.value = '';
                                if (next) void moveSku(s.id, next);
                              }}
                            >
                              <option value="">Tile…</option>
                              {categories
                                .filter((c) => c.id !== selectedId)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.gridLabel || c.label}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={busy || !line.onShop}
                              onClick={() => void removeFromThisShop(s)}
                              title="Only this shop"
                              style={{ color: 'var(--danger)' }}
                            >
                              Remove from shop
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
        <button type="button" className="btn teal" disabled={busy} onClick={() => void saveShopMenu()}>
          {busy ? 'Saving…' : 'Save shop menu'}
        </button>
      </div>
    </div>
  );
}
