/**
 * JurSystem — Worker de recepção de cadastros de clientes
 * =========================================================================
 * Recebe o POST do formulário público (cadastro_cliente.html) e grava o
 * registro no Gist "caixa de entrada" que o JurSystem importa pelo botão
 * "📥 Importar cadastros do formulário" (Configurações).
 *
 * O token do GitHub fica APENAS aqui, como segredo do Worker. Nunca coloque
 * o token no formulário público.
 *
 * IMPLANTAÇÃO (uma vez, ~10 minutos):
 *   1. dash.cloudflare.com → Workers & Pages → Create Worker → cole este código.
 *   2. Settings → Variables and Secrets → adicione (tipo Secret):
 *        GH_TOKEN  = token clássico do GitHub com escopo "gist"
 *                    (github.com/settings/tokens/new?scopes=gist)
 *        GIST_ID   = id do Gist da caixa de entrada
 *                    (o mesmo "Gist ID do formulário" das Configurações do
 *                     JurSystem; já existe um configurado no seu sistema)
 *        FORM_KEY  = chave anti-spam; precisa ser idêntica à constante
 *                    FORM_KEY do cadastro_cliente.html (ex.: hpa-2026)
 *   3. Deploy. A URL ficará algo como:
 *        https://jursystem-cadastro.SEUUSUARIO.workers.dev
 *   4. Cole essa URL na constante API_URL do cadastro_cliente.html
 *      (ou envie o link ao cliente como ...?api=https://SUA-URL.workers.dev).
 *
 * ROTAS:
 *   GET  /          → healthcheck ("JurSystem intake OK")
 *   POST /cadastro  → { fkey, cliente } → grava no Gist → { ok, protocolo }
 *
 * LIMITAÇÕES CONHECIDAS (aceitáveis para formulário de escritório):
 *   - Gist não tem transação: dois envios no MESMO segundo podem competir.
 *   - Gist "secret" é não listado, mas acessível por quem tiver a URL bruta
 *     completa; importe com frequência (o JurSystem zera a caixa ao importar)
 *     e o aviso automático no boot do sistema ajuda nisso.
 */

const ARQUIVO = 'jursystem_cadastros_pendentes.json'; // nome esperado pelo importador
const MAX_BYTES = 20_000;       // payload máximo por envio
const MAX_PENDENTES = 200;      // trava de segurança da caixa de entrada

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

function validarCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += parseInt(cpf[i]) * (t + 1 - i);
    if ((soma * 10) % 11 % 10 !== parseInt(cpf[t])) return false;
  }
  return true;
}

function gerarProtocolo() {
  const d = new Date();
  const data = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CAD-${data}-${rand}`;
}

// Lista branca de campos aceitos: nada além disso entra na caixa.
const CAMPOS = [
  'id','nome','prenome','cpf','rg','dataNasc','nacionalidade','estadoCivil',
  'uniaoEstavel','genero','profissao','cep','logradouro','numero','complemento',
  'bairro','cidade','uf','pais','endereco','email','tel','obs',
  '_origem','_enviadoEm',
];

function sanear(cliente) {
  const limpo = {};
  for (const k of CAMPOS) {
    if (cliente[k] !== undefined) limpo[k] = String(cliente[k]).slice(0, 2000);
  }
  return limpo;
}

async function ghFetch(env, metodo, corpo) {
  const r = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, {
    method: metodo,
    headers: {
      'Authorization': `Bearer ${env.GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'JurSystem-Intake-Worker',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  return r.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === 'GET') {
      return new Response('JurSystem intake OK', { headers: { 'Content-Type': 'text/plain', ...CORS } });
    }

    if (request.method !== 'POST' || url.pathname !== '/cadastro') {
      return json({ ok: false, erro: 'Rota inválida' }, 404);
    }

    // Configuração obrigatória
    if (!env.GH_TOKEN || !env.GIST_ID || !env.FORM_KEY) {
      return json({ ok: false, erro: 'Worker não configurado (segredos ausentes)' }, 500);
    }

    // Tamanho do corpo
    const bruto = await request.text();
    if (bruto.length > MAX_BYTES) return json({ ok: false, erro: 'Envio muito grande' }, 413);

    let payload;
    try { payload = JSON.parse(bruto); }
    catch { return json({ ok: false, erro: 'JSON inválido' }, 400); }

    // Chave do formulário (barra bots e scanners genéricos)
    if (payload.fkey !== env.FORM_KEY) return json({ ok: false, erro: 'Chave do formulário inválida' }, 403);

    const cliente = sanear(payload.cliente || {});

    // Validações de conteúdo
    if (!cliente.nome || cliente.nome.trim().length < 5)
      return json({ ok: false, erro: 'Nome incompleto' }, 422);
    if (!validarCPF(cliente.cpf))
      return json({ ok: false, erro: 'CPF inválido' }, 422);
    if (!cliente.tel || cliente.tel.replace(/\D/g, '').length < 10)
      return json({ ok: false, erro: 'Telefone inválido' }, 422);

    const protocolo = gerarProtocolo();
    cliente.protocolo = protocolo;
    if (!cliente._enviadoEm) cliente._enviadoEm = new Date().toISOString();
    if (!cliente._origem) cliente._origem = 'formulario';

    try {
      // 1. Lê a caixa de entrada atual
      const gist = await ghFetch(env, 'GET');
      let pendentes = [];
      const arq = gist.files?.[ARQUIVO];
      if (arq) {
        // content vem truncado em gists grandes; usar raw_url quando truncado
        let conteudo = arq.content;
        if (arq.truncated && arq.raw_url) {
          const raw = await fetch(arq.raw_url, {
            headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'JurSystem-Intake-Worker' },
          });
          conteudo = await raw.text();
        }
        try { pendentes = JSON.parse(conteudo || '[]'); } catch { pendentes = []; }
        if (!Array.isArray(pendentes)) pendentes = [];
      }

      if (pendentes.length >= MAX_PENDENTES)
        return json({ ok: false, erro: 'Caixa de entrada cheia; tente mais tarde' }, 429);

      // 2. Anexa e grava de volta
      pendentes.push(cliente);
      await ghFetch(env, 'PATCH', {
        files: { [ARQUIVO]: { content: JSON.stringify(pendentes, null, 2) } },
      });

      return json({ ok: true, protocolo, pendentes: pendentes.length });
    } catch (e) {
      return json({ ok: false, erro: 'Falha ao gravar: ' + e.message }, 502);
    }
  },
};
