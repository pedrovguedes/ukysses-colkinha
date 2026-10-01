/* Colinha do Mito · Ulysses Moraes 20022
 * A colinha é montada no aparelho da pessoa. Os números digitados não são enviados nem guardados.
 * Dados dos candidatos: TSE · DivulgaCandContas (candidatos.json; o que faltar é consultado ao vivo em /tse).
 */
(() => {
  'use strict';

  // ---------- Configuração ----------
  const CONFIG = {
    SITE: 'tropadoulysses.com/colinha', // endereço impresso no rodapé da colinha
    SITE_PADRAO: 'colinhadomito.com.br',
    UF: 'MT',
    UF_NOME: 'MATO GROSSO',
    ANO: 2026,
    ELEICAO: '20322002026',          // "Eleição Geral Federal 2026" no DivulgaCandContas
    DADOS_URL: 'candidatos.json',
    TSE_PROXY: 'tse',                // relativo ao <base href="/colinha/">: /colinha/tse → TSE (vercel.json)
    ARQUIVO: 'colinha-ulysses-moraes-20022.png',
  };

  const OFFICES = [
    { id: 'f',  cod: '6', label: 'Deputado federal',  digits: 4 },
    { id: 'e',  cod: '7', label: 'Deputado estadual', digits: 5, fixed: '20022', nome: 'Ulysses Moraes', partido: 'PODEMOS', foto: 'ulysses-moraes.webp' },
    { id: 's1', cod: '5', label: 'Senador · 1º voto', digits: 3 },
    { id: 's2', cod: '5', label: 'Senador · 2º voto', digits: 3 },
    { id: 'g',  cod: '3', label: 'Governador',        digits: 2 },
    { id: 'p',  cod: '1', label: 'Presidente',        digits: 2, fixed: '22', nome: 'Flávio Bolsonaro', partido: 'PL', foto: 'flavio-bolsonaro.webp' },
  ];
  const EDITABLE = OFFICES.filter(o => !o.fixed);

  const THEMES = {
    verde: {
      bg: '#009f4d', title: '#0b0e1f', em: '#fff200', emShadow: '#000000',
      pill: '#1c2140', pillInk: '#ffffff',
      card: '#ffffff', cardShadow: '#000000', cardLine: '#0b0e1f',
      cargo: '#007a3b', ink: '#13162b', muted: '#4a5068', warn: '#b42318',
      box: '#ffffff', boxLine: '#6b7285', fixBox: '#fff200', fixLine: '#0b0e1f',
      rowAlt: '#f2f6f0', line: '#d6ddd3', foot: '#0b0e1f', photo: '#eeeeee', gray: false,
    },
    marinho: {
      bg: '#1c2140', title: '#ffffff', em: '#fff200', emShadow: '#000000',
      pill: '#009f4d', pillInk: '#0b0e1f',
      card: '#ffffff', cardShadow: '#000000', cardLine: '#0b0e1f',
      cargo: '#007a3b', ink: '#13162b', muted: '#4a5068', warn: '#b42318',
      box: '#ffffff', boxLine: '#6b7285', fixBox: '#fff200', fixLine: '#0b0e1f',
      rowAlt: '#f2f6f0', line: '#d6ddd3', foot: '#ffffff', photo: '#eeeeee', gray: false,
    },
    papel: {
      bg: '#ffffff', title: '#111111', em: '#111111', emShadow: null,
      pill: '#111111', pillInk: '#ffffff',
      card: '#ffffff', cardShadow: null, cardLine: '#111111',
      cargo: '#111111', ink: '#111111', muted: '#444444', warn: '#111111',
      box: '#ffffff', boxLine: '#111111', fixBox: '#ffffff', fixLine: '#111111',
      rowAlt: '#ffffff', line: '#bbbbbb', foot: '#111111', photo: '#f2f6f0', gray: true,
    },
  };

  const PREVIA = !!window.__PREVIA__;
  const TSE_DIRETO = 'https://divulgacandcontas.tse.jus.br/divulga/rest';
  // Aparelho e navegador: muda o jeito de salvar a imagem
  const UA = navigator.userAgent || '';
  const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|FB4A|FBMD|Messenger|WhatsApp|TikTok|musical_ly|Bytedance|Kwai|Snapchat|Line\/|Twitter|LinkedInApp|Pinterest|GSA\//i.test(UA);
  const IOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const state = {
    data: null,
    live: {},
    values: {},
    found: {},
    pending: {},
    seq: {},
    dataReady: Promise.resolve(),
    model: 'verde',
    blob: null,
    url: null,
    downloads: (window.claude && typeof window.claude.use === 'function')
      ? window.claude.use('downloads').catch(() => null)
      : Promise.resolve(null),
  };

  // ---------- Medição anônima (Meta Pixel): só o nome da ação e o modelo, nunca os números ----------
  function track(acao) {
    try { if (typeof window.fbq === 'function') window.fbq('trackCustom', 'Colinha', { acao, modelo: state.model }); } catch (_) { /* sem Pixel */ }
  }

  // ---------- Nomes do TSE ----------
  const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du']);
  const GRAFIA = { 'FLAVIO BOLSONARO': 'Flávio Bolsonaro' };
  function nomeBonito(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (GRAFIA[s.toUpperCase()]) return GRAFIA[s.toUpperCase()];
    return s.toLowerCase().split(' ').map((w, i) =>
      i > 0 && MINUSCULAS.has(w) ? w : w.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')
    ).join(' ');
  }
  function peso(sit) {
    sit = String(sit || '');
    if (/ren[uú]ncia|cancelad|falecid|cassad|n[aã]o conhecid/i.test(sit)) return 3;
    if (/^indeferido/i.test(sit)) return 2;
    if (sit && !/^deferido/i.test(sit)) return 1;
    return 0;
  }
  function compactar(lista) {
    const m = {};
    for (const c of lista || []) {
      const num = String(c.numero);
      const sit = c.descricaoSituacao || '';
      if (m[num] && peso(m[num][3]) <= peso(sit)) continue;
      const e = [nomeBonito(c.nomeUrna), (c.partido && c.partido.sigla) || '', String(c.id)];
      if (sit && sit !== 'Deferido') e.push(sit);
      m[num] = e;
    }
    return m;
  }

  // ---------- Busca ----------
  const ufDe = cod => (cod === '1' ? 'BR' : CONFIG.UF);
  const fotoProxy = (id, cod) => `${CONFIG.TSE_PROXY}/arquivo/img/${CONFIG.ELEICAO}/${id}/${ufDe(cod)}`;
  const fotoDireta = (id, cod) => `${TSE_DIRETO}/arquivo/img/${CONFIG.ELEICAO}/${id}/${ufDe(cod)}`;

  function candidato(arr, o, numero) {
    return { numero, nome: arr[0], partido: arr[1], id: arr[2], situacao: arr[3] || 'Deferido' };
  }
  function listaAoVivo(cod) {
    if (!state.live[cod]) {
      state.live[cod] = (async () => {
        const caminho = `/v1/candidatura/listar/${CONFIG.ANO}/${ufDe(cod)}/${CONFIG.ELEICAO}/${cod}/candidatos`;
        for (const base of [CONFIG.TSE_PROXY, TSE_DIRETO]) {
          try {
            const r = await fetch(base + caminho, { headers: { accept: 'application/json' } });
            if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.candidatos)) return compactar(j.candidatos); }
          } catch (_) { /* tenta a próxima */ }
        }
        return null;
      })();
    }
    return state.live[cod];
  }
  async function buscar(o, numero) {
    await state.dataReady;
    const base = state.data && state.data.cargos && state.data.cargos[o.cod];
    if (base && base[numero]) return candidato(base[numero], o, numero);
    if (PREVIA) return null;
    const vivo = await listaAoVivo(o.cod);
    return vivo && vivo[numero] ? candidato(vivo[numero], o, numero) : null;
  }

  // ---------- Formulário ----------
  const ICONE_PESSOA = '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>';

  function rowHTML(o) {
    if (o.fixed) {
      return `
        <div class="row-photo has-photo" style="background-image:url('${esc(o.foto)}')" aria-hidden="true">${ICONE_PESSOA}</div>
        <div class="row-info">
          <span class="row-cargo">${esc(o.label)}</span>
          <span class="row-name">${esc(o.nome)}</span>
          <span class="row-meta lock">${esc(o.partido)} · Já está na sua colinha</span>
        </div>
        <div class="digits" role="img" aria-label="Número ${esc(o.fixed)}">${[...o.fixed].map(d => `<span class="digit">${d}</span>`).join('')}</div>`;
    }
    const inputs = Array.from({ length: o.digits }, (_, i) =>
      `<input class="digit" id="${o.id}-${i}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" aria-label="${esc(o.label)}, dígito ${i + 1} de ${o.digits}">`
    ).join('');
    return `
      <div class="row-photo" aria-hidden="true">${ICONE_PESSOA}</div>
      <div class="row-info">
        <label class="row-cargo" for="${o.id}-0">${esc(o.label)}</label>
        <span class="row-name placeholder" id="${o.id}-name">Digite o número</span>
        <span class="row-meta" id="${o.id}-meta" aria-live="polite">Em branco se ficar vazio</span>
      </div>
      <div class="digits">${inputs}</div>`;
  }

  function montarCedula() {
    const cont = $('#rows');
    for (const o of OFFICES) {
      const row = document.createElement('div');
      row.className = 'row' + (o.fixed ? ' fixed' : '');
      row.dataset.office = o.id;
      row.id = 'row-' + o.id;
      row.innerHTML = rowHTML(o);
      cont.appendChild(row);
    }
    for (const o of EDITABLE) {
      const inputs = digitosDe(o);
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          const v = inp.value.replace(/\D/g, '');
          if (v.length > 1) { espalhar(o, i, v); return; }
          inp.value = v;
          if (v && i < inputs.length - 1) inputs[i + 1].focus();
          mudou(o, v && i === inputs.length - 1);
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !inp.value && i > 0) {
            e.preventDefault(); inputs[i - 1].value = ''; inputs[i - 1].focus(); mudou(o, false);
          } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); inputs[i - 1].focus(); }
          else if (e.key === 'ArrowRight' && i < inputs.length - 1) { e.preventDefault(); inputs[i + 1].focus(); }
          else if (e.key.length === 1 && /\d/.test(e.key) && inp.value) { inp.value = ''; }
        });
        inp.addEventListener('focus', () => { try { inp.select(); } catch (_) { /* ok */ } });
        inp.addEventListener('paste', e => {
          const t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '');
          if (!t) return;
          e.preventDefault(); espalhar(o, i, t);
        });
      });
      atualizar(o);
    }
  }
  const digitosDe = o => [...document.querySelectorAll(`#row-${o.id} input.digit`)];
  function valorDe(o) { return digitosDe(o).map(i => i.value).join(''); }
  function espalhar(o, inicio, texto) {
    const inputs = digitosDe(o);
    let k = inicio;
    for (const ch of texto) { if (k >= inputs.length) break; inputs[k++].value = ch; }
    inputs[Math.min(k, inputs.length - 1)].focus();
    mudou(o, k >= inputs.length);
  }
  function preencher(o, v) {
    digitosDe(o).forEach((inp, i) => { inp.value = v[i] || ''; });
    mudou(o, false);
  }
  function proximaLinha(o) {
    const i = EDITABLE.indexOf(o);
    const prox = EDITABLE[i + 1];
    if (prox) digitosDe(prox)[0].focus();
    else document.activeElement && document.activeElement.blur();
  }
  function mudou(o, completou) {
    state.values[o.id] = valorDe(o);
    $('#form-message').textContent = '';
    const p = atualizar(o);
    if (o.cod === '5') atualizar(EDITABLE.find(x => x.cod === '5' && x.id !== o.id));
    if (completou) p.then(() => { if (valorDe(o).length === o.digits) proximaLinha(o); });
  }

  function repetidoSenador(o) {
    if (o.cod !== '5') return false;
    const outro = o.id === 's1' ? 's2' : 's1';
    const v = state.values[o.id];
    return !!v && v.length === o.digits && v === state.values[outro];
  }

  function pintarFoto(o, cand) {
    const el = $(`#row-${o.id} .row-photo`);
    el.classList.remove('has-photo');
    el.style.backgroundImage = '';
    if (!cand || !cand.id) return;
    const tentar = (urls) => {
      if (!urls.length) return;
      const img = new Image();
      img.onload = () => {
        if (state.found[o.id] !== cand) return;
        el.style.backgroundImage = `url("${urls[0]}")`;
        el.classList.add('has-photo');
      };
      img.onerror = () => tentar(urls.slice(1));
      img.src = urls[0];
    };
    tentar(PREVIA ? [] : [fotoProxy(cand.id, o.cod), fotoDireta(cand.id, o.cod)]);
  }

  function setRow(o, { name, placeholder, meta, metaClass, invalid }) {
    const n = $(`#${o.id}-name`), m = $(`#${o.id}-meta`), row = $(`#row-${o.id}`);
    n.textContent = name; n.classList.toggle('placeholder', !!placeholder);
    m.textContent = meta; m.className = 'row-meta' + (metaClass ? ' ' + metaClass : '');
    if (invalid) row.setAttribute('data-invalid', ''); else row.removeAttribute('data-invalid');
  }

  function situacaoTexto(sit) {
    const p = peso(sit);
    if (p === 3) return 'Candidatura retirada no TSE. O voto pode ser anulado.';
    if (p === 2) return `${sit} no TSE. O voto pode ser anulado.`;
    if (p === 1) return `${sit} no TSE.`;
    return '';
  }

  function atualizar(o) {
    const v = state.values[o.id] || '';
    const token = (state.seq[o.id] = (state.seq[o.id] || 0) + 1);
    state.found[o.id] = null;
    pintarFoto(o, null);
    if (!v) {
      setRow(o, { name: 'Digite o número', placeholder: true, meta: 'Em branco se ficar vazio' });
      return (state.pending[o.id] = Promise.resolve());
    }
    if (v.length < o.digits) {
      const f = o.digits - v.length;
      setRow(o, { name: 'Digite o número', placeholder: true, meta: `Falta${f > 1 ? 'm' : ''} ${f} dígito${f > 1 ? 's' : ''}` });
      return (state.pending[o.id] = Promise.resolve());
    }
    if (repetidoSenador(o) && o.id === 's2') {
      setRow(o, { name: 'Número repetido', placeholder: true, meta: 'Você já usou esse número no 1º voto', metaClass: 'warn', invalid: true });
      return (state.pending[o.id] = Promise.resolve());
    }
    setRow(o, { name: 'Procurando…', placeholder: true, meta: 'Base oficial do TSE' });
    const p = buscar(o, v).then(c => {
      if (token !== state.seq[o.id]) return;
      if (c) {
        state.found[o.id] = c;
        const aviso = situacaoTexto(c.situacao);
        setRow(o, { name: c.nome, meta: aviso ? `${c.partido} · ${aviso}` : c.partido, metaClass: aviso ? 'warn' : '' });
        pintarFoto(o, c);
      } else {
        setRow(o, { name: 'Número não encontrado', placeholder: true, meta: 'Confira o número. Esse voto pode ser anulado.', metaClass: 'warn', invalid: true });
      }
    }).catch(() => {
      if (token !== state.seq[o.id]) return;
      setRow(o, { name: 'Não deu para consultar', placeholder: true, meta: 'O número vai na colinha mesmo assim' });
    });
    return (state.pending[o.id] = p);
  }

  // ---------- Colinha (canvas 5 x 9 cm a 300 dpi) ----------
  const W = 591, H = 1063;
  const CX = 24, CY = 150, CW = 543, CH = 852, RH = 142, X0 = 162;

  function rr(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function espacado(x, texto, px, py, esp) {
    let cx = px;
    for (const ch of texto) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + esp; }
  }
  function largura(x, texto, esp) {
    let w = 0; for (const ch of texto) w += x.measureText(ch).width + esp; return w - esp;
  }
  function cortar(x, texto, max) {
    if (x.measureText(texto).width <= max) return texto;
    let t = texto;
    while (t.length > 1 && x.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }
  function siteRodape() {
    if (CONFIG.SITE) return CONFIG.SITE;
    const h = (location.hostname || '').replace(/^www\./, '');
    if (PREVIA || !h || h === 'localhost' || /^[\d.]+$/.test(h)) return CONFIG.SITE_PADRAO;
    return h;
  }

  function carregarImagem(src, cors) {
    return new Promise(res => {
      if (!src) return res(null);
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
  }
  function cinza(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    try {
      const d = x.getImageData(0, 0, c.width, c.height); const a = d.data;
      for (let i = 0; i < a.length; i += 4) { const g = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114; a[i] = a[i + 1] = a[i + 2] = g; }
      x.putImageData(d, 0, 0);
    } catch (_) { /* imagem de outro domínio: fica colorida */ }
    return c;
  }

  async function fotosDasLinhas() {
    return Promise.all(OFFICES.map(async o => {
      if (o.fixed) return carregarImagem(o.foto);
      const c = state.found[o.id];
      if (!c || !c.id || PREVIA) return null;
      // 1º pelo atalho /tse (mesmo domínio); 2º direto no TSE, só se ele liberar CORS (senão fica o ícone)
      return (await carregarImagem(fotoProxy(c.id, o.cod))) || carregarImagem(fotoDireta(c.id, o.cod), true);
    }));
  }

  function desenhar(fotos) {
    const T = THEMES[state.model] || THEMES.verde;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.textBaseline = 'alphabetic';

    x.fillStyle = T.bg; x.fillRect(0, 0, W, H);

    // Selo do topo
    const selo = `ELEIÇÕES 2026 · ${CONFIG.UF_NOME}`;
    x.font = '800 15px Archivo';
    const sw = largura(x, selo, 2) + 32;
    x.fillStyle = T.pill; rr(x, (W - sw) / 2, 24, sw, 32, 16); x.fill();
    x.fillStyle = T.pillInk; espacado(x, selo, (W - sw) / 2 + 16, 45, 2);

    // Título
    x.font = 'italic 900 58px Archivo';
    const a = 'Minha ', b = 'colinha.';
    const wa = x.measureText(a).width, wb = x.measureText(b).width;
    const tx = (W - wa - wb) / 2, ty = 118;
    x.fillStyle = T.title; x.fillText(a, tx, ty);
    if (T.emShadow) { x.fillStyle = T.emShadow; x.fillText(b, tx + wa + 3, ty + 3); }
    x.fillStyle = T.em; x.fillText(b, tx + wa, ty);
    if (T.emShadow) { x.lineWidth = 1; x.strokeStyle = T.emShadow; x.strokeText(b, tx + wa, ty); }

    // Cartão
    if (T.cardShadow) { x.fillStyle = T.cardShadow; rr(x, CX + 6, CY + 6, CW, CH, 24); x.fill(); }
    x.fillStyle = T.card; rr(x, CX, CY, CW, CH, 24); x.fill();
    x.save(); rr(x, CX, CY, CW, CH, 24); x.clip();

    OFFICES.forEach((o, i) => {
      const y = CY + i * RH;
      if (i % 2 === 1) { x.fillStyle = T.rowAlt; x.fillRect(CX, y, CW, RH); }
      if (i > 0) { x.fillStyle = T.line; x.fillRect(CX, y, CW, 1); }

      // Foto
      const px = 42, py = y + 21;
      x.save(); rr(x, px, py, 100, 100, 14); x.clip();
      x.fillStyle = T.photo; x.fillRect(px, py, 100, 100);
      const f = fotos[i];
      if (f) {
        const src = T.gray ? cinza(f) : f;
        // recorte quadrado; em foto vertical (padrão do TSE) puxa para cima para não cortar a cabeça
        const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
        const lado = Math.min(iw, ih);
        const sx = (iw - lado) / 2, sy = ih > iw ? (ih - lado) * 0.18 : (ih - lado) / 2;
        x.drawImage(src, sx, sy, lado, lado, px, py, 100, 100);
      } else {
        x.fillStyle = T.gray ? '#c9c9c9' : '#c5ccd6';
        x.beginPath(); x.arc(px + 50, py + 40, 17, 0, Math.PI * 2); x.fill();
        x.beginPath(); x.ellipse(px + 50, py + 92, 33, 26, 0, Math.PI, 0); x.fill();
      }
      x.restore();

      // Cargo
      x.fillStyle = T.cargo; x.font = '800 15px Archivo';
      espacado(x, o.label.toUpperCase(), X0, y + 34, 1);

      // Caixas
      const num = o.fixed || (state.values[o.id] && state.values[o.id].length === o.digits ? state.values[o.id] : '');
      for (let k = 0; k < o.digits; k++) {
        const bx = X0 + k * 58, by = y + 46;
        if (o.fixed) {
          x.fillStyle = T.fixBox; rr(x, bx, by, 50, 60, 6); x.fill();
          x.lineWidth = 3; x.strokeStyle = T.fixLine; rr(x, bx + 1.5, by + 1.5, 47, 57, 5); x.stroke();
        } else {
          x.fillStyle = T.box; rr(x, bx, by, 50, 60, 6); x.fill();
          x.lineWidth = 2; x.strokeStyle = T.boxLine; rr(x, bx + 1, by + 1, 48, 58, 5); x.stroke();
        }
        if (num[k]) {
          x.fillStyle = o.fixed ? '#0b0e1f' : T.ink;
          if (o.fixed && state.model === 'papel') x.fillStyle = '#111111';
          x.font = 'italic 900 40px Archivo'; x.textAlign = 'center';
          x.fillText(num[k], bx + 25, by + 45);
          x.textAlign = 'left';
        }
      }

      // Nome
      let nome, cor;
      if (o.fixed) { nome = `${o.nome} · ${o.partido}`; cor = T.ink; }
      else if (!num) { nome = 'Em branco'; cor = T.muted; }
      else if (state.found[o.id]) { nome = `${state.found[o.id].nome} · ${state.found[o.id].partido}`; cor = T.ink; }
      else { nome = 'Confira o número'; cor = T.warn; }
      x.font = '700 19px Archivo'; x.fillStyle = cor;
      x.fillText(cortar(x, nome, CX + CW - X0 - 18), X0, y + 128);
    });
    x.restore();
    x.lineWidth = 3; x.strokeStyle = T.cardLine; rr(x, CX + 1.5, CY + 1.5, CW - 3, CH - 3, 23); x.stroke();

    // Rodapé
    x.fillStyle = T.foot; x.textAlign = 'left';
    const r1 = 'LEVE EM PAPEL · CELULAR NÃO ENTRA NA CABINE';
    x.font = '800 14px Archivo';
    espacado(x, r1, (W - largura(x, r1, 1)) / 2, 1029, 1);
    x.font = '500 13px Archivo'; x.textAlign = 'center';
    x.fillText(siteRodape(), W / 2, 1049);
    x.textAlign = 'left';
    return cv;
  }

  // PNG com 300 dpi gravado (para imprimir em 5 x 9 cm)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function com300dpi(blob) {
    try {
      const buf = new Uint8Array(await blob.arrayBuffer());
      const ppm = 11811;
      const chunk = new Uint8Array(21);
      const dv = new DataView(chunk.buffer);
      dv.setUint32(0, 9);
      chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
      dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
      dv.setUint32(17, crc32(chunk.subarray(4, 17)));
      const fimIHDR = 8 + 25; // assinatura + IHDR
      const out = new Uint8Array(buf.length + 21);
      out.set(buf.subarray(0, fimIHDR), 0);
      out.set(chunk, fimIHDR);
      out.set(buf.subarray(fimIHDR), fimIHDR + 21);
      return new Blob([out], { type: 'image/png' });
    } catch (_) { return blob; }
  }

  async function fontesProntas() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all(['italic 900 58px Archivo', '800 15px Archivo', '700 19px Archivo', '500 13px Archivo'].map(f => document.fonts.load(f)));
    } catch (_) { /* fonte reserva */ }
  }

  async function gerar() {
    await fontesProntas();
    const fotos = await fotosDasLinhas();
    const cv = desenhar(fotos);
    let blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    blob = await com300dpi(blob);
    if (state.url) URL.revokeObjectURL(state.url);
    state.blob = blob;
    state.url = URL.createObjectURL(blob);
    // data: em vez de blob: para o "tocar e segurar > Salvar imagem" funcionar também em navegadores de app
    const dataUrl = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(state.url); f.readAsDataURL(blob); });
    $('#result-img').src = dataUrl;
    $('#print-img').src = dataUrl;
  }

  // ---------- Janelas e ações ----------
  function abrir(d) {
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
    else d.setAttribute('open', '');
  }
  function fechar(d) {
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }
  let statusTimer = 0;
  function status(t, fixo) {
    const el = $('#status'); el.textContent = t;
    clearTimeout(statusTimer);
    if (!fixo) statusTimer = setTimeout(() => { el.textContent = ''; }, 7000);
  }
  const DICA_APP = 'Para salvar: toque e segure na colinha e escolha "Salvar imagem". Se não aparecer, toque em ⋯ e escolha "Abrir no navegador".';

  function linkAtual() {
    const p = new URLSearchParams();
    for (const o of EDITABLE) { const v = state.values[o.id]; if (v && v.length === o.digits) p.set(o.id, v); }
    p.set('m', state.model);
    return `${location.origin}${location.pathname}#${p.toString()}`;
  }
  async function copiar(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) { return false; }
  }

  async function compartilhar() {
    track('compartilhar');
    const texto = `Minha colinha: Ulysses Moraes 20022 para Deputado Estadual e Flávio Bolsonaro 22 para Presidente. Faça a sua: ${location.origin}${location.pathname}`;
    if (state.blob && navigator.canShare) {
      const arq = new File([state.blob], CONFIG.ARQUIVO, { type: 'image/png' });
      if (navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], text: texto }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Minha colinha', text: texto, url: linkAtual() }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    await copiarLink(true);
  }
  async function baixar() {
    if (!state.blob) return;
    track('baixar');
    if (PREVIA) {
      const dl = await state.downloads;
      if (dl) {
        try { await dl.save({ filename: CONFIG.ARQUIVO, data: state.blob }); status('Colinha salva.'); }
        catch (e) { if (!e || e.code !== 'declined') status('Não deu para salvar aqui. Toque e segure a imagem para salvar.'); }
        return;
      }
    }
    // iPhone e navegadores de app (Instagram, Facebook, WhatsApp): a folha do sistema tem "Salvar imagem" → galeria
    if ((IOS || IN_APP) && navigator.canShare) {
      const arq = new File([state.blob], CONFIG.ARQUIVO, { type: 'image/png' });
      if (navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq] }); status('Pronto. Se escolheu "Salvar imagem", ela está na sua galeria.'); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
    }
    // Navegador de app sem folha de compartilhar: download bloqueado pelo app
    if (IN_APP) { status(DICA_APP, true); $('#result-img').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    // Android e computador: download direto
    const a = document.createElement('a');
    a.href = state.url; a.download = CONFIG.ARQUIVO; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    status(IOS ? 'Colinha baixada em Arquivos > Downloads. Para a galeria, toque e segure na imagem e escolha "Salvar imagem".'
               : 'Colinha baixada. Ela está na pasta Downloads do aparelho.');
  }
  function imprimir() {
    track('imprimir');
    if (IN_APP) { status('Para imprimir, abra no navegador: toque em ⋯ e escolha "Abrir no navegador". Ou salve a colinha e imprima a imagem.', true); return; }
    window.print();
  }
  async function copiarLink(doCompartilhar) {
    if (!doCompartilhar) track('copiar_link');
    const l = linkAtual();
    if (await copiar(l)) { $('#manual-copy').hidden = true; status('Link copiado.'); return; }
    const box = $('#manual-copy'); box.hidden = false;
    const inp = $('#manual-copy-input'); inp.value = l; inp.focus(); inp.select();
    status('Copie o link acima.');
  }

  function marcarModelo() {
    document.querySelectorAll('.model').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.model === state.model)));
  }

  // ---------- Início ----------
  function validar() {
    for (const o of EDITABLE) {
      const v = state.values[o.id] || '';
      if (v && v.length < o.digits) {
        $('#form-message').textContent = `Complete o número de ${o.label.toLowerCase()} ou apague para deixar em branco.`;
        digitosDe(o)[v.length].focus();
        return false;
      }
      if (o.id === 's2' && repetidoSenador(o)) {
        $('#form-message').textContent = 'Os dois votos para senador precisam ser em candidatos diferentes.';
        digitosDe(o)[0].focus();
        return false;
      }
    }
    return true;
  }
  async function aoGerar(e) {
    if (e) e.preventDefault();
    if (!validar()) return;
    const btn = $('#generate'); btn.disabled = true;
    try {
      await Promise.all(Object.values(state.pending));
      await gerar();
      $('#manual-copy').hidden = true;
      if (IN_APP) status(DICA_APP, true);
      else status(PREVIA && !(await state.downloads) ? 'Toque e segure a imagem para salvar.' : '', true);
      abrir($('#result'));
      track('gerar');
    } catch (_) {
      $('#form-message').textContent = 'Não foi possível gerar a colinha. Tente de novo.';
    } finally { btn.disabled = false; }
  }

  function lerLink() {
    const h = (window.__colinhaHash || location.hash || '').replace(/^#/, '');
    if (!h) return;
    const p = new URLSearchParams(h);
    if (THEMES[p.get('m')]) state.model = p.get('m');
    for (const o of EDITABLE) {
      const v = (p.get(o.id) || '').replace(/\D/g, '').slice(0, o.digits);
      if (v) preencher(o, v);
    }
  }

  async function carregarDados() {
    if (window.__DADOS__) return window.__DADOS__;
    try { const r = await fetch(CONFIG.DADOS_URL, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (_) { /* sem base local */ }
    return null;
  }
  function dataBR(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Cuiaba' });
  }

  async function iniciar() {
    montarCedula();
    $('#ballot').addEventListener('submit', aoGerar);
    $('#act-share').addEventListener('click', compartilhar);
    $('#act-download').addEventListener('click', baixar);
    $('#act-print').addEventListener('click', imprimir);
    $('#act-link').addEventListener('click', () => copiarLink(false));
    $('#act-model').addEventListener('click', () => { marcarModelo(); abrir($('#models')); });
    document.querySelectorAll('.model').forEach(b => b.addEventListener('click', async () => {
      state.model = b.dataset.model; marcarModelo();
      fechar($('#models'));
      track('trocar_modelo');
      await gerar();
    }));
    document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => fechar(b.closest('dialog'))));
    document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) fechar(d); }));

    if (PREVIA) {
      $('#act-print').hidden = true;
      $('#act-link').hidden = true;
      $('#act-share').hidden = true;
      state.downloads.then(dl => { if (!dl) $('#act-download').hidden = true; else $('#act-download').className = 'btn btn-primary'; });
    }

    state.dataReady = carregarDados().then(d => {
      state.data = d;
      if (d && d.coletado_em) {
        $('#data-source').textContent = `Nomes, números e fotos dos candidatos: base oficial do TSE (DivulgaCandContas), atualizada em ${dataBR(d.coletado_em)}.`;
      }
    });
    lerLink();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
