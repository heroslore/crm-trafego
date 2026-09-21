// Usuários, perfis e permissões (proteção de interface; o app é estático).
import { db } from "./db.js?v=02b90ebf";

const CHAVE = "crm-trafego-usuario";
export const PERMISSOES = {
  admin: { modulos: "*", editar: true },
  gestor: { modulos: ["dashboard", "hoje", "decisoes", "inbox", "campanhas", "anuncios", "criativos", "produtos", "publicos", "leads", "vendas", "financeiro", "testes", "planejamento", "tarefas", "calendario", "relatorios", "concorrentes", "briefings", "ideias", "calculadoras", "config"], editar: true },
  marketing: { modulos: ["dashboard", "hoje", "decisoes", "inbox", "campanhas", "criativos", "produtos", "publicos", "testes", "planejamento", "tarefas", "calendario", "relatorios", "concorrentes", "briefings", "ideias", "calculadoras"], editar: true },
  criador: { modulos: ["hoje", "criativos", "produtos", "tarefas", "calendario", "briefings", "ideias"], editar: true },
  vendedor: { modulos: ["hoje", "inbox", "leads", "vendas", "produtos", "tarefas", "calendario"], editar: true },
  visualizador: { modulos: "*", editar: false },
};

let atual = null;
export function carregarUsuario() {
  let id = ""; try { id = localStorage.getItem(CHAVE) || ""; } catch {}
  atual = (id && db.get("users", id)) || db.where("users", (u) => u.role === "admin" && u.active !== false)[0] || db.all("users")[0] || null;
  return atual;
}
export function usuario() { return atual; }
export function entrar(id) { const u = db.get("users", id); if (!u) return false; atual = u; try { localStorage.setItem(CHAVE, id); } catch {} return true; }
export function perfil() { return (atual && PERMISSOES[atual.role]) || PERMISSOES.visualizador; }
export function pode(modulo) { const p = perfil(); return p.modulos === "*" || p.modulos.includes(modulo); }
export function podeEditar() { return perfil().editar; }
export function ehAdmin() { return atual && atual.role === "admin"; }
