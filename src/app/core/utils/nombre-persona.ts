/**
 * Nombre de una persona para mostrar: siempre primero los apellidos y luego los nombres.
 * Acepta usuarios del servidor (`name`/`lastname`) o con campos en español (`nombre`/`apellido`).
 * Quita el sufijo "(CI: ...)" que algunos apellidos antiguos traen pegado.
 */
export function nombreCompleto(
  persona: { name?: string | null; lastname?: string | null; nombre?: string | null; apellido?: string | null } | null | undefined,
): string {
  if (!persona) return '';
  return apellidosNombres(persona.lastname ?? persona.apellido, persona.name ?? persona.nombre);
}

/** Une apellidos y nombres (en ese orden) ignorando vacíos y el sufijo "(CI: ...)". */
export function apellidosNombres(apellidos?: string | null, nombres?: string | null): string {
  const limpio = (t?: string | null) => String(t ?? '').replace(/\(?CI:[^)]*\)?/g, '').trim();
  return [limpio(apellidos), limpio(nombres)].filter(Boolean).join(' ');
}
