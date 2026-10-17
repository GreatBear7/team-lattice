import { useEffect, useRef, useState } from 'react';

// Fictional districts placed on approximate Ithaca neighbourhoods (illustrative only).
export const DISTRICT_SITES = [
  { id: 'A', name: 'Downtown / Commons', lat: 42.4393, lng: -76.4977 },
  { id: 'B', name: 'Collegetown', lat: 42.4418, lng: -76.4855 },
  { id: 'C', name: 'Northside / Fall Creek', lat: 42.4488, lng: -76.4950 },
  { id: 'D', name: 'South Hill', lat: 42.4265, lng: -76.4930 },
  { id: 'E', name: 'West Hill', lat: 42.4420, lng: -76.5200 },
  { id: 'F', name: 'East Hill / Forest Home', lat: 42.4510, lng: -76.4620 },
];

export const DISTRICT_BBOX = { minLat: 42.415, maxLat: 42.465, minLng: -76.535, maxLng: -76.445 };

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

let leafletPromise = null;
function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet missing')));
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.appendChild(script);
  }).catch((err) => {
    leafletPromise = null; // allow a retry on a later mount
    throw err;
  });
  return leafletPromise;
}

// Sutherland–Hodgman clip of a polygon by the half-plane a*x + b*y <= c.
function clipHalfPlane(poly, a, b, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const P = poly[i];
    const Q = poly[(i + 1) % n];
    const fp = a * P[0] + b * P[1] - c;
    const fq = a * Q[0] + b * Q[1] - c;
    const pIn = fp <= 0;
    const qIn = fq <= 0;
    if (pIn) out.push(P);
    if (pIn !== qIn) {
      const t = fp / (fp - fq);
      out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
    }
  }
  return out;
}

/**
 * Voronoi cells of `sites` ({id, lat, lng}) clipped to `bbox` ({minLat,maxLat,minLng,maxLng}).
 * Returns { id: [[lat, lng], ...] }.
 *
 * Self-check: each cell is the bbox intersected with, for every other site q, the half-plane of
 * points at least as close to its own site p as to q (perpendicular bisector). So a cell is exactly
 * the set of bbox points closer to its site than to any other site: two cells can only share
 * boundary (equidistant) points, never interior, and every bbox point has some nearest site, so
 * the cells tile the bbox with no overlaps and no gaps.
 * Distances use a local planar projection x = (lng - lng0) * cos(lat0), y = lat - lat0.
 */
export function voronoiCells(sites, bbox) {
  const lat0 = (bbox.minLat + bbox.maxLat) / 2;
  const lng0 = (bbox.minLng + bbox.maxLng) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const fwd = (lat, lng) => [(lng - lng0) * k, lat - lat0];
  const inv = ([x, y]) => [y + lat0, x / k + lng0];

  const box = [
    fwd(bbox.minLat, bbox.minLng),
    fwd(bbox.minLat, bbox.maxLng),
    fwd(bbox.maxLat, bbox.maxLng),
    fwd(bbox.maxLat, bbox.minLng),
  ];
  const pts = sites.map((s) => ({ id: s.id, p: fwd(s.lat, s.lng) }));
  const cells = {};
  for (const { id, p } of pts) {
    let poly = box.slice();
    for (const { id: oid, p: q } of pts) {
      if (oid === id || poly.length === 0) continue;
      // |x-p|^2 <= |x-q|^2  <=>  2x·(q-p) <= |q|^2 - |p|^2
      const a = 2 * (q[0] - p[0]);
      const b = 2 * (q[1] - p[1]);
      const c = q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1];
      poly = clipHalfPlane(poly, a, b, c);
    }
    cells[id] = poly.map(inv);
  }
  return cells;
}

function fillFor(lateRate) {
  if (lateRate === null || lateRate === undefined || Number.isNaN(lateRate)) return '#d5dde2';
  const v = lateRate * 100;
  if (v <= 10) return '#7fbfb5';
  if (v <= 15) return '#e9b866';
  if (v <= 20) return '#e08a6f';
  return '#bd4135';
}

function isWorseThanNormal(zone, bands) {
  if (zone && zone.deterioration_flag === true) return true;
  return Array.isArray(bands) && bands.some((b) => b && b.status === 'ok' && b.flag === true);
}

const CELLS = voronoiCells(DISTRICT_SITES, DISTRICT_BBOX);

export function DistrictMap({ zones, bandsByZone = {}, selected, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  // Always start as 'loading': 'ready' is set only after this mount has created its map,
  // so the draw effect re-runs once the layer exists (also when Leaflet was already cached).
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let ro = null;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current, { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        map.fitBounds(
          [
            [DISTRICT_BBOX.minLat, DISTRICT_BBOX.minLng],
            [DISTRICT_BBOX.maxLat, DISTRICT_BBOX.maxLng],
          ],
          { padding: [8, 8] }
        );
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 0);
        if (typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => {
            if (mapRef.current) mapRef.current.invalidateSize();
          });
          ro.observe(containerRef.current);
        }
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  // Redraw districts when data or selection changes.
  useEffect(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    const layer = layerRef.current;
    if (status !== 'ready' || !L || !layer) return;
    layer.clearLayers();
    const byId = {};
    (zones || []).forEach((z) => {
      byId[z.zone_id] = z;
    });
    DISTRICT_SITES.forEach((site) => {
      const cell = CELLS[site.id];
      if (!cell || cell.length < 3) return;
      const z = byId[site.id] || { zone_id: site.id, late_rate: null };
      const worse = isWorseThanNormal(z, bandsByZone[site.id]);
      const isSel = site.id === selected;
      const style = {
        fillColor: fillFor(z.late_rate),
        fillOpacity: 0.55,
        color: '#ffffff',
        weight: 1.5,
      };
      if (worse) Object.assign(style, { color: '#1d2a33', weight: 3, dashArray: '7 5' });
      if (isSel) Object.assign(style, { color: '#087d77', weight: 4 });
      const pct =
        z.late_rate === null || z.late_rate === undefined || Number.isNaN(z.late_rate)
          ? 'n/a'
          : `${(z.late_rate * 100).toFixed(1)}%`;
      const poly = L.polygon(cell, style);
      poly.bindTooltip(
        L.tooltip({ permanent: true, direction: 'center', className: 'district-map-label' }).setContent(
          `${site.id} ${pct}`
        )
      );
      poly.on('click', () => {
        if (onSelectRef.current) onSelectRef.current(site.id);
      });
      poly.on('mouseover', () => poly.setStyle({ fillOpacity: 0.7 }));
      poly.on('mouseout', () => poly.setStyle({ fillOpacity: 0.55 }));
      poly.addTo(layer);
      if (isSel) poly.bringToFront();
    });
  }, [zones, bandsByZone, selected, status]);

  return (
    <div className="district-map">
      <div className="district-map-canvas" ref={containerRef} style={{ height: '100%' }}>
        {status === 'loading' && <span>Loading map…</span>}
        {status === 'error' && <span>Map unavailable offline</span>}
      </div>
      <div className="district-map-legend">
        Fill = late rate · dashed = worse than its own normal · areas approximate (illustrative)
      </div>
    </div>
  );
}

export default DistrictMap;
