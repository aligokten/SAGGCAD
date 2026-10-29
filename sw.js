/* SAGGCAD — çevrimdışı kabuk önbelleği. Kendi dosyalarımız önce ağdan (yeni sürüm hemen gelsin),
 * çevrimdışıysa önbellekten; yazı tipleri önce önbellekten. Sürüm değişince CACHE adını artırın. */
const CACHE = 'saggcad-v6';
const CORE = [
  './',
  'index.html',
  'css/app.css',
  'css/saggcad.css',
  'css/ui.css',
  'manifest.webmanifest',
  'assets/logo.png',
  'assets/icon.svg',
  'assets/icon-192.png',
  'js/cabdesign.js',
  'js/cabinet.js',
  'js/catalog.js',
  'js/cnc.js',
  'js/docview.js',
  'js/exporters.js',
  'js/fixtures.js',
  'js/floororder.js',
  'js/forms.js',
  'js/importer.js',
  'js/importui.js',
  'js/joinery.js',
  'js/labels.js',
  'js/main.js',
  'js/materials.js',
  'js/openings.js',
  'js/plan-geom.js',
  'js/plan2d.js',
  'js/plan3d.js',
  'js/print.js',
  'js/roof.js',
  'js/sample.js',
  'js/sections.js',
  'js/stairs.js',
  'js/store.js',
  'js/structure.js',
  'js/survey.js',
  'js/textures.js',
  'js/tiles.js',
  'js/ui.js',
  'js/units.js',
  'js/workbench.js',
  'js/bim/adapter.js',
  'js/bim/api.js',
  'js/bim/commands.js',
  'js/bim/fields.js',
  'js/bim/geom2d.js',
  'js/bim/joins.js',
  'js/bim/mesh.js',
  'js/bim/wallcmds.js',
  'js/bim/wallgeom.js',
  'js/bim/manager.js',
  'js/bim/relations.js',
  'js/bim/schema.js',
  'js/bim/types.js',
  'js/bim/ui.js',
  'vendor/three/three.module.js',
  'vendor/three/three.core.js',
  'vendor/three/addons/controls/OrbitControls.js',
  'vendor/three/addons/environments/RoomEnvironment.js',
];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = u.origin === location.origin;
  if (!own && !/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    if (own) {
      try { const r = await fetch(e.request, { cache: 'no-cache' }); if (r.ok) c.put(e.request, r.clone()); return r; }
      catch { return (await c.match(e.request)) || Response.error(); }
    }
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
