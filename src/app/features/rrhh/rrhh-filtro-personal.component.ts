import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface FiltroPersonal {
  departamento: '' | 'OPERADOR' | 'ADMINISTRACION';
  nivel: '' | 'JUNIOR' | 'SENIOR';
}

export const sinFiltroPersonal = (): FiltroPersonal => ({ departamento: '', nivel: '' });

/** ¿La persona cumple los filtros de departamento (categoría de su rol) y nivel? */
export function pasaFiltroPersonal(persona: { departamento?: string | null; nivel?: string | null }, filtro: FiltroPersonal): boolean {
  return (!filtro.departamento || persona.departamento === filtro.departamento) && (!filtro.nivel || persona.nivel === filtro.nivel);
}

let siguienteId = 0;

/** Filtros «Departamento» y «Nivel» de Timbradas, Horarios y Tareas. */
@Component({
  selector: 'app-rrhh-filtro-personal',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'contents' },
  template: `
    <div>
      <label class="field-label" [attr.for]="uid + '-dep'">Departamento</label>
      <select [id]="uid + '-dep'" class="field" [ngModel]="filtro.departamento" (ngModelChange)="cambiar({ departamento: $event })">
        <option value="">Todos</option>
        <option value="OPERADOR">Operativo</option>
        <option value="ADMINISTRACION">Administrativo</option>
      </select>
    </div>
    <div>
      <label class="field-label" [attr.for]="uid + '-niv'">Nivel</label>
      <select [id]="uid + '-niv'" class="field" [ngModel]="filtro.nivel" (ngModelChange)="cambiar({ nivel: $event })">
        <option value="">Todos</option>
        <option value="JUNIOR">Junior</option>
        <option value="SENIOR">Senior</option>
      </select>
    </div>
  `,
})
export class RrhhFiltroPersonalComponent {
  readonly uid = `filtro-personal-${siguienteId++}`;
  @Input({ required: true }) filtro!: FiltroPersonal;
  @Output() filtroChange = new EventEmitter<FiltroPersonal>();

  cambiar(cambio: Partial<FiltroPersonal>): void {
    this.filtroChange.emit({ ...this.filtro, ...cambio });
  }
}
