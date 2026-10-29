import { Entity } from "./entities";

export interface Layer {
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface DrawingData {
  format: "saggcad";
  version: 1;
  units: "m";
  layers: Layer[];
  currentLayer: string;
  entities: Entity[];
}

/** Rölöve çalışmaları için hazır katman seti. */
export const DEFAULT_LAYERS: Layer[] = [
  { name: "0", color: "#e5e7eb", visible: true, locked: false },
  { name: "DUVAR", color: "#f8fafc", visible: true, locked: false },
  { name: "KAPI", color: "#f59e0b", visible: true, locked: false },
  { name: "PENCERE", color: "#38bdf8", visible: true, locked: false },
  { name: "OLCU", color: "#a3e635", visible: true, locked: false },
  { name: "YAZI", color: "#f472b6", visible: true, locked: false },
  { name: "ROLOVE-NOKTA", color: "#ef4444", visible: true, locked: false },
];

const HISTORY_LIMIT = 200;

/**
 * Çizim belgesi. Tüm değişiklikler `commit` üzerinden yapılır; böylece
 * geri al / yinele ve değişiklik bildirimleri tek yerden yönetilir.
 */
export class Drawing {
  layers: Layer[] = structuredClone(DEFAULT_LAYERS);
  currentLayer = "0";
  entities: Entity[] = [];
  selection = new Set<string>();

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  layer(name: string): Layer | undefined {
    return this.layers.find((l) => l.name === name);
  }

  isEditable(e: Entity): boolean {
    const l = this.layer(e.layer);
    return !l || (l.visible && !l.locked);
  }

  visibleEntities(): Entity[] {
    return this.entities.filter((e) => this.layer(e.layer)?.visible !== false);
  }

  /** Belgeyi değiştiren bir işlem uygular ve geri alma kaydı oluşturur. */
  commit(mutate: (d: Drawing) => void): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    mutate(this);
    this.emit();
  }

  add(...entities: Entity[]): void {
    this.commit((d) => d.entities.push(...entities));
  }

  deleteSelection(): void {
    if (this.selection.size === 0) return;
    this.commit((d) => {
      d.entities = d.entities.filter((e) => !d.selection.has(e.id) || !d.isEditable(e));
      d.selection.clear();
    });
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (prev === undefined) return false;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  toData(): DrawingData {
    return {
      format: "saggcad",
      version: 1,
      units: "m",
      layers: structuredClone(this.layers),
      currentLayer: this.currentLayer,
      entities: structuredClone(this.entities),
    };
  }

  /** Dosyadan yükler; geçmiş temizlenir. */
  load(data: DrawingData): void {
    if (data.format !== "saggcad") throw new Error("Geçersiz SAGGCAD dosyası");
    this.layers = data.layers?.length ? data.layers : structuredClone(DEFAULT_LAYERS);
    this.entities = data.entities ?? [];
    this.currentLayer = this.layer(data.currentLayer) ? data.currentLayer : this.layers[0].name;
    this.selection.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  private snapshot(): string {
    return JSON.stringify({ layers: this.layers, entities: this.entities, currentLayer: this.currentLayer });
  }

  private restore(s: string): void {
    const d = JSON.parse(s);
    this.layers = d.layers;
    this.entities = d.entities;
    this.currentLayer = d.currentLayer;
    const ids = new Set(this.entities.map((e) => e.id));
    this.selection = new Set([...this.selection].filter((id) => ids.has(id)));
    this.emit();
  }
}
