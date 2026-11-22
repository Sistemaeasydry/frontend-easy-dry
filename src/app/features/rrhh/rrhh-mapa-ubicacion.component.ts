import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import type { Map as MapaGL, Marker as MarcadorGL } from 'maplibre-gl';

export interface PuntoMapa { lat: number; lng: number }

/** Centro inicial (Ecuador) cuando todavía no hay un punto elegido. */
const CENTRO_INICIAL: PuntoMapa = { lat: -1.8312, lng: -78.1834 };

/** Estilo vectorial de OpenFreeMap (gratis, sin clave, uso comercial permitido). Otras opciones: `bright`, `positron`. */
const ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/liberty';
const URL_BUSCADOR = 'https://nominatim.openstreetmap.org/search';
/** Sugerencias mientras se escribe: Photon (OpenStreetMap) está hecho para eso; Nominatim no lo permite. Caja de Ecuador: oeste, sur, este, norte. */
const URL_SUGERENCIAS = 'https://photon.komoot.io/api/';
const CAJA_ECUADOR = '-81.1,-5.1,-75.1,1.5';
const PAUSA_ESCRITURA_MS = 400;

/** Marcador propio (pin en SVG, color de la pantalla de RRHH): no depende de imágenes externas. */
function crearElementoMarcador(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'marcador-ubicacion';
  el.innerHTML = `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="17" cy="41" rx="7" ry="2.5" fill="rgba(15,23,42,.28)"/>
    <path d="M17 1C8.7 1 2 7.5 2 15.6 2 26.5 17 40 17 40s15-13.5 15-24.4C32 7.5 25.3 1 17 1z" fill="#6d28d9" stroke="#fff" stroke-width="2"/>
    <circle cx="17" cy="15.5" r="5.5" fill="#fff"/>
  </svg>`;
  return el;
}

const coordenadaValida = (v: number | null, max: number): v is number => v !== null && Number.isFinite(v) && Math.abs(v) <= max;

/**
 * Mapa para elegir la ubicación de una agencia o bodega: clic en el mapa o arrastrar el marcador, o escribir la latitud y la
 * longitud. Usa MapLibre GL con el mapa vectorial de OpenFreeMap y los buscadores Photon y Nominatim (OpenStreetMap): no necesitan
 * clave ni facturación. La librería se descarga solo al abrir el mapa y el mapa solo se crea cuando el recuadro se ve (vive en un modal).
 */
@Component({
  selector: 'app-rrhh-mapa-ubicacion',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-3">
      <!-- Buscador de lugares: escribes y pulsas Enter (o Buscar); eliges un resultado y el marcador salta ahí, luego lo ajustas en el mapa -->
      <div class="relative">
        <label [for]="id + '-buscar'" class="block text-xs font-bold text-violet-900 uppercase mb-1">Buscar un lugar</label>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <i-lucide name="search" class="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none" style="left: 0.75rem" aria-hidden="true"></i-lucide>
            <input [id]="id + '-buscar'" type="text" class="w-full p-2.5 border border-violet-300 rounded-xl text-sm bg-white" style="padding-left: 2.5rem" [(ngModel)]="busqueda" (ngModelChange)="alEscribir()" (keydown.escape)="sugerencias = []" (keydown.enter)="$event.preventDefault(); buscar()" name="ubic-buscar" placeholder="Escribe la dirección o el nombre del lugar…" autocomplete="off" role="combobox" aria-autocomplete="list" [attr.aria-expanded]="sugerencias.length > 0" [attr.aria-controls]="id + '-lista'" [disabled]="estado !== 'listo'">
          </div>
          <button type="button" class="btn btn-secondary" (click)="buscar()" [disabled]="estado !== 'listo' || buscando">Buscar</button>
        </div>
        @if (sugerencias.length) {
          <ul [id]="id + '-lista'" role="listbox" class="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" style="z-index: 2000">
            @for (sg of sugerencias; track sg.texto) {
              <li role="option">
                <button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 focus:bg-violet-50 focus:outline-none flex items-start gap-2" (click)="elegirSugerencia(sg)">
                  <i-lucide name="map-pin" class="w-4 h-4 text-violet-600 shrink-0 mt-0.5" aria-hidden="true"></i-lucide><span>{{ sg.texto }}</span>
                </button>
              </li>
            }
          </ul>
        } @else if (buscando) {
          <p class="text-[11px] text-slate-500 mt-1" role="status">Buscando…</p>
        }
      </div>

      <div class="relative rounded-xl overflow-hidden border border-violet-200 bg-white" style="height: 280px; isolation: isolate">
        <div #mapa class="absolute inset-0" role="application" aria-label="Mapa para elegir la ubicación de la agencia"></div>
        @if (estado !== 'listo') {
          <div class="absolute inset-0 flex items-center justify-center p-4 text-center bg-slate-50/95 text-xs font-semibold" [ngClass]="estado === 'cargando' ? 'text-slate-500' : 'text-amber-900'" role="status">
            @switch (estado) {
              @case ('error') { <span>{{ mensajeError }}</span> }
              @default { <span>Cargando el mapa…</span> }
            }
          </div>
        }
      </div>
      <p class="text-[11px] text-violet-900">Busca el lugar arriba y luego ajusta el punto: haz clic en el mapa o arrastra el marcador. Para girar el mapa arrastra con el botón derecho (o con dos dedos); la brújula lo vuelve al norte.</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label [for]="id + '-lat'" class="block text-xs font-bold text-violet-900 uppercase mb-1">Latitud</label>
          <input [id]="id + '-lat'" type="number" step="0.000001" class="w-full p-2.5 border border-violet-300 rounded-xl text-sm bg-white" [ngModel]="lat" (ngModelChange)="cambioManual('lat', $event)" name="ubic-lat" placeholder="-0.180653" inputmode="decimal">
        </div>
        <div>
          <label [for]="id + '-lng'" class="block text-xs font-bold text-violet-900 uppercase mb-1">Longitud</label>
          <input [id]="id + '-lng'" type="number" step="0.000001" class="w-full p-2.5 border border-violet-300 rounded-xl text-sm bg-white" [ngModel]="lng" (ngModelChange)="cambioManual('lng', $event)" name="ubic-lng" placeholder="-78.467834" inputmode="decimal">
        </div>
        <button type="button" class="btn btn-secondary" (click)="usarMiUbicacion()"><i-lucide name="map-pin" class="w-4 h-4" aria-hidden="true"></i-lucide> Usar mi ubicación</button>
      </div>
      @if (aviso) { <p class="text-xs font-semibold text-amber-900" role="status">{{ aviso }}</p> }
    </div>
  `,
})
export class RrhhMapaUbicacionComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() lat: number | null = null;
  @Input() lng: number | null = null;
  @Output() ubicacionChange = new EventEmitter<PuntoMapa>();
  @ViewChild('mapa', { static: true }) private contenedor!: ElementRef<HTMLDivElement>;

  readonly id = `mapa-${Math.random().toString(36).slice(2, 8)}`;
  estado: 'esperando' | 'cargando' | 'listo' | 'error' = 'esperando';
  mensajeError = '';
  aviso = '';
  busqueda = '';
  sugerencias: { texto: string; lat: number; lng: number }[] = [];
  buscando = false;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  /** Cada búsqueda lleva un número para descartar respuestas viejas que lleguen tarde. */
  private numeroBusqueda = 0;

  private mapa: MapaGL | null = null;
  private marcador: MarcadorGL | null = null;
  private libreria: typeof import('maplibre-gl') | null = null;
  private observador: ResizeObserver | null = null;
  private iniciado = false;
  private destruido = false;

  ngAfterViewInit(): void {
    // El formulario vive dentro de un modal: el mapa se crea cuando el recuadro tiene tamaño, es decir, cuando de verdad se ve.
    this.observador = new ResizeObserver(() => {
      const caja = this.contenedor.nativeElement;
      if (!caja.offsetWidth || !caja.offsetHeight) return;
      if (!this.iniciado) void this.iniciar();
      else this.mapa?.resize();
    });
    this.observador.observe(this.contenedor.nativeElement);
  }

  ngOnChanges(): void {
    // La ubicación cambió desde fuera (otra agencia o un guardado): el marcador la sigue.
    if (this.mapa && this.estado === 'listo') this.ponerMarcador(false);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.observador?.disconnect();
    this.mapa?.remove();
    this.mapa = null;
    this.marcador = null;
  }

  private async iniciar(): Promise<void> {
    this.iniciado = true;
    this.estado = 'cargando';
    try {
      const modulo = await import('maplibre-gl');
      // El módulo UMD puede venir con o sin `default` según el empaquetador.
      this.libreria = ((modulo as unknown as { default?: typeof modulo }).default ?? modulo) as typeof modulo;
      if (this.destruido) return;
      // MapLibre busca su worker junto al código empaquetado y no lo encuentra: se sirve como archivo propio (ver `angular.json`, assets).
      this.libreria.setWorkerUrl(new URL('assets/maplibre/maplibre-gl-worker.mjs', document.baseURI).href);
      const centro = this.punto ?? CENTRO_INICIAL;
      const mapa = new this.libreria.Map({
        container: this.contenedor.nativeElement,
        style: ESTILO_MAPA,
        center: [centro.lng, centro.lat],
        zoom: this.punto ? 16 : 6,
        attributionControl: { compact: true },
      });
      mapa.addControl(new this.libreria.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-left');
      mapa.on('click', (e) => this.elegir({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      this.mapa = mapa;
      let cargado = false;
      const fallar = (detalle: string) => {
        if (cargado || this.destruido) return;
        this.estado = 'error';
        this.mensajeError = `No se pudo cargar el mapa${detalle}. Puedes escribir la latitud y la longitud a mano.`;
      };
      mapa.once('load', () => { cargado = true; this.estado = 'listo'; this.ponerMarcador(true); });
      mapa.on('error', (ev) => {
        console.error('[mapa de ubicación]', ev.error ?? ev);
        // Un mosaico, un tipo de letra o un icono que falla no impide dibujar el mapa: solo se registra. Lo demás sí es un fallo.
        const recurso = (ev as { sourceId?: string; tile?: unknown }).sourceId || (ev as { tile?: unknown }).tile;
        if (!recurso) fallar(ev.error?.message ? ` (${String(ev.error.message).slice(0, 160)})` : '');
      });
      // Si en 15 segundos no termina de cargar (red caída, estilo inalcanzable), se avisa en vez de quedar «Cargando…» para siempre.
      setTimeout(() => fallar(' (tardó demasiado en responder; revisa tu conexión)'), 15000);
    } catch (e) {
      this.estado = 'error';
      this.mensajeError = e instanceof Error && /webgl/i.test(e.message)
        ? 'Este navegador no puede dibujar el mapa (WebGL desactivado). Escribe la latitud y la longitud a mano.'
        : 'No se pudo cargar el mapa. Escribe la latitud y la longitud a mano.';
    }
  }

  private get punto(): PuntoMapa | null {
    return coordenadaValida(this.lat, 90) && coordenadaValida(this.lng, 180) ? { lat: this.lat, lng: this.lng } : null;
  }

  /** Pone o mueve el marcador al punto actual; con `centrar` también acerca el mapa. */
  private ponerMarcador(centrar: boolean): void {
    const mapa = this.mapa;
    if (!mapa || !this.libreria) return;
    const p = this.punto;
    if (!p) { this.marcador?.remove(); this.marcador = null; return; }
    if (!this.marcador) {
      this.marcador = new this.libreria.Marker({ element: crearElementoMarcador(), anchor: 'bottom', draggable: true })
        .setLngLat([p.lng, p.lat])
        .addTo(mapa);
      this.marcador.on('dragend', () => {
        const q = this.marcador!.getLngLat();
        this.elegir({ lat: q.lat, lng: q.lng });
      });
    } else {
      this.marcador.setLngLat([p.lng, p.lat]);
    }
    if (centrar) mapa.jumpTo({ center: [p.lng, p.lat], zoom: 16 });
    else mapa.easeTo({ center: [p.lng, p.lat] });
  }

  private elegir(p: PuntoMapa): void {
    this.aviso = '';
    this.lat = Math.round(p.lat * 1e6) / 1e6;
    this.lng = Math.round(p.lng * 1e6) / 1e6;
    this.ponerMarcador(false);
    this.ubicacionChange.emit({ lat: this.lat, lng: this.lng });
  }

  // ───────────────────────── Buscador de lugares ─────────────────────────

  /** Mientras se escribe: espera una pausa (400 ms, mínimo 3 letras) y pide sugerencias a Photon. */
  alEscribir(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    const texto = this.busqueda.trim();
    if (texto.length < 3 || this.estado !== 'listo') { this.sugerencias = []; this.buscando = false; this.numeroBusqueda++; return; }
    this.temporizador = setTimeout(() => void this.sugerir(texto), PAUSA_ESCRITURA_MS);
  }

  private async sugerir(texto: string): Promise<void> {
    const numero = ++this.numeroBusqueda;
    this.buscando = true;
    this.aviso = '';
    try {
      const url = `${URL_SUGERENCIAS}?limit=5&bbox=${CAJA_ECUADOR}&q=${encodeURIComponent(texto)}`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const datos = (await resp.json()) as { features?: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, string | undefined> }> };
      if (numero !== this.numeroBusqueda) return;
      this.sugerencias = (datos.features ?? [])
        .map((f) => ({ texto: this.etiqueta(f.properties ?? {}), lng: Number(f.geometry?.coordinates?.[0]), lat: Number(f.geometry?.coordinates?.[1]) }))
        .filter((d) => d.texto && Number.isFinite(d.lat) && Number.isFinite(d.lng));
      if (!this.sugerencias.length) this.aviso = 'Sin sugerencias todavía: sigue escribiendo, pulsa «Buscar» o elige el punto en el mapa.';
    } catch {
      // Si las sugerencias fallan no se molesta: «Buscar» sigue funcionando con Nominatim.
      if (numero === this.numeroBusqueda) this.sugerencias = [];
    } finally {
      if (numero === this.numeroBusqueda) this.buscando = false;
    }
  }

  /** «Nombre, calle número, barrio, ciudad, provincia» sin repetir partes. */
  private etiqueta(p: Record<string, string | undefined>): string {
    const calle = [p['street'], p['housenumber']].filter(Boolean).join(' ');
    const partes = [p['name'], calle, p['district'], p['locality'], p['city'], p['state']].filter((x): x is string => !!x);
    return partes.filter((x, i) => partes.indexOf(x) === i).join(', ');
  }

  /**
   * Busca el texto en Nominatim (OpenStreetMap), acotado a Ecuador. Solo al pulsar Enter o «Buscar»: la política de uso de Nominatim
   * no permite buscar mientras se escribe (eso lo hace `sugerir` con Photon), y pide como máximo una consulta por segundo.
   */
  async buscar(): Promise<void> {
    const texto = this.busqueda.trim();
    if (this.temporizador) clearTimeout(this.temporizador);
    if (this.estado !== 'listo') return;
    if (texto.length < 4) { this.sugerencias = []; this.aviso = 'Escribe al menos 4 letras para buscar.'; return; }
    const numero = ++this.numeroBusqueda;
    this.buscando = true;
    this.aviso = '';
    try {
      const url = `${URL_BUSCADOR}?format=jsonv2&limit=5&countrycodes=ec&accept-language=es&q=${encodeURIComponent(texto)}`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const datos = (await resp.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      if (numero !== this.numeroBusqueda) return;
      this.sugerencias = datos
        .map((d) => ({ texto: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }))
        .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
      if (!this.sugerencias.length) this.aviso = 'No se encontró ese lugar. Prueba con otra dirección o elige el punto en el mapa.';
    } catch {
      if (numero !== this.numeroBusqueda) return;
      this.sugerencias = [];
      this.aviso = 'No se pudo buscar el lugar. Revisa tu conexión, o elige el punto en el mapa.';
    } finally {
      if (numero === this.numeroBusqueda) this.buscando = false;
    }
  }

  /** Lleva el marcador al lugar elegido y acerca el mapa; luego se ajusta a mano. */
  elegirSugerencia(sg: { texto: string; lat: number; lng: number }): void {
    this.sugerencias = [];
    this.busqueda = sg.texto;
    this.elegir({ lat: sg.lat, lng: sg.lng });
    this.mapa?.easeTo({ center: [sg.lng, sg.lat], zoom: 17 });
    this.aviso = 'Lugar encontrado. Ajusta el punto exacto arrastrando el marcador o haciendo clic en el mapa.';
  }

  cambioManual(campo: 'lat' | 'lng', valor: number | null): void {
    const v = valor === null || (valor as unknown) === '' ? null : Number(valor);
    if (campo === 'lat') this.lat = v; else this.lng = v;
    if (this.punto) { this.aviso = ''; this.ponerMarcador(true); this.ubicacionChange.emit(this.punto); }
  }

  usarMiUbicacion(): void {
    this.aviso = '';
    if (!navigator.geolocation) { this.aviso = 'Este navegador no permite obtener la ubicación.'; return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { this.elegir({ lat: pos.coords.latitude, lng: pos.coords.longitude }); this.mapa?.easeTo({ zoom: 17 }); },
      () => { this.aviso = 'No se pudo obtener tu ubicación. Da el permiso o elige el punto en el mapa.'; },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
}
