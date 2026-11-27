/**
 * RRHH · piezas para ver las timbradas: la celda de una marca (foto, hora, estado y lugar), el detalle con la foto y el mapa de la
 * ubicación que permitió registrarla, y el historial de días de una persona con sus conteos y filtros.
 */
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import type { Map as MapaGL } from 'maplibre-gl';
import { ThumbSrcDirective } from '../../shared/directives/thumb-src.directive';
import { VerMediaDirective } from '../../shared/directives/ver-media.directive';
import { StorageUploadService } from '../../core/services/storage-upload.service';
import { MediaError, mensajeEstado } from '../../core/services/media-privada';
import type { Puntualidad, TimbradaApi } from '../../core/services/rrhh.service';
import {
  ETIQUETA_ESTADO_DIA, ETIQUETA_PUNTUALIDAD, ETIQUETA_VERIFICACION, FILTROS_DIA, FilaDia, ZONA_ECUADOR, contarPuntualidad,
  pasaFiltroDia, textoMinutos, type ConteoPuntualidad, type FiltroDia,
} from './rrhh.modelos';

/** Lo que se muestra al abrir una marca: la marca y cómo quedó frente al horario. */
export interface MarcaElegida {
  marca: TimbradaApi;
  puntualidad: Puntualidad | null;
  minutos: number | null;
}

const lugarDe = (m: TimbradaApi): string => (m.sitio ? `${m.sitio.tipo === 'AGENCIA' ? 'Agencia' : 'Bodega'} ${m.sitio.nombre}` : 'Sin lugar registrado');

// ───────────────────────── Celda de una marca ─────────────────────────

@Component({
  selector: 'app-rrhh-marca-celda',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ThumbSrcDirective],
  template: `
    @if (marca) {
      <button type="button" class="flex items-start gap-2 text-left rounded-lg p-1 -m-1 hover:bg-slate-100 transition-colors" (click)="abrir()" [attr.aria-label]="'Ver foto y ubicación de la ' + (marca.tipo === 'ENTRADA' ? 'entrada' : 'salida') + ' de ' + marca.persona">
        <img [appThumb]="marca.fotoKey" alt="Foto de la timbrada" class="w-14 h-14 shrink-0 rounded-lg object-cover border border-slate-200 bg-slate-50">
        <span class="min-w-0">
          <span class="flex items-center gap-1.5 flex-wrap">
            <span class="font-mono font-bold text-easydry-blue">{{ marca.marcadaEn | date:'HH:mm':zona }}</span>
            @if (puntualidad) { <span class="badge" [ngClass]="etiquetas[puntualidad].clase">{{ etiquetas[puntualidad].nombre }}</span> }
          </span>
          <span class="block text-[11px] text-slate-500">{{ textoDeMinutos }}</span>
          <span class="flex items-start gap-1 text-[11px] text-slate-700 max-w-48">
            <i-lucide name="map-pin" class="w-3 h-3 shrink-0 mt-0.5 text-violet-600" aria-hidden="true"></i-lucide>
            <span>{{ lugar }}@if (marca.distanciaM !== null) { · a {{ marca.distanciaM | number:'1.0-0' }} m }</span>
          </span>
        </span>
      </button>
    } @else { <span class="text-slate-400">—</span> }
  `,
})
export class RrhhMarcaCeldaComponent {
  @Input() marca: TimbradaApi | null = null;
  @Input() puntualidad: Puntualidad | null = null;
  @Input() minutos: number | null = null;
  @Input() tolerancia = 10;
  @Output() ver = new EventEmitter<MarcaElegida>();

  readonly zona = ZONA_ECUADOR;
  readonly etiquetas = ETIQUETA_PUNTUALIDAD;
  get lugar(): string { return this.marca ? lugarDe(this.marca) : ''; }
  get textoDeMinutos(): string {
    // En la salida se muestran todos los minutos hechos después de la hora, aunque estén dentro de la tolerancia.
    if (this.marca?.tipo === 'SALIDA' && this.minutos !== null && this.minutos > 0) return `+${this.minutos} min después de la salida`;
    return textoMinutos(this.minutos, this.tolerancia);
  }

  abrir(): void {
    if (this.marca) this.ver.emit({ marca: this.marca, puntualidad: this.puntualidad, minutos: this.minutos });
  }
}

// ───────────────────────── Mapa de una marca (solo lectura) ─────────────────────────

interface Punto { lat: number; lng: number }

/** Círculo de `radioM` metros alrededor de un punto, como polígono para dibujarlo en el mapa. */
function circulo(centro: Punto, radioM: number): [number, number][] {
  const porGradoLat = 111_320;
  const porGradoLng = porGradoLat * Math.cos((centro.lat * Math.PI) / 180);
  return Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [centro.lng + (radioM * Math.cos(a)) / porGradoLng, centro.lat + (radioM * Math.sin(a)) / porGradoLat] as [number, number];
  });
}

@Component({
  selector: 'app-rrhh-mapa-marca',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50" style="height: 260px; isolation: isolate">
      <div #mapa class="absolute inset-0" role="application" aria-label="Mapa con el punto donde se timbró y la ubicación de referencia"></div>
      @if (mensaje) { <div class="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-semibold text-slate-500 bg-slate-50/95" role="status">{{ mensaje }}</div> }
    </div>
  `,
})
export class RrhhMapaMarcaComponent implements AfterViewInit, OnDestroy {
  @Input() persona: Punto | null = null;
  @Input() referencia: Punto | null = null;
  @Input() radioM: number | null = null;
  @ViewChild('mapa', { static: true }) private contenedor!: ElementRef<HTMLDivElement>;

  mensaje = 'Cargando el mapa…';
  private mapa: MapaGL | null = null;
  private destruido = false;

  async ngAfterViewInit(): Promise<void> {
    try {
      const modulo = await import('maplibre-gl');
      const libreria = ((modulo as unknown as { default?: typeof modulo }).default ?? modulo) as typeof modulo;
      if (this.destruido) return;
      libreria.setWorkerUrl(new URL('assets/maplibre/maplibre-gl-worker.mjs', document.baseURI).href);
      const centro = this.referencia ?? this.persona!;
      const mapa = new libreria.Map({ container: this.contenedor.nativeElement, style: 'https://tiles.openfreemap.org/styles/liberty', center: [centro.lng, centro.lat], zoom: 16, attributionControl: { compact: true } });
      this.mapa = mapa;
      mapa.addControl(new libreria.NavigationControl({ showCompass: false }), 'top-left');
      mapa.once('load', () => {
        this.mensaje = '';
        if (this.referencia && this.radioM) {
          mapa.addSource('radio', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(this.referencia, this.radioM)] } } });
          mapa.addLayer({ id: 'radio-area', type: 'fill', source: 'radio', paint: { 'fill-color': '#6d28d9', 'fill-opacity': 0.12 } });
          mapa.addLayer({ id: 'radio-borde', type: 'line', source: 'radio', paint: { 'line-color': '#6d28d9', 'line-width': 2 } });
        }
        if (this.referencia) new libreria.Marker({ color: '#6d28d9' }).setLngLat([this.referencia.lng, this.referencia.lat]).addTo(mapa);
        if (this.persona) new libreria.Marker({ color: '#0b4f9c' }).setLngLat([this.persona.lng, this.persona.lat]).addTo(mapa);
        if (this.persona && this.referencia) {
          const limites = new libreria.LngLatBounds();
          for (const p of [this.persona, this.referencia]) limites.extend([p.lng, p.lat]);
          mapa.fitBounds(limites, { padding: 70, maxZoom: 17, duration: 0 });
        }
      });
      setTimeout(() => { if (this.mensaje && !this.destruido) this.mensaje = 'No se pudo cargar el mapa. Usa los enlaces para verlo en Google Maps.'; }, 15_000);
    } catch {
      this.mensaje = 'No se pudo cargar el mapa. Usa los enlaces para verlo en Google Maps.';
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.mapa?.remove();
    this.mapa = null;
  }
}

// ───────────────────────── Detalle de una marca ─────────────────────────

@Component({
  selector: 'app-rrhh-marca-detalle',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, VerMediaDirective, RrhhMapaMarcaComponent],
  template: `
    @if (elegida) {
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            @if (foto) {
              <img [src]="foto" [appVerMedia]="elegida.marca.fotoKey" [alt]="'Foto de la timbrada de ' + elegida.marca.persona" class="w-full max-h-96 object-contain rounded-xl border border-slate-200 bg-slate-900">
              <p class="text-[11px] text-slate-500 mt-1">Pulsa la foto para ampliarla.</p>
            } @else {
              <div class="w-full h-48 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-3 text-center text-xs text-slate-500">{{ errorFoto || 'Cargando foto…' }}</div>
            }
          </div>
          <dl class="space-y-2">
            <div><dt class="text-[11px] font-bold uppercase text-slate-500">Hora (del servidor)</dt>
              <dd class="font-semibold text-slate-900">{{ elegida.marca.marcadaEn | date:'dd/MM/yyyy':zona }} a las {{ elegida.marca.marcadaEn | date:'HH:mm:ss':zona }}
                @if (elegida.puntualidad) { <span class="badge ml-1" [ngClass]="etiquetas[elegida.puntualidad].clase">{{ etiquetas[elegida.puntualidad].nombre }}</span> }
                @if (elegida.minutos !== null) { <span class="block text-xs font-normal text-slate-500">{{ elegida.minutos > 0 ? '+' : '' }}{{ elegida.minutos }} min respecto a su horario</span> }
              </dd></div>
            <div><dt class="text-[11px] font-bold uppercase text-slate-500">Ubicación que permitió registrar</dt>
              <dd class="font-semibold text-slate-900">{{ lugar }}
                @if (elegida.marca.sitio?.direccion) { <span class="block text-xs font-normal text-slate-500">{{ elegida.marca.sitio?.direccion }}</span> }
                @if (elegida.marca.distanciaM !== null) { <span class="block text-xs font-normal text-slate-700">Estaba a <strong>{{ elegida.marca.distanciaM | number:'1.0-0' }} m</strong> (se permite hasta {{ elegida.marca.radioM }} m).</span> }
              </dd></div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span class="badge" [ngClass]="elegida.marca.verificacion === 'VERIFICADA' ? 'badge-ok' : 'badge-warn'">{{ verificacion }}</span>
              @if (elegida.marca.precisionM !== null) { <span>Precisión del GPS: {{ elegida.marca.precisionM | number:'1.0-0' }} m</span> }
              <span>Desde {{ elegida.marca.origen === 'APP' ? 'la app' : 'la web' }}</span>
            </div>
            <div class="flex flex-wrap gap-3 text-xs">
              @if (puntoPersona) { <a class="font-bold text-easydry-blue underline" [href]="enlaceMapa(puntoPersona)" target="_blank" rel="noopener noreferrer">Dónde estaba (Google Maps)</a> }
              @if (puntoReferencia) { <a class="font-bold text-violet-700 underline" [href]="enlaceMapa(puntoReferencia)" target="_blank" rel="noopener noreferrer">Dónde está el lugar (Google Maps)</a> }
            </div>
          </dl>
        </div>
        @if (puntoPersona || puntoReferencia) {
          @for (id of [elegida.marca.id]; track id) { <app-rrhh-mapa-marca [persona]="puntoPersona" [referencia]="puntoReferencia" [radioM]="elegida.marca.radioM"></app-rrhh-mapa-marca> }
          <p class="text-[11px] text-slate-500"><span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:#0b4f9c"></span> Dónde estaba la persona ·
            <span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:#6d28d9"></span> Ubicación configurada hoy del lugar y su radio permitido. La distancia de arriba es la que se midió al timbrar.</p>
        } @else { <p class="text-xs text-slate-500">Esta marca no guardó coordenadas para mostrar en el mapa.</p> }
      </div>
    }
  `,
})
export class RrhhMarcaDetalleComponent implements OnChanges {
  @Input() elegida: MarcaElegida | null = null;
  private readonly almacenamiento = inject(StorageUploadService);

  readonly zona = ZONA_ECUADOR;
  readonly etiquetas = ETIQUETA_PUNTUALIDAD;
  foto = '';
  errorFoto = '';
  puntoPersona: Punto | null = null;
  puntoReferencia: Punto | null = null;

  get lugar(): string { return this.elegida ? lugarDe(this.elegida.marca) : ''; }
  get verificacion(): string { return this.elegida ? (ETIQUETA_VERIFICACION[this.elegida.marca.verificacion] ?? this.elegida.marca.verificacion) : ''; }
  enlaceMapa(p: Punto): string { return `https://www.google.com/maps?q=${p.lat},${p.lng}`; }

  async ngOnChanges(): Promise<void> {
    this.foto = '';
    this.errorFoto = '';
    const m = this.elegida?.marca;
    this.puntoPersona = m && m.latitud !== null && m.longitud !== null ? { lat: m.latitud, lng: m.longitud } : null;
    const s = m?.sitio;
    this.puntoReferencia = s && s.latitud != null && s.longitud != null ? { lat: s.latitud, lng: s.longitud } : null;
    if (!m) return;
    try {
      const url = await this.almacenamiento.resolveMediaUrlStrict(m.fotoKey);
      if (this.elegida?.marca.id === m.id) this.foto = url;
    } catch (e) {
      if (this.elegida?.marca.id === m.id) this.errorFoto = `No se pudo cargar la foto: ${mensajeEstado(MediaError.desde(e).estado)}`;
    }
  }
}

// ───────────────────────── Historial de una persona ─────────────────────────

@Component({
  selector: 'app-rrhh-historial',
  standalone: true,
  imports: [CommonModule, FormsModule, RrhhMarcaCeldaComponent],
  template: `
    <div class="space-y-3">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" role="group" aria-label="Conteos y filtro por estado">
        @for (t of tarjetas; track t.id) {
          <button type="button" class="text-left rounded-xl border p-3 transition-colors" [ngClass]="filtro === t.id ? 'border-easydry-blue ring-1 ring-easydry-blue bg-slate-50' : 'border-slate-200 hover:border-slate-300'" (click)="filtro = filtro === t.id ? '' : t.id" [attr.aria-pressed]="filtro === t.id">
            <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{{ t.nombre }}</span>
            <span class="block text-2xl font-extrabold font-outfit" [ngClass]="t.color" [attr.data-conteo]="t.id || 'TODOS'">{{ t.valor }}</span>
            @if (t.nota) { <span class="block text-[11px] text-slate-500">{{ t.nota }}</span> }
          </button>
        }
      </div>
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="field-label" [attr.for]="uid + '-estado'">Estado</label>
          <select [id]="uid + '-estado'" class="field" [(ngModel)]="filtro">
            @for (o of filtros; track o.id) { <option [value]="o.id">{{ o.nombre }}</option> }
          </select>
        </div>
        <p class="text-xs text-slate-500 pb-2">{{ visibles.length }} día(s). Pulsa una marca para ver la foto y el mapa.</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-xs text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-3 font-bold">Fecha</th><th class="py-2 pr-3 font-bold">Horario</th><th class="py-2 pr-3 font-bold">Entrada</th><th class="py-2 pr-3 font-bold">Salida</th><th class="py-2 pr-3 font-bold">Horas trabajadas</th><th class="py-2 font-bold">Estado del día</th>
          </tr></thead>
          <tbody>
            @for (d of visibles; track d.dia) {
              <tr class="border-b border-slate-100 align-top">
                <td class="py-2 pr-3 whitespace-nowrap">{{ d.dia | date:'EEE dd/MM' }}</td>
                <td class="py-2 pr-3 font-mono text-xs whitespace-nowrap">{{ d.horario ? d.horario.entrada + '–' + d.horario.salida : '—' }}</td>
                <td class="py-2 pr-3"><app-rrhh-marca-celda [marca]="d.entrada" [puntualidad]="d.puntualidadEntrada" [minutos]="d.minutosEntrada" [tolerancia]="tolerancia" (ver)="ver.emit($event)"></app-rrhh-marca-celda></td>
                <td class="py-2 pr-3"><app-rrhh-marca-celda [marca]="d.salida" [puntualidad]="d.puntualidadSalida" [minutos]="d.minutosSalida" [tolerancia]="tolerancia" (ver)="ver.emit($event)"></app-rrhh-marca-celda></td>
                <td class="py-2 pr-3 font-mono text-xs">@if (d.horasReales !== null) { {{ d.horasReales | number:'1.1-2' }} h } @else { — }</td>
                <td class="py-2"><span class="badge" [ngClass]="dia(d).clase">{{ dia(d).nombre }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="py-8 text-center text-sm text-slate-500">No hay días con ese estado en este periodo.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class RrhhHistorialComponent {
  @Input() filas: readonly FilaDia[] = [];
  @Input() tolerancia = 10;
  @Output() ver = new EventEmitter<MarcaElegida>();

  readonly uid = `historial-${Math.random().toString(36).slice(2, 8)}`;
  readonly filtros = FILTROS_DIA;
  filtro: FiltroDia = '';

  get conteo(): ConteoPuntualidad { return contarPuntualidad(this.filas); }
  get visibles(): FilaDia[] { return this.filas.filter((f) => pasaFiltroDia(f, this.filtro)); }
  dia(d: FilaDia) { return ETIQUETA_ESTADO_DIA[d.estado]; }

  get tarjetas(): Array<{ id: FiltroDia; nombre: string; valor: number; color: string; nota?: string }> {
    const c = this.conteo;
    return [
      { id: 'ATRASADO', nombre: 'Veces atrasado', valor: c.atrasos, color: 'text-rose-700', nota: `${c.minutosAtraso} min acumulados` },
      { id: 'A_TIEMPO', nombre: 'A tiempo', valor: c.entradasATiempo, color: 'text-emerald-700' },
      { id: 'MUY_ANTES', nombre: 'Muy antes', valor: c.entradasMuyAntes, color: 'text-sky-700' },
      { id: 'SALIDA_MUY_ANTES', nombre: 'Salió muy antes', valor: c.salidasMuyAntes, color: 'text-amber-700' },
      { id: 'INCOMPLETO', nombre: 'Incompletos', valor: c.incompletos, color: 'text-amber-700' },
      { id: 'SIN_MARCA', nombre: 'Sin marca', valor: c.sinMarca, color: 'text-slate-700' },
    ];
  }
}
