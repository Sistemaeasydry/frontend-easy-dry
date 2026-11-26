import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../shared/services/toast.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { AuthService } from '../../core/services/auth.service';
import { AjusteHorarioApi, CambioAjusteApi, CambioHorarioApi, DiaHorario, HorarioEquipoApi, RrhhService } from '../../core/services/rrhh.service';
import { FiltroPersonal, RrhhFiltroPersonalComponent, pasaFiltroPersonal, sinFiltroPersonal } from './rrhh-filtro-personal.component';
import { NOMBRES_DIA, copiarSemana, etiquetaDia, problemaDeSemana, proximosFinesDeSemana, resumenSemana, semanasIguales } from './rrhh.modelos';

const mensajeDe = (e: unknown, defecto: string): string => {
  const m = (e as { error?: { message?: string | string[] } } | null)?.error?.message;
  return Array.isArray(m) ? m.join(', ') : m ? String(m) : defecto;
};

/** Mañana en Ecuador (AAAA-MM-DD): el día desde el que rige cualquier cambio de horario. */
const manana = (): string => new Date(Date.now() - 5 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);

/**
 * RRHH · Horarios del personal. Cada persona tiene un horario por día de la semana (por defecto 08:00 a 17:00 los siete días) con un
 * interruptor «trabaja ese día»: un día desactivado no se puede timbrar. Solo ADMIN y SUPER_ADMIN lo editan; cada cambio rige desde mañana,
 * pide un motivo y queda en el historial (quién, cuándo, el horario anterior y el nuevo). Lo ya pasado no se toca.
 */
@Component({
  selector: 'app-rrhh-horarios',
  standalone: true,
  imports: [RrhhFiltroPersonalComponent, CommonModule, FormsModule, LucideAngularModule, ModalComponent],
  template: `
    <section class="bg-white rounded-2xl border border-slate-100 shadow-easydry p-5 space-y-4" aria-label="Horarios del personal">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="font-extrabold text-slate-900">Horarios del personal</h2>
          @if (ajuste) {
            <p class="text-xs text-slate-600 mt-1">
              Tolerancia de puntualidad: <strong>±{{ ajuste.toleranciaMin }} min</strong>. Antes de las 12:00 la marca es entrada; desde las 12:00, salida.
              @if (ajuste.proximoCambio) { <span class="badge badge-info ml-1">Desde el {{ ajuste.proximoCambio.vigenteDesde | date:'dd/MM/yyyy' }}: ±{{ ajuste.proximoCambio.toleranciaMin }} min</span> }
            </p>
          }
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <app-rrhh-filtro-personal [filtro]="filtroPersonal" (filtroChange)="filtroPersonal = $event"></app-rrhh-filtro-personal>
          <div>
            <label class="field-label" for="hor-buscar">Buscar</label>
            <input id="hor-buscar" type="search" class="field" [(ngModel)]="busqueda" placeholder="Nombre o rol">
          </div>
          @if (puedeAjustes) {
            <button type="button" class="btn btn-secondary" (click)="abrirAjustes()"><i-lucide name="settings" class="w-4 h-4" aria-hidden="true"></i-lucide> Tolerancia</button>
          }
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-xs text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-3 font-bold">Persona</th><th class="py-2 pr-3 font-bold">Rol</th><th class="py-2 pr-3 font-bold">Horario vigente</th><th class="py-2 pr-3 font-bold">Cambio programado</th><th class="py-2 pr-3 font-bold">Fines de semana activados</th><th class="py-2 font-bold text-right">Acciones</th>
          </tr></thead>
          <tbody>
            @for (p of visibles; track p.id) {
              <tr class="border-b border-slate-100 align-top">
                <td class="py-2 pr-3 font-semibold text-slate-900">{{ p.nombre }}</td>
                <td class="py-2 pr-3 text-xs text-slate-600">{{ p.rol }}</td>
                <td class="py-2 pr-3">
                  @for (l of resumen(p.semana); track l) { <p class="text-xs font-mono">{{ l }}</p> }
                  @if (p.porDefecto) { <span class="badge badge-neutral">Por defecto</span> }
                </td>
                <td class="py-2 pr-3">
                  @if (p.proximoCambio) {
                    <p class="text-xs font-bold text-easydry-blue">Desde el {{ p.proximoCambio.vigenteDesde | date:'dd/MM/yyyy' }}</p>
                    @for (l of resumen(p.proximoCambio.semana); track l) { <p class="text-xs font-mono">{{ l }}</p> }
                  } @else { <span class="text-slate-400">—</span> }
                </td>
                <td class="py-2 pr-3">
                  @for (f of p.finesDeSemana; track f.id) {
                    <p class="text-xs font-mono flex items-center gap-1.5">
                      <span>{{ etiqueta(f.fecha) }} · {{ f.entrada }}–{{ f.salida }}</span>
                      @if (puedeEditar && !f.hoy) {
                        <button type="button" class="text-rose-700 hover:text-rose-900 font-bold px-1" (click)="quitarFinDeSemana(f.id)" [attr.aria-label]="'Quitar ' + etiqueta(f.fecha)" title="Quitar este día">✕</button>
                      }
                    </p>
                  } @empty { <span class="text-slate-400">—</span> }
                </td>
                <td class="py-2 text-right whitespace-nowrap">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="abrirHistorial(p)"><i-lucide name="history" class="w-3.5 h-3.5" aria-hidden="true"></i-lucide> Ver historial</button>
                  @if (puedeEditar) {
                    <button type="button" class="btn btn-primary btn-sm ml-1" (click)="abrirEditar(p)"><i-lucide name="edit-2" class="w-3.5 h-3.5" aria-hidden="true"></i-lucide> Editar horario</button>
                    <button type="button" class="btn btn-secondary btn-sm ml-1" (click)="abrirFinesDeSemana(p)"><i-lucide name="calendar" class="w-3.5 h-3.5" aria-hidden="true"></i-lucide> Activar fin de semana</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="py-8 text-center text-sm text-slate-500">{{ cargando ? 'Cargando…' : 'No hay personas con esos filtros.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-slate-500">Un día desactivado es un día sin horario: la persona no puede timbrar ese día. Los cambios rigen desde mañana y los días anteriores no se modifican.</p>
    </section>

    <!-- Editar el horario de una persona -->
    <app-modal [isOpen]="!!editando" [title]="editando ? 'Editar horario · ' + editando.nombre : ''" icon="clock" size="lg" (close)="cerrarEditar()">
      @if (editando) {
        <div class="space-y-4">
          <p class="text-xs rounded-lg border border-sky-200 bg-sky-50 text-sky-900 p-2.5">El nuevo horario rige desde <strong>mañana ({{ hasta | date:'dd/MM/yyyy' }})</strong>. El horario actual y los días anteriores quedan guardados tal como están.</p>
          <div class="space-y-2">
            @for (d of form; track $index; let i = $index) {
              <div class="grid grid-cols-[110px_auto_1fr_1fr] items-center gap-3 border-b border-slate-100 pb-2">
                <span class="text-sm font-bold text-slate-800">{{ nombres[i] }}</span>
                <label class="inline-flex items-center gap-2 text-xs font-bold text-slate-700 min-h-11">
                  <input type="checkbox" [(ngModel)]="d.trabaja" [attr.aria-label]="'Trabaja el ' + nombres[i]"> Trabaja
                </label>
                <div>
                  <label class="field-label" [for]="'hor-e-' + i">Entrada</label>
                  <input [id]="'hor-e-' + i" type="time" class="field" [(ngModel)]="d.entrada" [disabled]="!d.trabaja">
                </div>
                <div>
                  <label class="field-label" [for]="'hor-s-' + i">Salida</label>
                  <input [id]="'hor-s-' + i" type="time" class="field" [(ngModel)]="d.salida" [disabled]="!d.trabaja">
                </div>
              </div>
            }
          </div>
          <button type="button" class="btn btn-secondary btn-sm" (click)="copiarLunes()">Copiar el lunes a todos los días</button>
          <div>
            <label class="field-label" for="hor-motivo">Motivo del cambio *</label>
            <textarea id="hor-motivo" class="field" rows="2" maxlength="300" [(ngModel)]="motivo" placeholder="Ej. cambio de turno acordado con RRHH"></textarea>
          </div>
          @if (error) { <p class="text-xs font-semibold text-rose-700" role="alert">{{ error }}</p> }
        </div>
      }
      <div modal-footer class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="cerrarEditar()">Cancelar</button>
        <button type="button" class="btn btn-primary" (click)="guardarHorario()" [disabled]="guardando">{{ guardando ? 'Guardando…' : 'Guardar horario' }}</button>
      </div>
    </app-modal>

    <!-- Activar fines de semana solo por esas fechas -->
    <app-modal [isOpen]="!!activando" [title]="activando ? 'Activar fin de semana · ' + activando.nombre : ''" icon="calendar" size="lg" (close)="activando = null">
      @if (activando) {
        <div class="space-y-4">
          <p class="text-xs rounded-lg border border-sky-200 bg-sky-50 text-sky-900 p-2.5">
            Marca los sábados o domingos que esta persona trabajará <strong>solo esas veces</strong>: después vuelve a quedar libre. Su horario semanal no cambia y rige desde mañana ({{ hasta | date:'dd/MM/yyyy' }}).
            Para activar o desactivar un día de forma permanente usa <strong>Editar horario</strong>.
          </p>
          <div class="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            @for (f of fechasFin; track f.fecha) {
              <label class="inline-flex items-center gap-2 text-sm min-h-11" [class.opacity-50]="!!f.motivoNo">
                <input type="checkbox" [checked]="elegidas.has(f.fecha)" [disabled]="!!f.motivoNo" (change)="alternarFecha(f.fecha)" [attr.aria-label]="etiqueta(f.fecha)">
                <span class="font-semibold text-slate-800">{{ etiqueta(f.fecha) }}</span>
                @if (f.motivoNo) { <span class="text-[11px] text-slate-500">({{ f.motivoNo }})</span> }
              </label>
            }
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label" for="fin-e">Entrada</label>
              <input id="fin-e" type="time" class="field" [(ngModel)]="finEntrada">
            </div>
            <div>
              <label class="field-label" for="fin-s">Salida</label>
              <input id="fin-s" type="time" class="field" [(ngModel)]="finSalida">
            </div>
          </div>
          <div>
            <label class="field-label" for="fin-motivo">Motivo *</label>
            <textarea id="fin-motivo" class="field" rows="2" maxlength="300" [(ngModel)]="motivo" placeholder="Ej. inventario de fin de mes"></textarea>
          </div>
          @if (error) { <p class="text-xs font-semibold text-rose-700" role="alert">{{ error }}</p> }
        </div>
      }
      <div modal-footer class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="activando = null">Cancelar</button>
        <button type="button" class="btn btn-primary" (click)="guardarFinesDeSemana()" [disabled]="guardando || elegidas.size === 0">{{ guardando ? 'Guardando…' : 'Activar ' + elegidas.size + (elegidas.size === 1 ? ' día' : ' días') }}</button>
      </div>
    </app-modal>

    <!-- Historial de una persona -->
    <app-modal [isOpen]="!!viendo" [title]="viendo ? 'Historial de horario · ' + viendo.nombre : ''" icon="history" size="lg" (close)="viendo = null">
      @if (viendo) {
        <div class="space-y-3">
          @for (c of historial; track c.id) {
            <div class="rounded-xl border border-slate-200 p-3 text-xs space-y-1">
              <p class="font-bold text-slate-900">{{ c.creadoEn | date:'dd/MM/yyyy HH:mm':zona }} · {{ c.actor }}</p>
              <p>Rige desde el <strong>{{ c.vigenteDesde | date:'dd/MM/yyyy' }}</strong> · Motivo: {{ c.motivo }}</p>
              <div class="grid sm:grid-cols-2 gap-2 pt-1">
                <div><p class="font-bold text-slate-500">Antes</p>@for (l of resumen(c.anterior); track l) { <p class="font-mono">{{ l }}</p> }</div>
                <div><p class="font-bold text-slate-500">Después</p>@for (l of resumen(c.dias); track l) { <p class="font-mono">{{ l }}</p> }</div>
              </div>
            </div>
          } @empty {
            <p class="py-6 text-center text-sm text-slate-500">{{ cargandoHistorial ? 'Cargando…' : 'Aún no hay cambios: esta persona tiene el horario por defecto.' }}</p>
          }
        </div>
      }
      <div modal-footer class="flex justify-end"><button type="button" class="btn btn-secondary" (click)="viendo = null">Cerrar</button></div>
    </app-modal>

    <!-- Tolerancia -->
    <app-modal [isOpen]="ajustando" title="Tolerancia de puntualidad" icon="settings" size="lg" (close)="ajustando = false">
      @if (ajustando) {
        <div class="space-y-4">
          <p class="text-xs rounded-lg border border-sky-200 bg-sky-50 text-sky-900 p-2.5">Vale para todo el personal y rige desde <strong>mañana ({{ hasta | date:'dd/MM/yyyy' }})</strong>. Los días anteriores se siguen evaluando con los valores que tenían.</p>
          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="field-label" for="aj-tol">Tolerancia de puntualidad (5 a 20 min) *</label>
              <input id="aj-tol" type="number" class="field" min="5" max="20" step="1" [(ngModel)]="tolerancia">
              <p class="text-[11px] text-slate-500 mt-1">Dentro de ±{{ tolerancia }} min de la hora del horario, la marca es puntual.</p>
            </div>
          </div>
          <div>
            <label class="field-label" for="aj-motivo">Motivo del cambio *</label>
            <textarea id="aj-motivo" class="field" rows="2" maxlength="300" [(ngModel)]="motivo"></textarea>
          </div>
          @if (error) { <p class="text-xs font-semibold text-rose-700" role="alert">{{ error }}</p> }
          <div class="space-y-2 pt-2">
            <p class="text-xs font-extrabold uppercase tracking-wider text-slate-500">Historial</p>
            @for (c of historialAjustes; track c.id) {
              <div class="rounded-lg border border-slate-200 p-2.5 text-xs">
                <p class="font-bold text-slate-900">{{ c.creadoEn | date:'dd/MM/yyyy HH:mm':zona }} · {{ c.actor }} · desde el {{ c.vigenteDesde | date:'dd/MM/yyyy' }}</p>
                <p>@if (c.anterior) { Antes: ±{{ c.anterior.toleranciaMin }} min · }Después: ±{{ c.toleranciaMin }} min · Motivo: {{ c.motivo }}</p>
              </div>
            }
          </div>
        </div>
      }
      <div modal-footer class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="ajustando = false">Cancelar</button>
        <button type="button" class="btn btn-primary" (click)="guardarAjuste()" [disabled]="guardando">{{ guardando ? 'Guardando…' : 'Guardar ajuste' }}</button>
      </div>
    </app-modal>
  `,
})
export class RrhhHorariosComponent implements OnInit {
  private readonly api = inject(RrhhService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly zona = '-0500';
  readonly nombres = NOMBRES_DIA;
  readonly resumen = resumenSemana;
  readonly hasta = manana();

  personas: HorarioEquipoApi[] = [];
  ajuste: AjusteHorarioApi | null = null;
  busqueda = '';
  filtroPersonal: FiltroPersonal = sinFiltroPersonal();
  cargando = false;

  puedeEditar = false;
  puedeAjustes = false;

  editando: HorarioEquipoApi | null = null;
  form: DiaHorario[] = [];
  motivo = '';
  error = '';
  guardando = false;

  readonly etiqueta = etiquetaDia;
  activando: HorarioEquipoApi | null = null;
  fechasFin: Array<{ fecha: string; motivoNo: string }> = [];
  elegidas = new Set<string>();
  finEntrada = '08:00';
  finSalida = '17:00';

  viendo: HorarioEquipoApi | null = null;
  historial: CambioHorarioApi[] = [];
  cargandoHistorial = false;

  ajustando = false;
  tolerancia = 10;
  ventana = 120;
  historialAjustes: CambioAjusteApi[] = [];

  ngOnInit(): void {
    this.puedeEditar = this.auth.puede('rrhh-timbradas.horarios.editar') || this.auth.puede('rrhh.horarios.gestionar');
    this.puedeAjustes = this.auth.puede('rrhh-timbradas.horarios.ajustes') || this.auth.puede('rrhh.horarios.gestionar');
    this.cargar();
  }

  get visibles(): HorarioEquipoApi[] {
    const q = this.busqueda.trim().toLowerCase();
    return this.personas.filter((p) => pasaFiltroPersonal(p, this.filtroPersonal) && (!q || `${p.nombre} ${p.rol}`.toLowerCase().includes(q)));
  }

  cargar(): void {
    this.cargando = true;
    this.api.horariosEquipo().subscribe({
      next: (r) => { this.personas = r.personas; this.ajuste = r.ajuste; this.cargando = false; },
      error: () => { this.cargando = false; },
    });
  }

  // ───────────────────────── Horario de una persona ─────────────────────────

  abrirEditar(p: HorarioEquipoApi): void {
    this.editando = p;
    // Se parte de lo que rige hoy, o del cambio ya programado si lo hay (así no se pisa sin querer).
    this.form = copiarSemana(p.proximoCambio?.semana ?? p.semana);
    this.motivo = '';
    this.error = '';
  }

  cerrarEditar(): void { this.editando = null; }

  copiarLunes(): void {
    const lunes = this.form[0];
    this.form = this.form.map(() => ({ ...lunes }));
  }

  guardarHorario(): void {
    if (!this.editando || this.guardando) return;
    const problema = problemaDeSemana(this.form);
    if (problema) { this.error = problema; return; }
    if (this.motivo.trim().length < 5) { this.error = 'Escribe el motivo del cambio (mínimo 5 caracteres).'; return; }
    if (semanasIguales(this.form, this.editando.proximoCambio?.semana ?? this.editando.semana)) { this.error = 'No cambiaste nada del horario.'; return; }
    this.guardando = true;
    this.error = '';
    const persona = this.editando;
    this.api.editarHorario(persona.id, this.form, this.motivo.trim()).subscribe({
      next: (r) => {
        this.guardando = false;
        this.editando = null;
        this.toast.success('Horario guardado', r.mensaje);
        this.cargar();
      },
      error: (e) => { this.guardando = false; this.error = mensajeDe(e, 'No se pudo guardar el horario.'); },
    });
  }

  // ───────────────────────── Fines de semana solo por fecha ─────────────────────────

  abrirFinesDeSemana(p: HorarioEquipoApi): void {
    const semana = p.proximoCambio?.semana ?? p.semana;
    const ya = new Set(p.finesDeSemana.map((f) => f.fecha));
    // Los próximos 8 fines de semana (16 días) desde mañana; no se ofrecen los ya activados ni los que su horario semanal ya trabaja.
    this.fechasFin = proximosFinesDeSemana(this.hasta, 16).map((fecha) => {
      const trabaja = semana[new Date(`${fecha}T00:00:00.000Z`).getUTCDay() === 6 ? 5 : 6]?.trabaja;
      return { fecha, motivoNo: ya.has(fecha) ? 'ya activado' : trabaja ? 'ya trabaja ese día' : '' };
    });
    this.elegidas = new Set();
    this.finEntrada = '08:00';
    this.finSalida = '17:00';
    this.motivo = '';
    this.error = '';
    this.activando = p;
  }

  alternarFecha(fecha: string): void {
    const n = new Set(this.elegidas);
    if (n.has(fecha)) n.delete(fecha); else n.add(fecha);
    this.elegidas = n;
  }

  guardarFinesDeSemana(): void {
    if (!this.activando || this.guardando) return;
    if (this.elegidas.size === 0) { this.error = 'Elige al menos un día.'; return; }
    if (!this.finEntrada || !this.finSalida || this.finEntrada >= this.finSalida) { this.error = 'La salida debe ser posterior a la entrada.'; return; }
    if (this.motivo.trim().length < 5) { this.error = 'Escribe el motivo (mínimo 5 caracteres).'; return; }
    this.guardando = true;
    this.error = '';
    this.api.activarFinesDeSemana(this.activando.id, [...this.elegidas].sort(), this.finEntrada, this.finSalida, this.motivo.trim()).subscribe({
      next: (r) => {
        this.guardando = false;
        this.activando = null;
        this.toast.success('Fin de semana activado', r.mensaje);
        this.cargar();
      },
      error: (e) => { this.guardando = false; this.error = mensajeDe(e, 'No se pudo activar el fin de semana.'); },
    });
  }

  quitarFinDeSemana(id: string): void {
    this.api.quitarFinDeSemana(id).subscribe({
      next: (r) => { this.toast.success('Día quitado', r.mensaje); this.cargar(); },
      error: (e) => this.toast.error('No se pudo quitar', mensajeDe(e, 'No se pudo quitar el día.')),
    });
  }

  abrirHistorial(p: HorarioEquipoApi): void {
    this.viendo = p;
    this.historial = [];
    this.cargandoHistorial = true;
    this.api.historialHorario(p.id).subscribe({
      next: (h) => { this.historial = h; this.cargandoHistorial = false; },
      error: () => { this.cargandoHistorial = false; },
    });
  }

  // ───────────────────────── Ajuste general ─────────────────────────

  abrirAjustes(): void {
    const a = this.ajuste?.proximoCambio ?? this.ajuste;
    this.tolerancia = a?.toleranciaMin ?? 10;
    this.ventana = a?.ventanaMin ?? 120;
    this.motivo = '';
    this.error = '';
    this.ajustando = true;
    this.api.historialAjustes().subscribe({ next: (h) => (this.historialAjustes = h) });
  }

  guardarAjuste(): void {
    if (this.guardando) return;
    const t = Number(this.tolerancia);
    const v = Math.max(this.ventana, t);
    if (!Number.isInteger(t) || t < 5 || t > 20) { this.error = 'La tolerancia debe ser un número entero entre 5 y 20 minutos.'; return; }
    if (this.motivo.trim().length < 5) { this.error = 'Escribe el motivo del cambio (mínimo 5 caracteres).'; return; }
    this.guardando = true;
    this.error = '';
    this.api.editarAjuste(t, v, this.motivo.trim()).subscribe({
      next: (r) => {
        this.guardando = false;
        this.ajustando = false;
        this.ajuste = r;
        this.toast.success('Ajuste guardado', r.mensaje);
      },
      error: (e) => { this.guardando = false; this.error = mensajeDe(e, 'No se pudo guardar el ajuste.'); },
    });
  }
}
