// Filtro global de período e comparações.
import { hoje, somaDias, diasEntre, dataBR } from "./format.js?v=c59cb573";

export const PERIODOS = [
  ["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "Últimos 7 dias"], ["15d", "Últimos 15 dias"], ["30d", "Últimos 30 dias"],
  ["mes", "Este mês"], ["mes_ant", "Mês anterior"], ["custom", "Personalizado"],
];

export function intervalo(p) {
  const h = hoje();
  let ini, fim = h;
  switch (p.tipo) {
    case "hoje": ini = h; break;
    case "ontem": ini = fim = somaDias(h, -1); break;
    case "7d": ini = somaDias(h, -6); break;
    case "15d": ini = somaDias(h, -14); break;
    case "30d": ini = somaDias(h, -29); break;
    case "90d": ini = somaDias(h, -89); break;
    case "semana": { const d = new Date(h + "T12:00:00Z"); const dow = d.getUTCDay() || 7; ini = somaDias(h, -(dow - 1)); break; }
    case "semana_ant": { const d = new Date(h + "T12:00:00Z"); const dow = d.getUTCDay() || 7; fim = somaDias(h, -dow); ini = somaDias(fim, -6); break; }
    case "mes": ini = h.slice(0, 8) + "01"; break;
    case "mes_ant": { const m = somaDias(h.slice(0, 8) + "01", -1); ini = m.slice(0, 8) + "01"; fim = m; break; }
    case "custom": ini = p.inicio || somaDias(h, -29); fim = p.fim || h; if (ini > fim) [ini, fim] = [fim, ini]; break;
    default: ini = somaDias(h, -29);
  }
  return { inicio: ini, fim, dias: diasEntre(ini, fim) + 1, tipo: p.tipo };
}

export function anterior(iv) {
  if (iv.tipo === "mes") { const m = somaDias(iv.inicio, -1); return { inicio: m.slice(0, 8) + "01", fim: m, dias: diasEntre(m.slice(0, 8) + "01", m) + 1 }; }
  if (iv.tipo === "mes_ant") { const m = somaDias(iv.inicio, -1); return { inicio: m.slice(0, 8) + "01", fim: m, dias: diasEntre(m.slice(0, 8) + "01", m) + 1 }; }
  const fim = somaDias(iv.inicio, -1);
  return { inicio: somaDias(fim, -(iv.dias - 1)), fim, dias: iv.dias };
}

export const rotulo = (iv) => iv.inicio === iv.fim ? dataBR(iv.inicio) : `${dataBR(iv.inicio)} a ${dataBR(iv.fim)}`;
export const dentro = (data, iv) => !!data && data.slice(0, 10) >= iv.inicio && data.slice(0, 10) <= iv.fim;
export function dias(iv) { const out = []; for (let d = iv.inicio; d <= iv.fim; d = somaDias(d, 1)) out.push(d); return out; }
