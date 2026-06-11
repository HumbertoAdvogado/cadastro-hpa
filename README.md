# Cadastro de Clientes — HPA Advocacia (JurSystem)

Formulário público de cadastro de clientes + Worker de recepção.
O cliente preenche, o registro cai na caixa de entrada (Gist) e o
JurSystem importa com um clique.

## Formulário (já no ar via GitHub Pages)
O `index.html` deste repositório é servido pelo GitHub Pages.
Sem o Worker configurado, ele funciona no **modo WhatsApp**: gera um
código `JURCAD1:` que o cliente envia ao escritório e que é colado no
JurSystem (botão "Link de cadastro" → "Importar código").

## Ativar o envio automático (3 minutos)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/HumbertoAdvogado/cadastro-hpa)

1. Clique no botão acima e autorize com sua conta Cloudflare (grátis).
2. Após o deploy, em **Settings → Variables and Secrets** do Worker, crie:
   - `GH_TOKEN` — token GitHub clássico com escopo `gist`
   - `GIST_ID` — id do Gist da caixa de entrada
   - `FORM_KEY` — `hpa-Tf2wqMHuUBtVsmWN`
3. Copie a URL do Worker (ex.: `https://jursystem-cadastro.SEU.workers.dev`)
   e envie o link do formulário assim:
   `https://HumbertoAdvogado.github.io/cadastro-hpa/?api=https://jursystem-cadastro.SEU.workers.dev`

A `FORM_KEY` acima já está embutida no `index.html` — basta replicá-la
no segredo do Worker.

## Privacidade
Dados tratados nos termos da Lei nº 13.709/2018 (LGPD), exclusivamente
para atendimento jurídico. A caixa de entrada é esvaziada a cada
importação no JurSystem.
