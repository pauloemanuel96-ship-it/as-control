# AS Control

Sistema interno da AS Brasil com duas áreas, alternadas pelo seletor no topo do menu:

- **Contas:** assinaturas, contratos, serviços recorrentes, cobranças e contas a pagar.
- **Jurídico:** processos (JEC e Justiça Comum), Procon, Consumidor.gov, Reclame Aqui, notificações extrajudiciais e chargebacks, com prazos, audiências, andamentos, valores e documentos.

Login, usuários, auditoria, notificações e WhatsApp são comuns às duas áreas.

## Requisitos

- Node.js **22.13 ou mais recente** (usa o SQLite embutido no Node; não há nada para compilar).
- Uma pasta persistente para o banco e os documentos (`storage/`).

## Instalação local (Windows, cmd)

```bat
cd C:\caminho\para\as-control
copy .env.example .env
npm install
npm start
```

Abra http://localhost:3000. No primeiro acesso, o sistema pede para criar a conta de **administrador**. Depois, cadastre a equipe em **Usuários**.

## Como funciona

- **Serviços** geram os **vencimentos** automaticamente conforme a periodicidade, sem duplicar (chave única por serviço + data de ocorrência).
- A cada 15 minutos (configurável), o servidor: gera vencimentos dentro do horizonte, marca contas atrasadas, cria alertas (7, 3, 1 e 0 dias antes, e diariamente após o vencimento) e processa a fila do WhatsApp.
- **Aprovação de pagamento** é opcional e só vale acima do valor definido em *Alertas e integrações*.
- **Cobranças recebidas** entram numa fila de conferência. Nada é lançado nem marcado como pago sem confirmação de uma pessoa.
- **Aumentos** são detectados quando o valor cobrado supera o previsto (percentual mínimo configurável) ou quando o valor do serviço sobe no cadastro.
- **Auditoria** registra usuário, ação, registro, data/hora e valores antes/depois.
- **Permissões** são verificadas no servidor em todas as rotas.

## Módulo jurídico

- **Demandas** guardam tipo, número (o padrão CNJ tem o dígito verificador conferido), parte contrária, órgão, evento relacionado, valores, risco, prioridade e responsável.
- **Prazos, audiências e tarefas** geram alertas automáticos: prazos 5, 2, 1 e 0 dias antes; audiências 7, 1 e 0 dias antes; prazos vencidos todos os dias; audiências passadas sem resultado registrado. Os dias são configuráveis em *Alertas e integrações*.
- **Calculadora de prazo** em dias úteis: exclui o dia do começo, fins de semana, feriados nacionais e, se marcado, o recesso de 20/12 a 20/01. É uma estimativa: feriados estaduais e municipais e suspensões do tribunal não entram, então confira a data antes de usá-la.
- **Andamentos** formam a linha do tempo de cada demanda. Ações como agendar, cumprir, encerrar e gerar contas entram automaticamente.
- **Valores**: acordos, condenações, custas e honorários podem gerar **contas a pagar** (uma por parcela, categoria *Jurídico*), que seguem o fluxo normal de aprovação e pagamento do módulo de contas.
- **Documentos jurídicos** só podem ser vistos por quem tem acesso ao jurídico.
- O banco é atualizado automaticamente na primeira vez que a versão nova inicia. Nenhum dado de contas é alterado.

## Perfis

| Permissão | Administrador | Financeiro | Gestor | Consulta |
|---|:-:|:-:|:-:|:-:|
| Ver serviços e vencimentos | ✓ | ✓ | ✓ | ✓ |
| Cadastrar/editar serviços | ✓ | ✓ | | |
| Registrar cobranças e editar lançamentos | ✓ | ✓ | | |
| Registrar pagamentos | ✓ | ✓ | | |
| Aprovar pagamentos | ✓ | | ✓ | |
| Ver documentos | ✓ | ✓ | ✓ | |
| Anexar documentos | ✓ | ✓ | | |
| Conferir cobranças recebidas | ✓ | ✓ | | |
| Relatórios | ✓ | ✓ | ✓ | |
| Usuários, configurações e auditoria | ✓ | | | |
| Ver demandas jurídicas | ✓ | | ✓ | |
| Cadastrar e atualizar demandas jurídicas | ✓ | | | |

Cada usuário pode ter permissões concedidas ou retiradas individualmente. Para alguém trabalhar só no jurídico, crie o usuário com perfil Consulta, retire as permissões de contas e conceda as duas permissões jurídicas.

## WhatsApp

Sem configuração, a funcionalidade aparece como **Pendente de conexão** e os alertas ficam só dentro do sistema. Nenhum envio é simulado.

**API oficial da Meta:** preencha `WHATSAPP_PROVIDER=meta`, o token, o Phone Number ID e o nome do template. Mensagens iniciadas pela empresa exigem um **template aprovado**. O sistema envia 6 variáveis no corpo:
1. tipo do alerta (ex.: ALERTA DE VENCIMENTO)
2. frase (ex.: O serviço PABX vence amanhã.)
3. valor
4. vencimento
5. status
6. link do lançamento

Sugestão de corpo do template:
```
AS CONTROL | {{1}}

{{2}}

Valor: {{3}}
Vencimento: {{4}}
Status: {{5}}

{{6}}
```

**Webhook (n8n, Z-API, Evolution etc.):** `WHATSAPP_PROVIDER=webhook` e `WHATSAPP_WEBHOOK_URL`. O AS Control envia um POST JSON:
```json
{ "origem": "as-control", "destino": "5521999999999", "mensagem": "texto pronto", "tipo": "vencimento", "partes": ["..."], "enviado_em": "ISO" }
```
Responda com HTTP 2xx (opcionalmente `{"id":"..."}`). Qualquer outro status conta como falha e é tentado de novo (até 3 vezes).

Para prazos e audiências, você pode usar um template próprio em `WHATSAPP_META_TEMPLATE_JURIDICO`. Variáveis: 1) tipo do alerta, 2) frase, 3) processo/protocolo, 4) data, 5) responsável, 6) link da demanda.

Use **Alertas e integrações → Enviar teste** para validar a conexão.

## Entrada de cobranças (futura integração com e-mail)

Com `COBRANCAS_WEBHOOK_TOKEN` definido:
```
POST /api/webhooks/cobrancas
Authorization: Bearer <token>
Content-Type: application/json

{ "fornecedor": "Locaweb", "valor": "89,90", "vencimento": "2026-12-18", "competencia": "2026-12",
  "numero_fatura": "LW-123", "remetente": "cobranca@...", "assunto": "Sua fatura", "origem": "email" }
```
A cobrança entra na fila **Cobranças recebidas** e notifica quem confere. Ela nunca vira pagamento sozinha.

## Backup

O servidor faz um backup automático ao iniciar e depois uma vez por dia (enquanto estiver ligado). Também dá para fazer na hora com `npm run backup`.

- Cada backup é uma pasta datada com o banco (`as-control.db`) e os documentos, mais um `LEIA-ME.txt` com o passo a passo de restauração.
- A cópia do banco é feita com o sistema rodando, sem risco de pegar o arquivo pela metade.
- Pasta padrão: `backups/` dentro do projeto. Configure `BACKUP_DIR` no `.env` para outra pasta — uma pasta do OneDrive é uma boa escolha, porque o backup fica também fora do computador.
- São mantidos os 30 backups mais recentes (`BACKUP_KEEP`).

## Produção

- Use HTTPS, `NODE_ENV=production` e `APP_URL` com o endereço público.
- Garanta que `DATA_DIR` fique em disco persistente e faça backup periódico de `as-control.db` e da pasta `documentos/`.
- Se a hospedagem desligar o processo quando ocioso, agende `npm run jobs` a cada 15 minutos (cron externo) para não perder alertas.

## Estrutura

```
server/
  index.js        servidor, segurança e rotas
  db.js           esquema do banco
  auth.js         login, sessões, permissões e auditoria
  financeiro.js   recorrência, geração de vencimentos, atrasos, aumentos
  jobs.js         rotinas automáticas e alertas
  whatsapp/       camada desacoplada de provedores
  juridico-prazos.js  dias úteis, feriados nacionais e número CNJ
  routes/         API (juridico.js = módulo jurídico)
public/           interface (sem frameworks; juridico.js = telas do jurídico)
```
