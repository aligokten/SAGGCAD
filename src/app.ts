import { Drawing, DrawingData } from "./core/document";
import { SnapPoint, entityBox, hitDistance } from "./core/entities";
import { Vec2, boxContains, boxOf, dist } from "./core/geometry";
import { parseCoord } from "./core/input";
import { resolveSnap } from "./core/snap";
import { exportDxf } from "./io/dxf";
import { autosave, download, loadAutosave, pickFile } from "./io/files";
import { exportSvg } from "./io/svg";
import {
  CircleTool, DimensionTool, LineTool, MeasureTool, MoveTool, PolylineTool, RectTool, TextTool,
} from "./tools/draw";
import { Tool, ToolContext } from "./tools/tool";
import { renderLayers, renderProps } from "./ui/panels";
import { fmtLen } from "./view/format";
import { Renderer } from "./view/renderer";
import { Viewport } from "./view/viewport";

interface ToolDef {
  make: () => Tool;
  label: string;
  icon: string;
  /** Komut satırı kısaltmaları (ilk eleman kısayol tuşu olarak gösterilir). */
  aliases: string[];
}

const TOOLS: ToolDef[] = [
  { make: () => new LineTool(), label: "Çizgi", icon: "╱", aliases: ["L", "LINE", "CIZGI"] },
  { make: () => new PolylineTool(), label: "Çoklu çizgi", icon: "⌇", aliases: ["PL", "PLINE"] },
  { make: () => new RectTool(), label: "Dikdörtgen", icon: "▭", aliases: ["REC", "RECTANG"] },
  { make: () => new CircleTool(), label: "Daire", icon: "◯", aliases: ["C", "CIRCLE", "DAIRE"] },
  { make: () => new DimensionTool(), label: "Ölçü", icon: "↔", aliases: ["DIM", "OLCU"] },
  { make: () => new TextTool(), label: "Yazı", icon: "T", aliases: ["T", "TEXT", "YAZI"] },
  { make: () => new MoveTool(), label: "Taşı", icon: "✥", aliases: ["M", "MOVE", "TASI"] },
  { make: () => new MeasureTool(), label: "Mesafe ölç", icon: "📏", aliases: ["DI", "DIST"] },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class App {
  readonly doc = new Drawing();
  readonly view = new Viewport();
  readonly renderer: Renderer;
  readonly settings = { grid: true, snapGrid: false, ortho: false, osnap: true };

  private tool: Tool | null = null;
  private cursorScreen: Vec2 = { x: 0, y: 0 };
  private cursor: Vec2 = { x: 0, y: 0 };
  private snap?: SnapPoint;
  private boxStart?: Vec2;
  private panLast?: Vec2;
  private filename = "adsız.saggcad";
  private frame = 0;

  private readonly canvas = $<HTMLCanvasElement>("canvas");
  private readonly cmd = $<HTMLInputElement>("cmd");
  private readonly ctx: ToolContext = {
    doc: this.doc,
    view: this.view,
    log: (m) => this.log(m),
    ask: (q, initial) => window.prompt(q, initial ?? ""),
    redraw: () => this.redraw(),
    finish: () => this.setTool(null),
  };

  constructor() {
    this.renderer = new Renderer(this.canvas, this.view);
    this.buildToolbox();
    this.bindUi();
    this.bindCanvas();
    this.bindKeys();

    this.doc.onChange(() => {
      renderLayers($("layers"), this.doc);
      renderProps($("props"), this.doc);
      autosave(this.doc.toData());
      this.redraw();
    });

    const saved = loadAutosave();
    if (saved) {
      try {
        this.doc.load(saved);
        this.log("Son oturum geri yüklendi.");
      } catch {
        this.doc.emit();
      }
    } else this.doc.emit();

    new ResizeObserver(() => {
      this.renderer.resize();
      this.redraw();
    }).observe(this.canvas);
    this.renderer.resize();
    this.zoomExtents();
    this.setTool(null);
    this.log("SAGGCAD hazır. Komut yazın ya da soldan bir araç seçin.");
  }

  // ---- Araçlar -------------------------------------------------------------

  setTool(tool: Tool | null): void {
    this.tool?.reset();
    this.tool = tool;
    document.querySelectorAll<HTMLButtonElement>("#toolbox button").forEach((b) => {
      b.classList.toggle("active", tool ? b.dataset.tool === tool.id : b.dataset.tool === "select");
    });
    this.updatePrompt();
    this.redraw();
  }

  private buildToolbox(): void {
    const box = $("toolbox");
    const mk = (id: string, icon: string, title: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.dataset.tool = id;
      b.textContent = icon;
      b.title = title;
      b.onclick = () => {
        onClick();
        this.canvas.focus();
      };
      box.append(b);
    };
    mk("select", "➚", "Seç (Esc)", () => this.setTool(null));
    for (const t of TOOLS) {
      const id = t.make().id;
      mk(id, t.icon, `${t.label} (${t.aliases[0]})`, () => this.setTool(t.make()));
    }
  }

  private runCommand(raw: string): void {
    const text = raw.trim();
    const base = this.tool?.basePoint();

    if (this.tool) {
      if (text === "" && this.tool.confirm) return this.tool.confirm(this.ctx);
      if (/^k$/i.test(text) && this.tool instanceof PolylineTool) return this.tool.close(this.ctx);
      const c = parseCoord(text, base);
      if (c?.kind === "point") return this.toolClick(c.p);
      if (c?.kind === "length") {
        if (this.tool.length) this.tool.length(c.value, this.cursor, this.ctx);
        else this.log("Bu adımda uzunluk girilemez; nokta girin (x,y).");
        return this.afterToolInput();
      }
    }

    const word = text.toUpperCase();
    if (!word) return;
    const def = TOOLS.find((t) => t.aliases.includes(word));
    if (def) return this.setTool(def.make());
    const commands: Record<string, () => void> = {
      U: () => this.undo(), UNDO: () => this.undo(), REDO: () => this.redo(),
      Z: () => this.zoomExtents(), ZOOM: () => this.zoomExtents(),
      E: () => this.doc.deleteSelection(), ERASE: () => this.doc.deleteSelection(), SIL: () => this.doc.deleteSelection(),
      DXF: () => this.exportDxf(), SVG: () => this.exportSvg(),
      SAVE: () => this.save(), OPEN: () => void this.open(), NEW: () => this.newDrawing(),
      HELP: () => this.help(), YARDIM: () => this.help(), "?": () => this.help(),
    };
    const fn = commands[word];
    if (fn) fn();
    else this.log(`Bilinmeyen komut: ${text}  (yardım için ? yazın)`);
  }

  private help(): void {
    this.log(
      "Araçlar: " + TOOLS.map((t) => `${t.aliases[0]}=${t.label}`).join(", ") +
        " · Komutlar: U geri al, REDO, Z tümünü göster, E sil, SAVE, OPEN, NEW, DXF, SVG" +
        " · Giriş: x,y  @dx,dy  @uzunluk<açı  veya yalnız uzunluk",
    );
  }

  private toolClick(p: Vec2): void {
    if (!this.tool) return;
    this.tool.click(p, this.ctx);
    this.afterToolInput();
  }

  private afterToolInput(): void {
    this.updatePrompt();
    this.redraw();
  }

  private updatePrompt(): void {
    $("prompt").textContent = this.tool ? `${this.tool.label} — ${this.tool.prompt()}:` : "Komut:";
  }

  // ---- Fare ----------------------------------------------------------------

  private bindCanvas(): void {
    const c = this.canvas;
    c.tabIndex = 0;
    const screenOf = (e: PointerEvent | WheelEvent): Vec2 => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.view.zoomAt(screenOf(e), Math.exp(-e.deltaY * 0.0015));
      this.updateCursor(screenOf(e));
    }, { passive: false });

    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const s = screenOf(e);
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this.panLast = s;
        return;
      }
      if (e.button === 2) {
        if (this.tool?.confirm) this.tool.confirm(this.ctx);
        else this.setTool(null);
        return;
      }
      if (e.button !== 0) return;
      if (this.tool) this.toolClick(this.cursor);
      else this.boxStart = s;
    });

    c.addEventListener("pointermove", (e) => {
      const s = screenOf(e);
      if (this.panLast) {
        this.view.panBy(s.x - this.panLast.x, s.y - this.panLast.y);
        this.panLast = s;
      }
      this.updateCursor(s);
    });

    c.addEventListener("pointerup", (e) => {
      const s = screenOf(e);
      if (this.panLast) {
        this.panLast = undefined;
        return;
      }
      if (this.boxStart && e.button === 0) {
        if (dist(this.boxStart, s) < 4) this.pick(s, e.shiftKey);
        else this.boxSelect(this.boxStart, s, e.shiftKey);
        this.boxStart = undefined;
        this.redraw();
      }
    });

    c.addEventListener("dblclick", () => {
      if (!this.tool) this.zoomExtents();
    });
  }

  private updateCursor(s: Vec2): void {
    this.cursorScreen = s;
    const raw = this.view.toWorld(s);
    const tol = 10 / this.view.zoom;
    const r = this.tool
      ? resolveSnap(this.doc, raw, tol, {
          osnap: this.settings.osnap,
          grid: this.settings.snapGrid,
          ortho: this.settings.ortho,
          gridStep: this.view.gridStep(),
        }, this.tool.basePoint())
      : { p: raw, snap: undefined };
    this.cursor = r.p;
    this.snap = r.snap;
    $("coords").textContent = `${fmtLen(this.cursor.x)}, ${fmtLen(this.cursor.y)}`;
    this.redraw();
  }

  private pick(s: Vec2, additive: boolean): void {
    const p = this.view.toWorld(s);
    const tol = 6 / this.view.zoom;
    let best: string | undefined;
    let bestD = tol;
    for (const e of this.doc.visibleEntities()) {
      const d = hitDistance(e, p);
      if (d <= bestD) [best, bestD] = [e.id, d];
    }
    if (!additive) this.doc.selection.clear();
    if (best) {
      if (additive && this.doc.selection.has(best)) this.doc.selection.delete(best);
      else this.doc.selection.add(best);
    }
    this.doc.emit();
  }

  /** Soldan sağa: tamamen içeridekiler (pencere). Sağdan sola: değenler (kesişen). */
  private boxSelect(a: Vec2, b: Vec2, additive: boolean): void {
    const box = boxOf([this.view.toWorld(a), this.view.toWorld(b)])!;
    const crossing = b.x < a.x;
    if (!additive) this.doc.selection.clear();
    for (const e of this.doc.visibleEntities()) {
      const eb = entityBox(e);
      if (!eb) continue;
      const inside = boxContains(box, eb.min) && boxContains(box, eb.max);
      const overlaps = eb.min.x <= box.max.x && eb.max.x >= box.min.x && eb.min.y <= box.max.y && eb.max.y >= box.min.y;
      if (crossing ? overlaps : inside) this.doc.selection.add(e.id);
    }
    this.doc.emit();
  }

  // ---- Klavye --------------------------------------------------------------

  private bindKeys(): void {
    this.cmd.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = this.cmd.value;
        this.cmd.value = "";
        if (v.trim()) this.log(`» ${v}`);
        this.runCommand(v);
      } else if (e.key === "Escape") {
        e.stopPropagation();
        this.cmd.value = "";
        this.cancel();
      }
    });

    window.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") return this.prevent(e, () => (e.shiftKey ? this.redo() : this.undo()));
      if (mod && key === "y") return this.prevent(e, () => this.redo());
      if (mod && key === "s") return this.prevent(e, () => this.save());
      if (mod && key === "o") return this.prevent(e, () => void this.open());
      if (mod && key === "a" && document.activeElement !== this.cmd)
        return this.prevent(e, () => {
          this.doc.visibleEntities().forEach((x) => this.doc.selection.add(x.id));
          this.doc.emit();
        });
      const toggles: Record<string, keyof App["settings"]> = { F3: "osnap", F7: "grid", F8: "ortho", F9: "snapGrid" };
      if (toggles[e.key]) return this.prevent(e, () => this.toggle(toggles[e.key]));

      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
      if (typing) return;
      if (e.key === "Escape") return this.cancel();
      if (e.key === "Delete") return this.doc.deleteSelection();
      if (e.key === "Enter" || e.key === " ") return this.prevent(e, () => this.runCommand(""));
      // Kanvas üzerindeyken yazmaya başlamak komut satırına odaklanır (AutoCAD gibi).
      if (e.key.length === 1 && !mod) this.cmd.focus();
    });
  }

  private prevent(e: Event, fn: () => void): void {
    e.preventDefault();
    fn();
  }

  private cancel(): void {
    if (this.tool) this.setTool(null);
    else if (this.doc.selection.size) {
      this.doc.selection.clear();
      this.doc.emit();
    }
    this.canvas.focus();
  }

  private toggle(key: keyof App["settings"]): void {
    this.settings[key] = !this.settings[key];
    this.syncToggles();
    this.redraw();
  }

  private syncToggles(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((b) => {
      b.classList.toggle("on", this.settings[b.dataset.toggle as keyof App["settings"]]);
    });
  }

  // ---- Arayüz ve dosya -----------------------------------------------------

  private bindUi(): void {
    const actions: Record<string, () => void> = {
      new: () => this.newDrawing(),
      open: () => void this.open(),
      save: () => this.save(),
      "export-dxf": () => this.exportDxf(),
      "export-svg": () => this.exportSvg(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      "zoom-extents": () => this.zoomExtents(),
    };
    document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((b) => {
      b.onclick = () => actions[b.dataset.action!]?.();
    });
    document.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((b) => {
      b.onclick = () => this.toggle(b.dataset.toggle as keyof App["settings"]);
    });
    this.syncToggles();
    $("add-layer").onclick = () => {
      const name = window.prompt("Katman adı:")?.trim().toUpperCase();
      if (!name) return;
      if (this.doc.layer(name)) return this.log(`"${name}" katmanı zaten var.`);
      this.doc.commit((d) => {
        d.layers.push({ name, color: "#e5e7eb", visible: true, locked: false });
        d.currentLayer = name;
      });
    };
  }

  private undo(): void {
    if (!this.doc.undo()) this.log("Geri alınacak işlem yok.");
  }

  private redo(): void {
    if (!this.doc.redo()) this.log("Yinelenecek işlem yok.");
  }

  zoomExtents(): void {
    const pts = this.doc.visibleEntities().flatMap((e) => {
      const b = entityBox(e);
      return b ? [b.min, b.max] : [];
    });
    this.view.fit(boxOf(pts));
    this.redraw();
  }

  private newDrawing(): void {
    if (this.doc.entities.length && !window.confirm("Mevcut çizim kapatılsın mı? Kaydedilmemiş değişiklikler kaybolur.")) return;
    this.doc.load(new Drawing().toData());
    this.setFilename("adsız.saggcad");
    this.zoomExtents();
  }

  private save(): void {
    download(this.filename, JSON.stringify(this.doc.toData(), null, 1), "application/json");
    this.log(`Kaydedildi: ${this.filename}`);
  }

  private async open(): Promise<void> {
    const f = await pickFile(".saggcad,.json");
    if (!f) return;
    try {
      this.doc.load(JSON.parse(await f.text()) as DrawingData);
      this.setFilename(f.name);
      this.zoomExtents();
      this.log(`Açıldı: ${f.name} (${this.doc.entities.length} nesne)`);
    } catch (err) {
      this.log(`Dosya açılamadı: ${(err as Error).message}`);
    }
  }

  private baseName(): string {
    return this.filename.replace(/\.(saggcad|json)$/i, "");
  }

  private exportDxf(): void {
    download(`${this.baseName()}.dxf`, exportDxf(this.doc), "application/dxf");
    this.log("DXF (R12) dışa aktarıldı.");
  }

  private exportSvg(): void {
    download(`${this.baseName()}.svg`, exportSvg(this.doc), "image/svg+xml");
    this.log("SVG dışa aktarıldı.");
  }

  private setFilename(name: string): void {
    this.filename = name;
    $("filename").textContent = name;
  }

  log(msg: string): void {
    const el = $("cmdlog");
    const line = document.createElement("div");
    line.textContent = msg;
    el.append(line);
    while (el.childElementCount > 200) el.firstElementChild?.remove();
    el.scrollTop = el.scrollHeight;
  }

  // ---- Çizim ---------------------------------------------------------------

  redraw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const r = this.renderer;
      r.clear(this.settings.grid);
      r.drawDocument(this.doc);
      this.tool?.preview(r, this.cursor, this.ctx);
      if (this.boxStart) r.drawSelectionBox(this.boxStart, this.cursorScreen, this.cursorScreen.x < this.boxStart.x);
      r.drawCursor(this.view.toScreen(this.cursor), this.snap);
    });
  }
}
