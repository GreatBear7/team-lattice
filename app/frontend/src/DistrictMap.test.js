import { describe, it, expect } from 'vitest';
import { voronoiCells, DISTRICT_SITES, DISTRICT_BBOX } from './DistrictMap.jsx';

// Polygons are [[lat, lng], ...]. The projection used inside voronoiCells is affine, so
// point-in-polygon and area ratios computed in raw degrees are equivalent to the planar ones.

function pointInPolygon(lat, lng, poly) {
  // Ray casting along +lng.
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat) {
      const xCross = xj + ((lat - yj) * (xi - xj)) / (yi - yj);
      if (lng < xCross) inside = !inside;
    }
  }
  return inside;
}

function shoelaceArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [y1, x1] = poly[i];
    const [y2, x2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const sites = DISTRICT_SITES;
const bbox = DISTRICT_BBOX;
const bboxArea = (bbox.maxLat - bbox.minLat) * (bbox.maxLng - bbox.minLng);

describe('voronoiCells (Ithaca districts)', () => {
  const cells = voronoiCells(sites, bbox);

  it('uses the expected 6 sites and bbox', () => {
    expect(sites.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(bbox).toEqual({ minLat: 42.415, maxLat: 42.465, minLng: -76.535, maxLng: -76.445 });
  });

  it('returns exactly 6 non-empty polygons, one per id', () => {
    expect(Object.keys(cells).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    for (const id of Object.keys(cells)) {
      expect(cells[id].length).toBeGreaterThanOrEqual(3);
      expect(shoelaceArea(cells[id])).toBeGreaterThan(0);
    }
  });

  it('has no overlaps and no gaps: 3000 random points each fall in exactly one cell', () => {
    const rand = lcg(20261017);
    const bad = [];
    for (let n = 0; n < 3000; n++) {
      const lat = bbox.minLat + rand() * (bbox.maxLat - bbox.minLat);
      const lng = bbox.minLng + rand() * (bbox.maxLng - bbox.minLng);
      const hits = Object.keys(cells).filter((id) => pointInPolygon(lat, lng, cells[id]));
      if (hits.length !== 1) bad.push({ lat, lng, hits });
    }
    expect(bad).toEqual([]);
  });

  it('cell areas sum to the bbox area within 0.5%', () => {
    const total = Object.values(cells).reduce((acc, poly) => acc + shoelaceArea(poly), 0);
    expect(Math.abs(total - bboxArea) / bboxArea).toBeLessThan(0.005);
  });

  it('every site lies inside its own cell', () => {
    for (const s of sites) {
      expect(pointInPolygon(s.lat, s.lng, cells[s.id])).toBe(true);
    }
  });

  it('degenerate: a single site gets the whole bbox', () => {
    const one = voronoiCells([{ id: 'X', lat: 42.44, lng: -76.49 }], bbox);
    expect(Object.keys(one)).toEqual(['X']);
    expect(one.X.length).toBe(4);
    expect(Math.abs(shoelaceArea(one.X) - bboxArea) / bboxArea).toBeLessThan(1e-9);
    const lats = one.X.map((p) => p[0]);
    const lngs = one.X.map((p) => p[1]);
    expect(Math.min(...lats)).toBeCloseTo(bbox.minLat, 9);
    expect(Math.max(...lats)).toBeCloseTo(bbox.maxLat, 9);
    expect(Math.min(...lngs)).toBeCloseTo(bbox.minLng, 9);
    expect(Math.max(...lngs)).toBeCloseTo(bbox.maxLng, 9);
  });
});
