// Conversión entre ISO (UTC, como guarda la DB) y el valor de
// <input type="datetime-local"> (hora LOCAL, formato "YYYY-MM-DDTHH:mm").

const pad = (n: number): string => String(n).padStart(2, '0');

// ISO (UTC) -> "YYYY-MM-DDTHH:mm" en hora local del navegador.
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "YYYY-MM-DDTHH:mm" (local) -> ISO UTC. new Date(local) interpreta el
// string sin zona como hora local; toISOString lo pasa a UTC.
export function toISO(local: string): string {
  return new Date(local).toISOString();
}
