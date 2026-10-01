#!/usr/bin/env node
// Atualiza candidatos.json com a base oficial do TSE (DivulgaCandContas).
// Deixe este arquivo na mesma pasta dos arquivos da colinha e rode:
//     node coletar-tse.mjs
// Requer Node 18 ou mais novo. Não precisa instalar nada.
// Este arquivo não precisa ir para o site.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UF = (process.argv[2] || 'MT').toUpperCase();
const ANO = 2026;
const ELEICAO_PADRAO = '20322002026'; // "Eleição Geral Federal 2026"
const SAIDA = join(dirname(fileURLToPath(import.meta.url)), 'candidatos.json');
const DESTAQUE = { id: '110002542636', numero: '20022' }; // Ulysses Moraes

const TSE = 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1';
const CARGOS = { '1': 'Presidente', '3': 'Governador', '5': 'Senador', '6': 'Deputado Federal', '7': 'Deputado Estadual' };
const CABECALHOS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9',
  'user-agent': 'Mozilla/5.0 (colinha; +https://divulgacandcontas.tse.jus.br)',
  referer: 'https://divulgacandcontas.tse.jus.br/divulga/',
};

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du']);
const GRAFIA = { 'FLAVIO BOLSONARO': 'Flávio Bolsonaro' }; // o TSE às vezes manda sem acento

function nomeBonito(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (GRAFIA[s.toUpperCase()]) return GRAFIA[s.toUpperCase()];
  return s.toLowerCase().split(' ').map((w, i) =>
    i > 0 && MINUSCULAS.has(w) ? w : w.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')
  ).join(' ');
}
function pesoSituacao(sit) {
  sit = String(sit || '');
  if (/ren[uú]ncia|cancelad|falecid|cassad|n[aã]o conhecid/i.test(sit)) return 3;
  if (/^indeferido/i.test(sit)) return 2;
  if (sit && !/^deferido/i.test(sit)) return 1;
  return 0;
}
// Lista do TSE -> { "70022": ["Pedro Neto", "AVANTE", "190002538606"] }; 4º item só se não for "Deferido"
function compactar(lista) {
  const m = {};
  for (const c of lista || []) {
    const num = String(c.numero);
    const sit = c.descricaoSituacao || '';
    if (m[num] && pesoSituacao(m[num][3]) <= pesoSituacao(sit)) continue;
    const e = [nomeBonito(c.nomeUrna), (c.partido && c.partido.sigla) || '', String(c.id)];
    if (sit && sit !== 'Deferido') e.push(sit);
    m[num] = e;
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => Number(a[0]) - Number(b[0])));
}

const esperar = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, tentativas = 4) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: CABECALHOS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      erro = e;
      await esperar(1500 * (i + 1));
    }
  }
  throw new Error(`${url} → ${erro && erro.message}`);
}

async function descobrirEleicao() {
  try {
    const lista = await getJSON(`${TSE}/eleicao/ordinarias`);
    const e = lista.find(x => x.ano === ANO && x.tipoAbrangencia === 'F');
    if (e) return String(e.id);
  } catch (e) {
    console.warn(`! Não consegui listar as eleições (${e.message}). Usando ${ELEICAO_PADRAO}.`);
  }
  return ELEICAO_PADRAO;
}

async function main() {
  const eleicao = await descobrirEleicao();
  console.log(`Eleição ${ANO}: ${eleicao} · UF ${UF}`);

  let anterior = null;
  try { anterior = JSON.parse(await readFile(SAIDA, 'utf8')); } catch (_) { /* primeira coleta */ }

  const cargos = {};
  let falhas = 0;
  for (const [cod, nome] of Object.entries(CARGOS)) {
    const uf = cod === '1' ? 'BR' : UF;
    try {
      const j = await getJSON(`${TSE}/candidatura/listar/${ANO}/${uf}/${eleicao}/${cod}/candidatos`);
      cargos[cod] = compactar(j.candidatos);
      console.log(`✓ ${nome.padEnd(18)} ${String(Object.keys(cargos[cod]).length).padStart(5)} candidatos`);
    } catch (e) {
      falhas++;
      const velho = anterior && anterior.uf === UF && anterior.cargos && anterior.cargos[cod];
      cargos[cod] = velho || {};
      console.warn(`! ${nome}: falhou (${e.message}). ${velho ? 'Mantive a lista anterior.' : 'Lista vazia.'}`);
    }
    await esperar(400);
  }

  if (UF === 'MT') {
    try {
      const c = await getJSON(`${TSE}/candidatura/buscar/${ANO}/MT/${eleicao}/candidato/${DESTAQUE.id}`);
      console.log(`★ ${c.nomeUrna} ${c.numero} · ${c.partido && c.partido.sigla} · ${c.descricaoSituacao} · CNPJ ${c.cnpjcampanha}`);
      if (String(c.numero) !== DESTAQUE.numero) console.warn('! Atenção: o número do Ulysses Moraes no TSE mudou. Confira OFFICES em app.js.');
    } catch (e) {
      console.warn(`! Não consegui conferir o Ulysses Moraes (${e.message}).`);
    }
  }

  await writeFile(SAIDA, JSON.stringify({
    fonte: 'TSE · DivulgaCandContas',
    eleicao,
    uf: UF,
    coletado_em: new Date().toISOString(),
    cargos,
  }));
  console.log(`\nPronto: candidatos.json atualizado${falhas ? ` (com ${falhas} falha(s))` : ''}. Suba esse arquivo para o site.`);
  if (falhas) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
