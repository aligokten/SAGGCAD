import { Drawing } from "../core/document";
import { Vec2 } from "../core/geometry";
import { Renderer } from "../view/renderer";
import { Viewport } from "../view/viewport";

/** Araçların uygulamadan kullandığı servisler. */
export interface ToolContext {
  doc: Drawing;
  view: Viewport;
  /** Komut satırına bilgi yazar. */
  log(msg: string): void;
  /** Yazı gibi metin girdisi gerektiren araçlar için. */
  ask(question: string, initial?: string): string | null;
  redraw(): void;
  /** Etkin aracı bitirir ve seçim aracına döner. */
  finish(): void;
}

/**
 * Tüm çizim araçlarının ortak arayüzü. Noktalar kenetleme uygulanmış dünya
 * koordinatlarıdır; komut satırından girilen koordinatlar da `click` ile gelir.
 */
export interface Tool {
  readonly id: string;
  readonly label: string;
  /** Komut satırında gösterilecek istem. */
  prompt(): string;
  /** ORTO ve göreli koordinat girişi için taban nokta. */
  basePoint(): Vec2 | undefined;
  click(p: Vec2, ctx: ToolContext): void;
  /** Komut satırına yalnız sayı yazıldığında: imleç yönünde bu uzunlukta nokta. */
  length?(value: number, cursor: Vec2, ctx: ToolContext): void;
  /** Enter / sağ tık: aracı tamamla. */
  confirm?(ctx: ToolContext): void;
  preview(r: Renderer, cursor: Vec2, ctx: ToolContext): void;
  reset(): void;
}
