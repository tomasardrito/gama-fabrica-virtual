# GAMA · Fábrica Virtual

Maquete 3D e filme de 10 minutos do Trabalho Final de PCP III (FEI), Case GAMA. Família Z, DBR (tambor, pulmão, corda).

## Rodar no computador
```
cd ~/Projeto/gama-fabrica-virtual
python3 -m http.server 8000
```
Abra http://localhost:8000 no Chrome.

## Verificar a Etapa 1

```bash
node --test tools/etapa1.test.mjs tools/excel.test.mjs
node tools/verificar.mjs --etapa=1
node tools/verificar.mjs
```

O último comando mantém as cobranças de todas as etapas. `--etapa=1` distingue
as pendências de câmera, frota e docas, sem dispensar os testes numéricos.
O teste do Excel usa apenas Python 3 e sua biblioteca padrão para ler os valores
salvos da planilha, sem alterá-la.

O relógio industrial usa taxas, turnos e MPS do Excel. As transferências usam a
premissa logística de 12 minutos por missão. A coreografia é calculada depois,
preservando as chegadas ao pulmão, a inspeção e a saída das coletas. Janelas
curtas comprimem a animação, nunca o processamento industrial.

O pulmão começa em 3.571,3125 unidades equivalentes, sem os cinco pallets extras
a montante da versão original. Seu balanço inclui as pistas e o restante do
pallet em alimentação: as unidades saem do saldo conforme são consumidas pelo
tambor. O cenário A/B continua reproduzindo as 121 linhas da aba `Simulação DBR`;
seus 2.209,44 un mínimas e 12 h amarelas são da semana média. O MPS das oito
semanas tem volumes variáveis e seus períodos amarelos são informados pelo
verificador, inclusive quando ocorrem fora da S5. Nenhum saldo é corrigido para
forçar uma cor. Coletas sem carga são dispensadas, inclusive na sexta se todas
as entregas já tiverem saído antecipadamente.

## Trabalhar com o Codex
Antes da primeira sessão, salve a versão original (para poder desfazer qualquer mudança):
```
cd ~/Projeto/gama-fabrica-virtual
git init && git add . && git commit -m "Versão original do chatgpt.site (03/11/2026)"
```
Depois:
```
codex
```
O Codex lê o `AGENTS.md` sozinho. Para começar, basta pedir: "Leia o AGENTS.md e faça a etapa 1."

## Pastas
- `AGENTS.md`: contexto do trabalho e tudo o que precisa ser feito (instruções para o Codex).
- `dados/PCPIII-Case-GAMA-completo.xlsx`: planilha do trabalho, fonte única dos números.
- `docs/Enunciado-Case-GAMA.pdf`: enunciado do case.
- `config/creditos.json`: nomes do grupo no card final (preencher).
- `audio/`: falas gravadas, `F01.m4a` a `F30.m4a` (roteiro no documento "Roteiro de dublagem — Filme GAMA").
- Raiz e `vendor/`: código do site (ES modules, sem build) e three.js.

## Publicar
O link antigo (chatgpt.site) só é atualizado pelo ChatGPT. Para ter um link novo a partir desta pasta, dá para publicar como site estático (GitHub Pages, Netlify ou Vercel). Para gravar o vídeo, a versão local basta.

## Etapa 2 — tela para gravação

A página abre com a fábrica fechada e o botão **▶ Iniciar filme**. Depois do
clique, a reprodução é fixa em 1× e não exibe controles. **Espaço** pausa/retoma;
**R** reinicia a abertura mantendo o modo filme. O cursor desaparece após dois
segundos parado. Ao chegar a 10:00, o filme termina sem repetir. Sair da aba pausa
a reprodução; Espaço retoma ao voltar.

O painel direito contém a faixa DBR, um card automático e o gráfico do pulmão.
Os oito reports e a comparação A/B aparecem nesse painel, sem abas nem rolagem.
O gráfico usa apenas pontos já observados; o lead time realizado é calculado a
partir dos pallets já inspecionados na semana. O valor planejado de 4,45 dias
úteis continua separado do realizado. O MPS e o motor industrial não mudaram.

Validação:

```sh
node --test tools/etapa1.test.mjs tools/excel.test.mjs tools/etapa2.test.mjs
node tools/verificar.mjs --etapa=2
node tools/verificar.mjs
```

O verificador completo mantém as pendências de câmera, frota e docas. O filtro
`--etapa=2` apenas as identifica como futuras; as metas numéricas continuam
obrigatórias. A rotina `tools/filme.browser.mjs` exporta `verifyFilmMode(page,
baseURL)` para um Page do Playwright: verifica os atalhos, o fim sem repetição e
1.201 estados de layout em cada resolução (1456×829 e 1920×1080), incluindo os
oito reports, sem conteúdo cortado ou controles. Não acrescenta dependências ao
site. A conferência visual é feita separadamente no navegador.

## Etapa 3 — esteiras da linha

Os cinco trajetos da Lapidação até a Inspeção usam roletes, estruturas metálicas,
apoios e mesas de transferência lateral. O mesmo pallet identificado percorre
a rota inteira; esses trajetos não reservam empilhadeiras. Equipamentos e
trajetórias compartilham a geometria de `dbr-conveyors.js`.

O pulmão tem duas fileiras de posições individuais, com acesso lateral. Essa
solução permite selecionar a ordem com entrega mais próxima (EDD), sem bloquear
um pedido urgente atrás de uma antecipação. Mantém as dez posições normais e
a posição da reserva equivalente de 71,3125 unidades. O saldo industrial, as
taxas, o MPS e os eventos da aba Simulação DBR permanecem iguais aos da etapa 1.

As mesas laterais têm reservas de passagem, verificadas por caixas varridas em
cada segmento, inclusive entre quadros. Das 535 transferências, 439 têm 1,5 s
de movimento. Lotes parciais e esperas nos cruzamentos comprimem as demais,
até 0,525 s: essa escolha preserva os horários industriais e os 10 minutos do
filme. Os 12 minutos industriais de movimentação continuam como margem de
manuseio; não se deduz capacidade extra por instalar a representação visual.

Uma prateleira de componentes foi deslocada para abrir espaço ao pulmão. As
rotas dos personagens e os postos junto à montagem foram afastados das
esteiras. O redesenho da frota externa à célula e das docas pertence à etapa 4.

```sh
node --test tools/etapa1.test.mjs tools/excel.test.mjs tools/etapa2.test.mjs tools/etapa3.test.mjs
node tools/verificar.mjs --etapa=3
node tools/verificar.mjs
```

O verificador acrescenta os cinco enlaces sem empilhadeira e a ausência de
sobreposição dos pallets. O teste da etapa percorre também os movimentos em
passos de 0,05 s e confere o suporte físico sob todas as rotas. O filtro da etapa
continua distinguindo apenas as pendências futuras de frota, docas e câmera.
