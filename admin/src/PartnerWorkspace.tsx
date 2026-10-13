import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  amenities as AMENITY_OPTIONS,
  catalogue,
  shopKinds,
  type CatalogueService,
  type ShopKindId
} from '@catalogue';
import { PartnerMenuCatalogue } from './Catalogue';
import { adminFetch, partnerFetch, type HourDay, type PartnerShop } from './api';
import { PhotoCrop, type CropKind } from './PhotoCrop';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Tab = 'shop' | 'hours' | 'menu' | 'staff' | 'photos' | 'amenities' | 'credentials';

type Props = {
  partnerId: string;
  partnerEmail: string | null;
  partnerName: string | null;
  onBack: () => void;
  onFlash: (kind: 'ok' | 'err', text: string) => void;
};

export function PartnerWorkspace({ partnerId, partnerEmail, partnerName, onBack, onFlash }: Props) {
  const [tab, setTab] = useState<Tab>('shop');
  const [shop, setShop] = useState<PartnerShop | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await partnerFetch<PartnerShop | null>('/partner/shop');
      setShop(data);
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Failed to load shop');
    } finally {
      setLoading(false);
    }
  }, [onFlash]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="main">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← Partners
        </button>
        <p className="lede">Loading shop…</p>
      </div>
    );
  }

  return (
    <div className="main">
      <button type="button" className="btn ghost" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Partners
      </button>
      <h1>{shop?.name || partnerName || partnerEmail || 'Partner'}</h1>
      <p className="lede mono">
        {partnerEmail} · {partnerId}
        {shop ? ` · setupDone=${shop.setupDone ? 'yes' : 'no'}` : ' · no shop yet'}
      </p>

      <div className="tabs">
        {(
          [
            ['shop', 'Shop'],
            ['hours', 'Hours'],
            ['menu', 'Menu'],
            ['staff', 'Staff'],
            ['photos', 'Photos'],
            ['amenities', 'Amenities'],
            ['credentials', 'Password']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
            disabled={!shop && id !== 'shop' && id !== 'credentials'}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'shop' ? (
        <ShopForm
          shop={shop}
          busy={busy}
          setBusy={setBusy}
          onFlash={onFlash}
          onSaved={reload}
        />
      ) : null}
      {tab === 'hours' && shop ? (
        <HoursForm busy={busy} setBusy={setBusy} onFlash={onFlash} />
      ) : null}
      {tab === 'menu' && shop ? (
        <PartnerMenuCatalogue
          shop={shop}
          busy={busy}
          setBusy={setBusy}
          onFlash={onFlash}
          onSaved={reload}
        />
      ) : null}
      {tab === 'staff' && shop ? (
        <StaffForm shop={shop} busy={busy} setBusy={setBusy} onFlash={onFlash} onSaved={reload} />
      ) : null}
      {tab === 'photos' && shop ? (
        <PhotosForm shop={shop} busy={busy} setBusy={setBusy} onFlash={onFlash} onSaved={reload} />
      ) : null}
      {tab === 'amenities' && shop ? (
        <AmenitiesForm shop={shop} busy={busy} setBusy={setBusy} onFlash={onFlash} onSaved={reload} />
      ) : null}
      {tab === 'credentials' ? (
        <PasswordForm partnerId={partnerId} busy={busy} setBusy={setBusy} onFlash={onFlash} />
      ) : null}
    </div>
  );
}

function ShopForm({
  shop,
  busy,
  setBusy,
  onFlash,
  onSaved
}: {
  shop: PartnerShop | null;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onFlash: Props['onFlash'];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(shop?.name || '');
  const [address, setAddress] = useState(shop?.address || '');
  const [city, setCity] = useState(shop?.city || 'Bardhaman');
  const [lat, setLat] = useState(shop ? String(shop.latitude) : '23.2324');
  const [lng, setLng] = useState(shop ? String(shop.longitude) : '87.8615');
  const [phone, setPhone] = useState(shop?.phone?.replace(/^\+91/, '') || '');
  const [kinds, setKinds] = useState<ShopKindId[]>(
    (shop?.kinds?.length ? shop.kinds : shop?.kind ? [shop.kind] : ['SALON']) as ShopKindId[]
  );
  const [chairs, setChairs] = useState(String(shop?.chairCount || 2));
  const [workers, setWorkers] = useState(String(shop?.today?.workersPresent || shop?.chairCount || 2));
  const [brands, setBrands] = useState((shop?.productBrands || []).join(', '));

  useEffect(() => {
    if (!shop) return;
    setName(shop.name);
    setAddress(shop.address);
    setCity(shop.city);
    setLat(String(shop.latitude));
    setLng(String(shop.longitude));
    setPhone(shop.phone?.replace(/^\+91/, '') || '');
    setKinds((shop.kinds?.length ? shop.kinds : shop.kind ? [shop.kind] : ['SALON']) as ShopKindId[]);
    setChairs(String(shop.chairCount));
    setWorkers(String(shop.today?.workersPresent || shop.chairCount));
    setBrands((shop.productBrands || []).join(', '));
  }, [shop]);

  const seedServices = useMemo(() => {
    const list: CatalogueService[] = [];
    for (const k of kinds) {
      for (const s of catalogue[k] || []) {
        if (!list.some((x) => x.name === s.name)) list.push(s);
      }
    }
    return list.slice(0, 8);
  }, [kinds]);

  function toggleKind(id: ShopKindId) {
    setKinds((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  async function save() {
    setBusy(true);
    try {
      const chairCount = Math.max(1, Math.min(40, Number(chairs) || 1));
      const workersPresent = Math.max(1, Math.min(chairCount, Number(workers) || 1));
      const productBrands = brands
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 24);

      if (shop?.setupDone) {
        // Non-destructive profile update (keeps menu IDs).
        await partnerFetch('/partner/shop', {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            address: address.trim(),
            city: city.trim(),
            latitude: Number(lat),
            longitude: Number(lng),
            kinds,
            productBrands,
            chairCount
          })
        });
      } else {
        const services = seedServices.map((s) => ({
          name: s.name,
          durationMinutes: s.durationMinutes,
          pricePaise: s.pricePaise
        }));
        if (!services.length) throw new Error('Pick at least one shop type so we can seed a menu.');
        await partnerFetch('/partner/shop', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            address: address.trim(),
            city: city.trim(),
            latitude: Number(lat),
            longitude: Number(lng),
            kinds,
            productBrands,
            services,
            chairCount,
            workersPresent
          })
        });
      }

      const digits = phone.replace(/\D/g, '');
      const e164 = digits.length === 10 ? `+91${digits}` : digits ? `+${digits}` : '';
      await partnerFetch('/partner/shop/phone', {
        method: 'PATCH',
        body: JSON.stringify({ phone: e164 || null })
      });

      onFlash(
        'ok',
        shop?.setupDone
          ? 'Shop profile saved (menu untouched).'
          : 'Shop created (setupDone=true). Refine Menu / Hours / Photos next.'
      );
      await onSaved();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{shop ? 'Shop profile' : 'Create shop (full setup)'}</h2>
      <p className="hint">
        Uses existing <code>POST /partner/shop</code> (same as partner setup). Sets <strong>setupDone</strong> so the
        partner app skips the wizard. Lat/lng default to Bardhaman — change for real pin.
      </p>
      <div className="row">
        <div className="field">
          <label>Shop name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Address</label>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Latitude</label>
          <input value={lat} onChange={(e) => setLat(e.target.value)} className="mono" />
        </div>
        <div className="field">
          <label>Longitude</label>
          <input value={lng} onChange={(e) => setLng(e.target.value)} className="mono" />
        </div>
        <div className="field">
          <label>Public phone (10 digit)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98…" />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>SHOP TYPES</label>
        <div className="chips" style={{ marginTop: 8 }}>
          {shopKinds.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`chip ${kinds.includes(k.id) ? 'on' : ''}`}
              onClick={() => toggleKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Chairs</label>
          <input value={chairs} onChange={(e) => setChairs(e.target.value)} />
        </div>
        <div className="field">
          <label>Workers today</label>
          <input value={workers} onChange={(e) => setWorkers(e.target.value)} />
        </div>
        <div className="field">
          <label>Brands (comma)</label>
          <input value={brands} onChange={(e) => setBrands(e.target.value)} />
        </div>
      </div>
      {!shop?.setupDone ? (
        <p className="hint" style={{ marginTop: 12 }}>
          First save seeds up to 8 catalogue services from selected types. Refine tiles / prices on the Menu tab
          (category → SKU).
        </p>
      ) : (
        <p className="hint" style={{ marginTop: 12 }}>
          Live shops use <code>PATCH /partner/shop</code> — profile only; menu stays intact.
        </p>
      )}
      <div style={{ marginTop: 16 }}>
        <button type="button" className="btn teal" disabled={busy || !name.trim() || !address.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : shop ? 'Save shop' : 'Create & go live'}
        </button>
      </div>
    </div>
  );
}

function HoursForm({
  busy,
  setBusy,
  onFlash
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  onFlash: Props['onFlash'];
}) {
  const [days, setDays] = useState<HourDay[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await partnerFetch<{ days: HourDay[] }>('/partner/hours');
        const by = new Map(data.days.map((d) => [d.weekday, d]));
        setDays(
          WEEKDAYS.map((_, weekday) => by.get(weekday) || { weekday, opensAt: '10:00', closesAt: '21:00' })
        );
      } catch (e) {
        onFlash('err', e instanceof Error ? e.message : 'Hours load failed');
      }
    })();
  }, [onFlash]);

  function patch(weekday: number, key: 'opensAt' | 'closesAt', value: string) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, [key]: value } : d)));
  }

  function closeDay(weekday: number) {
    setDays((prev) => prev.filter((d) => d.weekday !== weekday));
  }

  function openDay(weekday: number) {
    setDays((prev) =>
      [...prev, { weekday, opensAt: '10:00', closesAt: '21:00' }].sort((a, b) => a.weekday - b.weekday)
    );
  }

  async function save() {
    setBusy(true);
    try {
      if (!days.length) throw new Error('Keep at least one open day.');
      await partnerFetch('/partner/hours', {
        method: 'PUT',
        body: JSON.stringify({ days })
      });
      onFlash('ok', 'Hours saved.');
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Hours save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Weekly hours (IST)</h2>
      <p className="hint">Same <code>PUT /partner/hours</code> as partner Shop settings.</p>
      {WEEKDAYS.map((label, weekday) => {
        const day = days.find((d) => d.weekday === weekday);
        return (
          <div className="row" key={weekday} style={{ marginBottom: 8 }}>
            <div style={{ width: 48, fontWeight: 600, paddingBottom: 10 }}>{label}</div>
            {day ? (
              <>
                <div className="field">
                  <label>Opens</label>
                  <input value={day.opensAt.slice(0, 5)} onChange={(e) => patch(weekday, 'opensAt', e.target.value)} />
                </div>
                <div className="field">
                  <label>Closes</label>
                  <input value={day.closesAt.slice(0, 5)} onChange={(e) => patch(weekday, 'closesAt', e.target.value)} />
                </div>
                <button type="button" className="btn ghost" onClick={() => closeDay(weekday)}>
                  Closed
                </button>
              </>
            ) : (
              <button type="button" className="btn ghost" onClick={() => openDay(weekday)}>
                Set open
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="btn teal" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save hours'}
      </button>
    </div>
  );
}

function StaffForm({
  shop,
  busy,
  setBusy,
  onFlash,
  onSaved
}: {
  shop: PartnerShop;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onFlash: Props['onFlash'];
  onSaved: () => Promise<void>;
}) {
  const [names, setNames] = useState(() =>
    shop.barbers.length ? shop.barbers.map((b) => ({ id: b.id, name: b.name })) : [{ name: 'Staff 1' }]
  );

  async function save() {
    setBusy(true);
    try {
      await partnerFetch('/partner/barbers', {
        method: 'PATCH',
        body: JSON.stringify({
          barbers: names.map((n) => ({ id: 'id' in n ? n.id : undefined, name: n.name.trim() })).filter((n) => n.name)
        })
      });
      onFlash('ok', 'Staff saved.');
      await onSaved();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Staff save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Staff / chairs</h2>
      <p className="hint">
        <code>PATCH /partner/barbers</code> — same as Floor staff editor.
      </p>
      {names.map((row, i) => (
        <div className="row" key={'id' in row ? row.id : i} style={{ marginBottom: 8 }}>
          <div className="field">
            <label>Name</label>
            <input
              value={row.name}
              onChange={(e) =>
                setNames((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
          </div>
          <button type="button" className="btn ghost" onClick={() => setNames((prev) => prev.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setNames((prev) => [...prev, { name: '' }])}>
          Add staff
        </button>
        <button type="button" className="btn teal" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save staff'}
        </button>
      </div>
    </div>
  );
}

function PhotosForm({
  shop,
  busy,
  setBusy,
  onFlash,
  onSaved
}: {
  shop: PartnerShop;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onFlash: Props['onFlash'];
  onSaved: () => Promise<void>;
}) {
  const [photos, setPhotos] = useState<string[]>(shop.photos || []);
  const [pending, setPending] = useState<{ file: File; kind: CropKind } | null>(null);
  const resolver = useRef<((url: string | null) => void) | null>(null);

  function askCrop(file: File, kind: CropKind) {
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setPending({ file, kind });
    });
  }

  function finishCrop(url: string | null) {
    resolver.current?.(url);
    resolver.current = null;
    setPending(null);
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const added: string[] = [];
    let count = photos.length;
    for (const file of Array.from(files)) {
      if (count >= 5) break;
      const dataUrl = await askCrop(file, count === 0 ? 'hero' : 'gallery');
      if (!dataUrl) break;
      added.push(dataUrl);
      count += 1;
    }
    if (added.length) setPhotos((prev) => [...prev, ...added].slice(0, 5));
  }

  async function save() {
    setBusy(true);
    try {
      await partnerFetch('/partner/photos', {
        method: 'PATCH',
        body: JSON.stringify({ photos })
      });
      onFlash('ok', 'Photos saved (base64, same as app — max 5).');
      await onSaved();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Photo save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Photos</h2>
      <p className="hint">
        The first photo is the shop header. The next ones are gallery cards. Drag each photo into the matching frame,
        then save. Up to 5. If you remove the header, the next photo becomes the header.
      </p>
      <div className="photos">
        {photos.map((url, i) => (
          <div className={`photo-wrap ${i === 0 ? 'photo-cover' : 'photo-card'}`} key={`${i}-${url.slice(0, 24)}`}>
            <img className="photo" src={url} alt={i === 0 ? 'Shop header' : `Gallery ${i}`} />
            {i === 0 ? <span className="photo-tag">Header</span> : null}
            <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove photo">
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = '';
          }}
          disabled={photos.length >= 5 || pending != null}
        />
        <button type="button" className="btn teal" disabled={busy || pending != null} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save photos'}
        </button>
      </div>
      {pending ? (
        <PhotoCrop
          file={pending.file}
          kind={pending.kind}
          onCancel={() => finishCrop(null)}
          onDone={(url) => finishCrop(url)}
        />
      ) : null}
    </div>
  );
}

function AmenitiesForm({
  shop,
  busy,
  setBusy,
  onFlash,
  onSaved
}: {
  shop: PartnerShop;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onFlash: Props['onFlash'];
  onSaved: () => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string[]>(shop.amenities || []);

  async function save() {
    setBusy(true);
    try {
      await partnerFetch('/partner/amenities', {
        method: 'PATCH',
        body: JSON.stringify({ amenities: chosen })
      });
      onFlash('ok', 'Amenities saved.');
      await onSaved();
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Amenities save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Amenities</h2>
      <p className="hint">
        Shared list from <code>constants/catalogue.ts</code> · <code>PATCH /partner/amenities</code>
      </p>
      <div className="chips">
        {AMENITY_OPTIONS.map((item) => {
          const on = chosen.includes(item);
          return (
            <button
              key={item}
              type="button"
              className={`chip ${on ? 'on' : ''}`}
              onClick={() =>
                setChosen((prev) => (on ? prev.filter((x) => x !== item) : [...prev, item].slice(0, 12)))
              }
            >
              {item}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <button type="button" className="btn teal" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save amenities'}
        </button>
      </div>
    </div>
  );
}

function PasswordForm({
  partnerId,
  busy,
  setBusy,
  onFlash
}: {
  partnerId: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onFlash: Props['onFlash'];
}) {
  const [password, setPassword] = useState('');

  async function save() {
    setBusy(true);
    try {
      await adminFetch(`/admin/partners/${partnerId}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password })
      });
      onFlash('ok', 'Password updated. Share with the partner (and ask them to change it).');
      setPassword('');
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Password update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Set / reset password</h2>
      <p className="hint">Partner signs in via app → Already a partner. Give them email + this password.</p>
      <div className="row">
        <div className="field">
          <label>New password (min 8)</label>
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="mono" />
        </div>
        <button type="button" className="btn accent" disabled={busy || password.length < 8} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </div>
    </div>
  );
}
