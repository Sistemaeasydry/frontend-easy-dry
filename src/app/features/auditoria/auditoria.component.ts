import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { AuditoriaService, ConsultaBitacoraApi, FiltrosAuditoria, RegistroAuditoriaApi } from '../../core/services/auditoria.service';
import { ToastService } from '../../shared/services/toast.service';
import { exportarAuditoriaExcel, exportarAuditoriaPdf, textoDeValor } from './auditoria-export';

type Pestana = 'registro' | 'bitacora';

const mensajeDe = (e: unknown, defecto: string): string => {
  const m = (e as { error?: { message?: string | string[] } } | null)?.error?.message;
  return Array.isArray(m) ? m.join(', ') : m ? String(m) : defecto;
};

const ETIQUETA_TIPO: Record<ConsultaBitacoraApi['tipo'], string> = { CONSULTA: 'Consulta', EXCEL: 'Exportó a Excel', PDF: 'Exportó a PDF' };

/**
 * Auditoría del sistema: quién hizo qué y cuándo, con el valor anterior y el nuevo. Cada rol ve solo las pantallas que tiene activas y los
 * cambios de su alcance (lo decide el servidor). Quien tiene el permiso puede exportar y ver quién consultó la auditoría.
 */
@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-5 animate-fade-in">
      <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-easydry">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold mb-2">
          <i-lucide name="history" class="w-3.5 h-3.5" aria-hidden="true"></i-lucide><span>Administración</span>
        </div>
        <h1 class="text-2xl font-extrabold text-slate-900 font-outfit">Auditoría</h1>
        <p class="text-slate-500 text-xs mt-1 max-w-2xl">Quién hizo qué y cuándo. Solo ves las pantallas que tu rol tiene activas y los cambios de tu alcance. Las contraseñas nunca se guardan.</p>
      </div>

      @if (verBitacora) {
        <div class="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Auditoría">
          <button type="button" role="tab" [attr.aria-selected]="pestana === 'registro'" class="px-4 min-h-11 text-sm font-bold border-b-2 -mb-px transition-colors" [ngClass]="pestana === 'registro' ? 'border-easydry-blue text-easydry-blue' : 'border-transparent text-slate-500 hover:text-slate-800'" (click)="pestana = 'registro'">Registro de cambios</button>
          <button type="button" role="tab" [attr.aria-selected]="pestana === 'bitacora'" class="px-4 min-h-11 text-sm font-bold border-b-2 -mb-px transition-colors" [ngClass]="pestana === 'bitacora' ? 'border-easydry-blue text-easydry-blue' : 'border-transparent text-slate-500 hover:text-slate-800'" (click)="abrirBitacora()">Quién consultó</button>
        </div>
      }

      @if (pestana === 'registro') {
        <section class="bg-white rounded-2xl border border-slate-100 shadow-easydry p-5 space-y-4" aria-label="Registro de cambios">
          <form class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end" (ngSubmit)="buscar()">
            <div>
              <label for="aud-modulo" class="block text-xs font-bold text-slate-700 uppercase mb-1">Pantalla</label>
              <select id="aud-modulo" name="modulo" [(ngModel)]="filtros.modulo" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold">
                <option [ngValue]="undefined">Todas</option>
                @for (m of modulos; track m.valor) { <option [ngValue]="m.valor">{{ m.etiqueta }}</option> }
              </select>
            </div>
            <div>
              <label for="aud-actor" class="block text-xs font-bold text-slate-700 uppercase mb-1">Quién</label>
              <input id="aud-actor" name="actor" type="text" maxlength="80" [(ngModel)]="filtros.actor" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold" placeholder="Nombre" />
            </div>
            <div>
              <label for="aud-texto" class="block text-xs font-bold text-slate-700 uppercase mb-1">Qué</label>
              <input id="aud-texto" name="texto" type="text" maxlength="80" [(ngModel)]="filtros.texto" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold" placeholder="Palabra del resumen" />
            </div>
            <div>
              <label for="aud-desde" class="block text-xs font-bold text-slate-700 uppercase mb-1">Desde</label>
              <input id="aud-desde" name="desde" type="date" [(ngModel)]="filtros.desde" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold" />
            </div>
            <div>
              <label for="aud-hasta" class="block text-xs font-bold text-slate-700 uppercase mb-1">Hasta</label>
              <input id="aud-hasta" name="hasta" type="date" [(ngModel)]="filtros.hasta" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold" />
            </div>
            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary flex-1" [disabled]="cargando">
                <i-lucide name="search" class="w-4 h-4" aria-hidden="true"></i-lucide><span>Buscar</span>
              </button>
              <button type="button" class="btn btn-secondary" (click)="limpiar()" [disabled]="cargando" title="Quitar filtros" aria-label="Quitar filtros">
                <i-lucide name="x" class="w-4 h-4" aria-hidden="true"></i-lucide>
              </button>
            </div>
          </form>

          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <p role="status">{{ total }} {{ total === 1 ? 'registro' : 'registros' }}</p>
            @if (puedeExportar) {
              <div class="flex gap-2">
                <button type="button" class="btn btn-secondary" (click)="exportar('EXCEL')" [disabled]="exportando || total === 0">
                  <i-lucide name="file-spreadsheet" class="w-4 h-4" aria-hidden="true"></i-lucide><span>Excel</span>
                </button>
                <button type="button" class="btn btn-secondary" (click)="exportar('PDF')" [disabled]="exportando || total === 0">
                  <i-lucide name="file-text" class="w-4 h-4" aria-hidden="true"></i-lucide><span>PDF</span>
                </button>
              </div>
            }
          </div>

          @if (error) { <p class="rounded-lg border border-rose-200 bg-rose-50 text-rose-800 p-3 text-xs font-semibold" role="alert">{{ error }}</p> }

          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-slate-500 uppercase border-b border-slate-200">
                  <th class="py-2 pr-3 font-bold">Fecha</th>
                  <th class="py-2 pr-3 font-bold">Quién</th>
                  <th class="py-2 pr-3 font-bold">Pantalla</th>
                  <th class="py-2 pr-3 font-bold">Qué pasó</th>
                  <th class="py-2 font-bold text-right"><span class="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                @for (f of filas; track f.id) {
                  <tr class="border-b border-slate-100 align-top">
                    <td class="py-2 pr-3 whitespace-nowrap">{{ f.fecha | date:'dd/MM/yyyy HH:mm:ss':zona }}</td>
                    <td class="py-2 pr-3"><span class="font-semibold text-slate-900">{{ f.actor }}</span><br /><span class="text-slate-500">{{ f.rol }}</span></td>
                    <td class="py-2 pr-3">{{ f.moduloNombre }}</td>
                    <td class="py-2 pr-3">{{ f.resumen }}</td>
                    <td class="py-2 text-right">
                      @if (tieneDetalle(f)) {
                        <button type="button" class="p-1.5 min-w-9 min-h-9 inline-flex items-center justify-center text-slate-500 hover:text-easydry-blue rounded-lg hover:bg-slate-100" [attr.aria-expanded]="abierto === f.id" [attr.aria-label]="abierto === f.id ? 'Ocultar el detalle' : 'Ver el detalle'" (click)="abierto = abierto === f.id ? null : f.id">
                          <i-lucide [name]="abierto === f.id ? 'chevron-up' : 'chevron-down'" class="w-4 h-4" aria-hidden="true"></i-lucide>
                        </button>
                      }
                    </td>
                  </tr>
                  @if (abierto === f.id) {
                    <tr class="bg-slate-50/70 border-b border-slate-100">
                      <td colspan="5" class="p-3">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                          @if (f.antes) { <div><p class="font-bold text-slate-700 mb-1">Antes</p><pre class="whitespace-pre-wrap break-words text-[11px] text-slate-700">{{ texto(f.antes) }}</pre></div> }
                          @if (f.despues) { <div><p class="font-bold text-slate-700 mb-1">Después</p><pre class="whitespace-pre-wrap break-words text-[11px] text-slate-700">{{ texto(f.despues) }}</pre></div> }
                          @if (!f.antes && !f.despues && f.datos) { <div class="md:col-span-2"><p class="font-bold text-slate-700 mb-1">Datos enviados</p><pre class="whitespace-pre-wrap break-words text-[11px] text-slate-700">{{ texto(f.datos) }}</pre></div> }
                        </div>
                      </td>
                    </tr>
                  }
                } @empty {
                  <tr><td colspan="5" class="py-8 text-center text-slate-500">{{ cargando ? 'Cargando…' : 'No hay registros con estos filtros.' }}</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (paginas > 1) {
            <div class="flex items-center justify-between gap-2 text-xs">
              <button type="button" class="btn btn-secondary" (click)="irA(pagina - 1)" [disabled]="pagina <= 1 || cargando">Anterior</button>
              <span>Página {{ pagina }} de {{ paginas }}</span>
              <button type="button" class="btn btn-secondary" (click)="irA(pagina + 1)" [disabled]="pagina >= paginas || cargando">Siguiente</button>
            </div>
          }
        </section>
      }

      @if (pestana === 'bitacora' && verBitacora) {
        <section class="bg-white rounded-2xl border border-slate-100 shadow-easydry p-5 space-y-3" aria-label="Quién consultó la auditoría">
          <p class="text-xs text-slate-600">Cada consulta y cada exportación de la auditoría queda aquí, con sus filtros.</p>
          @if (errorBitacora) { <p class="rounded-lg border border-rose-200 bg-rose-50 text-rose-800 p-3 text-xs font-semibold" role="alert">{{ errorBitacora }}</p> }
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-slate-500 uppercase border-b border-slate-200">
                  <th class="py-2 pr-3 font-bold">Fecha</th><th class="py-2 pr-3 font-bold">Quién</th><th class="py-2 pr-3 font-bold">Qué hizo</th><th class="py-2 pr-3 font-bold">Filas</th><th class="py-2 font-bold">Filtros</th>
                </tr>
              </thead>
              <tbody>
                @for (c of bitacora; track c.id) {
                  <tr class="border-b border-slate-100 align-top">
                    <td class="py-2 pr-3 whitespace-nowrap">{{ c.fecha | date:'dd/MM/yyyy HH:mm:ss':zona }}</td>
                    <td class="py-2 pr-3"><span class="font-semibold text-slate-900">{{ c.usuario }}</span><br /><span class="text-slate-500">{{ c.rol }}</span></td>
                    <td class="py-2 pr-3">{{ etiquetaTipo(c.tipo) }}</td>
                    <td class="py-2 pr-3">{{ c.filas }}</td>
                    <td class="py-2 text-slate-600">{{ texto(c.filtros) || 'Sin filtros' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="py-8 text-center text-slate-500">{{ cargandoBitacora ? 'Cargando…' : 'Todavía no hay consultas.' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
})
export class AuditoriaComponent implements OnInit {
  private readonly api = inject(AuditoriaService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly zona = '-0500';
  pestana: Pestana = 'registro';
  modulos: Array<{ valor: string; etiqueta: string }> = [];
  filtros: FiltrosAuditoria = { tamano: 50 };
  filas: RegistroAuditoriaApi[] = [];
  total = 0;
  pagina = 1;
  tamano = 50;
  abierto: string | null = null;
  cargando = false;
  exportando = false;
  error = '';

  bitacora: ConsultaBitacoraApi[] = [];
  cargandoBitacora = false;
  errorBitacora = '';

  get puedeExportar(): boolean { return this.auth.puede('auditoria.exportar'); }
  get verBitacora(): boolean { return this.auth.puede('auditoria.bitacora'); }
  get paginas(): number { return Math.max(1, Math.ceil(this.total / this.tamano)); }

  ngOnInit(): void {
    this.api.opciones().subscribe({ next: (o) => (this.modulos = o.modulos), error: () => (this.modulos = []) });
    this.buscar();
  }

  texto(v: unknown): string { return textoDeValor(v); }
  etiquetaTipo(t: ConsultaBitacoraApi['tipo']): string { return ETIQUETA_TIPO[t] ?? t; }
  tieneDetalle(f: RegistroAuditoriaApi): boolean { return !!(f.antes || f.despues || f.datos); }

  private filtrosLimpios(): FiltrosAuditoria {
    const f = this.filtros;
    return {
      ...(f.modulo ? { modulo: f.modulo } : {}),
      ...(f.actor?.trim() ? { actor: f.actor.trim() } : {}),
      ...(f.texto?.trim() ? { texto: f.texto.trim() } : {}),
      ...(f.desde ? { desde: f.desde } : {}),
      ...(f.hasta ? { hasta: f.hasta } : {}),
    };
  }

  buscar(): void { this.irA(1); }

  limpiar(): void {
    this.filtros = { tamano: this.tamano };
    this.buscar();
  }

  irA(pagina: number): void {
    this.cargando = true;
    this.error = '';
    this.api.listar({ ...this.filtrosLimpios(), pagina, tamano: this.tamano }).subscribe({
      next: (r) => {
        this.filas = r.filas;
        this.total = r.total;
        this.pagina = r.pagina;
        this.abierto = null;
        this.cargando = false;
      },
      error: (e) => {
        this.cargando = false;
        this.error = mensajeDe(e, 'No se pudo cargar la auditoría.');
      },
    });
  }

  exportar(formato: 'EXCEL' | 'PDF'): void {
    if (this.exportando) return;
    this.exportando = true;
    this.api.exportar(this.filtrosLimpios(), formato).subscribe({
      next: async (r) => {
        try {
          if (formato === 'EXCEL') await exportarAuditoriaExcel(r.filas);
          else exportarAuditoriaPdf(r.filas);
          if (r.recortado) this.toast.warning('Exportación recortada', `Se exportaron las ${r.total} filas más recientes. Acota las fechas para ver el resto.`);
        } finally {
          this.exportando = false;
        }
      },
      error: (e) => {
        this.exportando = false;
        this.toast.error('No se pudo exportar', mensajeDe(e, 'El servidor no aceptó la exportación.'));
      },
    });
  }

  abrirBitacora(): void {
    this.pestana = 'bitacora';
    this.cargandoBitacora = true;
    this.errorBitacora = '';
    this.api.bitacora().subscribe({
      next: (b) => { this.bitacora = b; this.cargandoBitacora = false; },
      error: (e) => { this.cargandoBitacora = false; this.errorBitacora = mensajeDe(e, 'No se pudo cargar la bitácora.'); },
    });
  }
}
