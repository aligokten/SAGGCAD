import { Drawing } from "../core/document";
import { ENTITY_LABELS, Entity } from "../core/entities";
import { dist, polygonArea, polylineLength } from "../core/geometry";
import { fmtArea, fmtLen } from "../view/format";

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
}

export function renderLayers(root: HTMLElement, doc: Drawing): void {
  root.replaceChildren(
    ...doc.layers.map((l) => {
      const li = h("li", { className: l.name === doc.currentLayer ? "current" : "" });
      const color = h("input", { type: "color", value: l.color, title: "Renk" });
      color.onchange = () => doc.commit(() => (l.color = color.value));
      const vis = h("button", { textContent: l.visible ? "👁" : "—", title: "Görünür / gizli", className: "icon" });
      vis.onclick = () => doc.commit(() => (l.visible = !l.visible));
      const lock = h("button", { textContent: l.locked ? "🔒" : "🔓", title: "Kilitli / açık", className: "icon" });
      lock.onclick = () => doc.commit(() => (l.locked = !l.locked));
      const name = h("span", { textContent: l.name, className: "name", title: "Etkin katman yapmak için tıklayın" });
      name.onclick = () => {
        doc.currentLayer = l.name;
        doc.emit();
      };
      const count = doc.entities.filter((e) => e.layer === l.name).length;
      li.append(color, name, h("span", { className: "count", textContent: String(count) }), vis, lock);
      return li;
    }),
  );
}

export function renderProps(root: HTMLElement, doc: Drawing): void {
  const sel = doc.entities.filter((e) => doc.selection.has(e.id));
  if (sel.length === 0) {
    root.replaceChildren(h("p", { className: "muted", textContent: `Seçim yok · ${doc.entities.length} nesne` }));
    return;
  }
  const rows: [string, Node | string][] = [];
  rows.push(["Seçili", sel.length === 1 ? ENTITY_LABELS[sel[0].type] : `${sel.length} nesne`]);

  const layerSel = h("select");
  const layers = new Set(sel.map((e) => e.layer));
  for (const l of doc.layers) layerSel.append(h("option", { value: l.name, textContent: l.name, selected: layers.size === 1 && layers.has(l.name) }));
  if (layers.size > 1) layerSel.prepend(h("option", { value: "", textContent: "(karışık)", selected: true }));
  layerSel.onchange = () => {
    if (!layerSel.value) return;
    doc.commit((d) => d.entities.forEach((e) => d.selection.has(e.id) && (e.layer = layerSel.value)));
  };
  rows.push(["Katman", layerSel]);

  if (sel.length === 1) rows.push(...details(sel[0], doc));

  root.replaceChildren(
    h("table", {}, ...rows.map(([k, v]) => h("tr", {}, h("th", { textContent: k }), h("td", {}, v)))),
  );
}

function details(e: Entity, doc: Drawing): [string, Node | string][] {
  switch (e.type) {
    case "line":
      return [["Uzunluk", `${fmtLen(dist(e.a, e.b))} m`]];
    case "polyline": {
      const out: [string, string][] = [
        ["Köşe sayısı", String(e.points.length)],
        [e.closed ? "Çevre" : "Uzunluk", `${fmtLen(polylineLength(e.points, e.closed))} m`],
      ];
      if (e.closed) out.push(["Alan", fmtArea(polygonArea(e.points))]);
      return out;
    }
    case "circle":
      return [
        ["Yarıçap", `${fmtLen(e.radius)} m`],
        ["Alan", fmtArea(Math.PI * e.radius * e.radius)],
      ];
    case "dimension":
      return [["Değer", `${fmtLen(dist(e.a, e.b))} m`]];
    case "text": {
      const input = h("input", { value: e.text });
      input.onchange = () => doc.commit(() => (e.text = input.value));
      const height = h("input", { type: "number", step: "0.05", min: "0.01", value: String(e.height) });
      height.onchange = () => {
        const v = Number(height.value);
        if (v > 0) doc.commit(() => (e.height = v));
      };
      return [["Metin", input], ["Yükseklik", height]];
    }
  }
}
