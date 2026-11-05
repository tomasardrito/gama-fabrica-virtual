# GAMA — plano aprovado da revisão cinematográfica (onda 2)

Origem: sessão de gestão `/root`, no worktree `management-final`.
Corte A2/B2/C2 e registro da base com falha conhecida confirmados pelo dono em
04/11/2026. Base de código: `9f3b6b8`; baseline da onda: tag imutável
`gama-tabs-2`, no commit de documentação que contém este plano e os prompts.
Esta onda implementa a direção aprovada no filme completo, sem recomeçar a
logística. A aprovação permite executar esse escopo; não dispensa os critérios
de entrega. Mudanças de contrato ou de posse exigem ADENDO da gestão.

## Objetivo e observações do dono

Filme autônomo de 600 s, da linha personalizada Z/Z1/Z2/Z3, fiel ao Excel.
Mostrar operações importantes em velocidade visual legível; comprimir as
repetições em tomadas aéreas com um relógio indicando a passagem acelerada.
Usar melhor o painel direito, reduzir texto flutuante e dar atenção ao caminhão.
Reaproveitar os caminhos calculados, a paleteira manual compacta e o piso ampliado.

Observações originais, sem converter a percepção do usuário em diagnóstico:

> “achei que ficou muito rápido mesmo não não é válido”

> “pensar em alguns high light de toda a produção e essa pra ser a velocidade normal e os que não têm muita novidade a gente roda um reloginho assim mostrando que tem tá passando rápido com uma vista aérea de tudo acontecendo”

> “não deu muita atenção pro caminhão”

> “muito texto escrito se a gente fizer algum esquema de estar escrito no chão ou na própria máquina em vez de ficar texto no alto”

> “no final quando encerra some do nada quatro pessoas da reunião”

> “os cinco que estão na reunião também vão embora ele só sumiram do nada”

> “já foi calculado as rotas a gente pode aproveitar isso”

> “sem mais cálculos infinitos que demoram muito”

> “E um ponto também que eu preciso trazer tem empilhadeira andando meio aqui fora da fábrica que a fábrica aumentou um pouco mas o desenho do chão não acompanhou então precisa acompanhar essa essa área pro lado do caminhão ali ali perto tá meio fora do desenho da fábrica do chão”

O elenco real atual tem seis participantes identificados. Todos os presentes
devem levantar e sair visivelmente. Não reduzir o elenco para coincidir com a
contagem aproximada do relato. As esteiras foram rejeitadas e continuam fora.

## Estado medido da base

- Prévia de 90 s implementada, não o novo filme completo. Arquivos
  `highlight-preview.*`; agenda comprimida em `dados/preview-agenda.json.gz`.
- 535 movimentos internos, cinco paleteiras e cinco empilhadeiras, duas docas,
  38 coletas. Rotas de A1/D1 integradas. Não restaurar arquivos de `_versoes/`.
- `node tools/verificar.mjs`: 43 OK, uma falha física do pulmão. A autorização
  do commit dessa base não autoriza entregar o filme com a falha.
- `node --test tools/highlight-preview.test.mjs`: 3/3. Paridade do preparado
  conferida em 1.201 snapshots numéricos e 37 amostras de transporte.
- Prévia conferida em 1456×829 e 1920×1080, sem rolagem/erro JS. Reprodução
  contínua de 90 s concluída em 90,054 s; carregamento medido de 1,959 s.
- A extensão de piso junto às docas e ao corredor leste já existe em
  `logistics-scene.js`. C2 reaproveita e confere acabamento, não refaz o layout.
- O bootstrap do filme completo ainda pode chamar o planejador, inclusive
  indiretamente pela demonstração no default de `createFactoryScene`.
- Existem 30 IDs, mas `SCREEN_DIALOGUE` troca textos originais por paráfrases.
  Não foi encontrada aprovação dessa abreviação. B2 restaura os textos exatos.

O erro físico aparece em 138,5 s operacionais: indicador 3.130,204662 un e
pallets físicos 3.630,204662 un. Em DBR-E13, `loadedEnd` é 138,33133940209464,
mas a entrada industrial é 139,39689119793422. São 254 amostras divergentes de
0,5 s, máximo de 741 un. A leitura de `compileOperationalHandling` e
`compileDbrHandling` identifica promoção antecipada à baia do pulmão; A2 deve
confirmar o diagnóstico com teste antes de corrigir. Apenas retimar o filme
não corrige essa inconsistência.

## Highlights e fontes do Excel

Arquivo único: `dados/PCPIII-Case-GAMA-completo.xlsx`. As semanas abaixo são
decisões de direção. O Excel fornece parâmetros e resultados; não prescreve
enquadramentos, velocidade de bonecos, geometria de rota ou horários de tela.

| ID | Momento e ação visível | Fonte e significado |
| --- | --- | --- |
| H01 | S1: corda libera o lote rastreado; mostrar uma transferência completa de paleteira e o vínculo até a coleta | `DBR Personalizado!B18` = 500 un/lote; `B52` ≈ 10,71 h é referência média, `B54` ≈ 76,49 h é antecedência. Usar IDs reais da agenda; F13/F14 continuam no mesmo lote Z3. |
| H02 | S2: três máquinas do tambor trabalhando e abastecimento de componentes | `Divisão de Máquinas!J28` = 3; `DBR Personalizado!C13` ≈ 99,37%; `C69:C76` = componentes da S2. |
| H03 | S3: segunda corda, Tornearia → Usinagens → supermercado | `DBR Personalizado!J59:L60`: genérico PR 434/máximo 2.434, Z3 PR 5.151/máximo 7.151, lote 2.000. A seleção visual usa a reposição real da agenda. |
| H04 | S4: personalização na Lapidação, corpo comum e fluxo pela Rosqueadora | `RCCP (TOC) Personalizado!E4:E7` = 252/301/231/4.500; `DBR Personalizado!B59:B60` identifica genérico e Z3. Abrasivos e cores são representação física descrita no AGENTS, não números extraídos de célula. |
| H05 | S5: parada, pulmão amarelo, tambor continua e recuperação | `Simulação DBR!B14:B16`: Rosqueadora, hora 40, 16 h; `N30:P150` contém a curva do cenário de referência; `L8:L13`, seus resultados. Mostrar como cenário de variabilidade, não demanda adicional. |
| H06 | S6: explicar antecipação de 129 Z3 e acompanhar produção/inspeção | `RCCP (TOC) Personalizado!D78:F78`: deslocamento S6 → S5; `DBR Personalizado!G13` ≈ 99,997%. Não transferir novamente as 129 unidades no motor. |
| H07 | S7: caminhão entra, manobra, abre, recebe pallet, fecha e sai | `MCT Personalizado!B7` = 0,25 dia útil após inspeção. Coleta diária consolidada; veículo, doca, lotes e tempos vêm da agenda real, não de células inventadas. |
| H08 | S8: último atendimento e reconciliação final, percorrendo a fábrica | `RCCP (TOC) Personalizado!B4:I7`, total 44.825. Expedido e atraso são calculados pela operação. |
| H09 | Resultados: comparação com e sem pulmão | `Simulação DBR!L6:M13`: 5.603,125 × 4.241,25 un; 31 h sem material, perda 1.361,875 un e cerca de R$ 1,395 mi no caso sem pulmão. |
| H10 | Resultados: MCT e única melhoria permitida | `MCT Personalizado!B37:B39`: 31,5 → 6,759985 dias corridos e QRM ≈ 4,65977; `Melhoria 20%!B4:B5`: 5,582930 → 4,355471 dias úteis. Ganho do mix, se exibido: `TOC Personalizado!B45`. |

Não confundir duas séries: a aba Simulação DBR compara uma semana média; o
filme executa o MPS variável de oito semanas de personalizados. A referência
do Excel tem mínimo 2.209,4375, 12 h no amarelo e zero vermelho. A agenda
variável tem mínimo industrial aproximadamente 1.635,96317. Identificar a série
e a fonte no painel. Nunca substituir a demanda real pela média para igualar
curvas. Nenhuma mudança dos valores do Excel está autorizada.

## CONTRATO W2 — carregar integralmente em A2, B2 e C2

Este bloco é a fonte única do contrato compartilhado. As abas o leem inteiro;
não criam versões concorrentes. Só ADENDO registrado pela gestão o modifica.

### W2.1 — três escalas, sem alterar a fábrica

1. `presentationTime`: 0–600 segundos de filme, controla câmera, falas, áudio,
   cards, capítulos, abertura/encerramento e elenco narrativo.
2. `operationTime`: 0–600 segundos da agenda existente. Um único mapa contínuo,
   estritamente crescente, leva apresentação a operação. Todas as entidades
   industriais usam a MESMA amostra: caminhões, empilhadeiras, paleteiras,
   transportadores, pallets, máquinas e inventários. B2 implementa também a
   inversa, com tratamento determinístico dos limites dos segmentos.
3. Horas úteis continuam derivadas do motor, sem alteração por direção. A2
   extrai `OPERATION_TIMING` em `dbr-timing.js`, congelando os valores atuais,
   inclusive produção 135–510 e semana operacional de 46,875 s. O motor e o
   handling deixam de depender de `film-story.js`. Não basta retirar seu hash
   enquanto o import ainda influencia a operação.
4. `DbrSimulation.seek(t)` e os samplers operacionais recebem `operationTime`.
   `snapshot.elapsed`, `animationTime` e `film.factoryAnimationTime` continuam
   operacionais. Nunca sobrescrever elapsed de uma amostra pronta para simular
   que foi tomada em outro instante. `film.presentationTime` e
   `film.operationTime` são os campos explícitos de B2.
5. `FactoryFilm.seek(t)` mantém o significado operacional legado, necessário
   aos testes e à auditoria. B2 adiciona `seekPresentation(t)` e
   `advancePresentation(dt)`; o player usa essas APIs. Um seek de operação
   encontra a apresentação pela inversa. `reset` deve restaurar ambos.
6. O mapa cobre 0 e 600, sem pular, reordenar, duplicar ou voltar eventos. Os
   gatilhos industriais das falas e reports são convertidos pela inversa.
   Natural significa movimento visual legível a partir da duração nativa do
   trajeto; não significa uma hora industrial por hora de gravação.

### W2.2 — agenda pronta, propriedade e carga

A2 possui `film-prepared.js`, `tools/prepare-highlight-preview.mjs` e os
artefatos de operação. B2 possui a seleção/duração dos highlights em
`film-highlights.js`. Separar as responsabilidades hoje misturadas no
preparador/manifesto: o preparador operacional não escolhe câmera nem duração
de tomada. B2 não escreve `dados/preview-manifest.json` nem roda um comando que
o regrave. A seleção de B2 é derivada da agenda restaurada, sem planejador.

API de integração a implementar por A2:

```js
// film-prepared.js; base aponta à raiz do site
loadPreparedFilm(base) // Promise<{manifest, schedule, demonstration}>
// demonstration: {plan, sourceBay, sourceStart, sourceEnd}
```

Manter exports do codec e compatibilidade de `loadPreparedPreview` enquanto
houver consumidor. `{preparedSchedule: schedule}` continua sendo a entrada
do construtor do motor. B2 carrega antes de construir o filme; C2 recebe os
dados prontos na cena. Agenda stale/incompleta tem erro claro, sem fallback
silencioso para planejamento no navegador.

Validar schema/ABI, hash do asset, todas as fontes realmente operacionais,
535 IDs únicos, reservas completas e auditoria correspondente. Preservar
Maps/Sets, aliases, ciclos, metadados de arrays, Infinity e -0. Alteração de
câmera, texto ou duração de highlight não pode invalidar a agenda industrial.
Se alguma dependência de apresentação continuar real, remover o acoplamento
antes de reduzir a lista de hashes.

Demonstração didática do Ato 2: A2 extrai a preparação existente de
`createAct2Demonstration` para seu novo `film-demo-plan.js`, reutilizando a
geometria já aprovada. C2 remove o planejamento implícito de `scene.js` e faz
`createAct2Demonstration(preparedDemonstration)` apenas montar o adaptador
`{plan, sourceBay, sample, createCart}`. A2 pode preparar a demonstração em
`dados/demo-agenda.json.gz` e `dados/demo-manifest.json`, com hashes próprios;
não a mistura aos hashes operacionais. A2 deve permitir reutilizar a agenda
industrial ao preparar somente essa demonstração. Uma mudança real da
caminhada de C2 exige revalidar a demonstração, não 535 novas rotas.

B2 fornece `film.demonstration.sourceTime` para amostrar a demonstração pronta
dentro da sua janela narrativa. O único pallet demonstrativo é `DEMO-PALLET`,
sem quantidade industrial, com identificação de exemplo didático, horas úteis
paradas em zero. A2/C2 verificam envelopes de atores e frota reais; não basta
carregar uma auditoria antiga se a caminhada passou a ocupar outro lugar.

### W2.3 — roteiro, elenco e encerramento

B2 publica `film.story.windows` com intervalos `[start, end]` de apresentação
para `opening`, `problem`, `solution`, `production`, `results`, `closing`,
`exit`, `credits` e `demonstration`. `exit` é parte de `closing` e termina
antes dos créditos; `credits` é `[595, 600]`. Abertura mantém seus 25 s e card
de título de 3 s. O restante do orçamento editorial é responsabilidade B2,
preservando 600 s e tempo de leitura. `story.walks` e `story.speeches` mantêm
as identidades dos percursos e das 30 falas, com tempos de apresentação.

C2 estende `sampleFilmActors(presentationTime, speech, options)` para receber
`options = {handling, story, operationTime}`. Ausência dessas opções mantém
compatibilidade dos consumidores legados. O resultado único fica em
`film.actors`; render, cadeiras, porta, balões e câmera o consomem. Não
recalcular elenco com um relógio diferente dentro de `filmCast`.

Durante trabalho/missão, poses operacionais A2 têm precedência sobre gestos e
fala. Durante o encerramento, o sampler C2 controla os seis participantes até
saírem pelo caminho visível, sem esconder por `phase === 'closing'` nem deixar
o cinematic sobrescrever André/Jorge com outra rota. C2 publica em cada ator
`exitPhase` (`seated`, `standing`, `walking`, `exited`) e `visible`; B2 deriva
o término de saída do conjunto e mantém a câmera útil à ação. Ninguém some
antes de terminar sua saída; a sala continua iluminada e descoberta enquanto
as pessoas passam. Preservar afastamento de 0,8 m, porta e máquinas.

### W2.4 — texto, fontes, velocidade e informação

Usar o texto exato dos 30 IDs de `film-dialogue.js`/AGENTS, sem `SCREEN_DIALOGUE`
parafraseado nem voz acelerada. Dividir em balões legíveis quando necessário;
reconstituir o texto integral no teste. Duração sem áudio segue a regra do
AGENTS; áudio real, se existir, permanece em velocidade natural. Nenhuma fala
deve ocupar uma operação diferente apenas para caber no cronômetro.

O orçamento antigo de 50 s para o Ato 1 e 60 s para o Ato 2 não comporta os
textos integrais e a caminhada. B2 fecha o orçamento ANTES de trabalhar a
câmera, reduzindo repetições das semanas, não alterando o relógio industrial.
As falas podem coexistir com o highlight; não somar artificialmente tudo.
Se áudios futuros inviabilizarem 600 s, informar o conflito concreto e não
reescrever falas/velocidades silenciosamente.

O mapa editorial guarda `id`, semana/bloco, IDs reais dos eventos/lotes,
intervalo operacional, duração de tela e referências de aba/célula. Mostrar
H01–H10, o fluxo inteiro e pelo menos cinco setores identificáveis por semana;
uma tomada aérea só conta os setores realmente visíveis. O novo ritmo
substitui quotas temporais antigas que impedem highlights prolongados,
especialmente o ciclo completo do caminhão na S7. Não classificar um setor
como outro para fazer teste passar. Tomadas seguidas de transporte mostram
retirada, percurso e colocação sem corte no meio. Intercalar plano geral,
postos, componentes e inspeção, sem concentrar tudo no supermercado.

Painel direito: DBR e indicadores, um card contextual útil e gráfico compacto;
sem abas/rolagem. O relógio de aceleração comunica os intervalos rápidos.
Pintura de piso e placas físicas substituem rótulos permanentes suspensos;
falas e informação dinâmica pertencem à UI. Preservar modo filme após play,
Space/R, créditos de `config/creditos.json` e as duas resoluções.

### W2.5 — provas que não podem ser enfraquecidas

- 600 s; 44.825 expedidas; zero em atraso em TODOS os instantes verificáveis;
  nenhuma coleta vazia; 30 falas exatas, gatilhos e ordem coerentes; abertura
  e encerramento completos. Não trocar metas por valores medidos para passar.
- Excel e ledger industrial imutáveis por ID, inclusive quantidades, horas de
  inspeção, expedição e consumo. Guardas de `tools/etapa1.test.mjs`:
  timeline `e7619954fd78eed8d3a9cef3802aa9bae03c34ec2215dd8db2d0a72dfc5ab36a`;
  lots `09b951eb6c518956bfc27db08c9368f1b9dbd4a7a50a5b0b24034fbc28255fe6`;
  buffer `ade774bcf14b3111ae55a58be49691e7e1fdb22da32130fcb588c2c5af4ee20b`;
  collections `cd5d50036c3dc32e59c770a387ecd6dc7579820303095703fed4cb55dfab1fb6`.
- Pulmão nunca vermelho, faixas reais, igualdade físico/indicador: posição,
  disponibilidade e quantidade coerentes, não apenas mudar o Map/ocultar o
  pallet. Conferir 0–600 em 0,5 s e fronteiras dos eventos ± epsilon.
- 535 movimentos, recursos com origem/vaga/retorno, sem colisões e sem novos
  caminhos otimizados por estética. Ajustar tempo de chegada, se necessário,
  implica revalidar reservas do ciclo inteiro e encontros afetados. Não
  reutilizar `audit.complete` como prova de uma agenda temporal modificada.
- Cache original/restaurado com paridade numérica e física, sem planejamento
  no bootstrap, seek, restart ou carregamento da demonstração.

## Sequência e responsabilidade pela integração

As três abas podem começar juntas. A2 publica primeiro a separação do timing
e o schema/API em `deliveries/A2.md`; B2 começa pelo orçamento e mapa editorial
sem mudar o relógio operacional legado; C2 começa por sinalização e sampler de
saída parametrizado. Todas usam a agenda existente para desenvolvimento visual,
com a falha física explicitada, até chegar a agenda corrigida.

B2 publica janelas e pontos de passagem em `deliveries/B2.md`; C2 publica
estados de saída e adaptador da demonstração em `deliveries/C2.md`. Esses
detalhes preenchem o contrato; mudanças de seu significado voltam à gestão.
Não criar espera circular: simular entradas do contrato para desenvolver,
mas não declarar integração concluída com fixture própria.

A2 executa diagnósticos pequenos primeiro. Uma preparação industrial final e
uma auditoria completa são esperadas após corrigir a causa. Falha nova
justifica nova rodada focada; não repetir otimizadores intactos a cada ajuste
visual. Comprovar a geometria já existente e as reservas, sem busca infinita.

A gestão prova a composição REAL: agenda/hash de A2 + direção de B2 + render e
elenco de C2. Antes de aceitar a integração final, roda o verificador nos
tempos operacional e de apresentação, as suítes pertinentes, confere os dez
highlights e saída em ambas as resoluções, e reproduz os 600 s contínuos em
1× sem interação. Só essa composição pode ser oferecida como filme final.
Falhas externas conhecidas ficam nomeadas na entrega parcial da aba; não são
escondidas nem motivo para parar trabalho independente.

Não há tarefa de console, credencial ou publicação externa nesta onda.
Revisão visual do dono acontece no filme integrado; nomes ainda não fornecidos
permanecem como placeholders nos créditos, sem inventar integrantes.
