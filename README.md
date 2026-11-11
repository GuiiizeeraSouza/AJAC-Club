# AJACTv

IPTV web para assistir canais ao vivo no navegador, feito com **Next.js 16 (App Router) + TypeScript + Tailwind CSS 4**.

Os canais vêm das listas públicas do repositório [Ramys/Iptv-Brasil-2026](https://github.com/Ramys/Iptv-Brasil-2026):
`Canais.m3u8` e `CanaisBR03.m3u8`.

## Como rodar

```bash
npm install
npm run dev        # http://localhost:3000
# produção
npm run build && npm start
```

## Funcionalidades

- **Categorias**: Esportes, Filmes & Séries, Notícias, Infantil, Documentários, TV Aberta, Variedades, Música e Religiosos.
- **Canais agrupados**: as variações de um mesmo canal (FHD, HD, H.265, ¹ ² …) das duas listas viram um único canal com várias **fontes**.
- **Player** com hls.js e mpegts.js: tenta cada fonte em sequência (HLS → MPEG-TS, direto → proxy) até uma funcionar. Você também pode trocar a fonte manualmente.
- **Experiência de TV ao vivo** (`src/lib/use-stream-player.ts`):
  - buffer de até 30 s à frente, com retentativas de rede tolerantes a oscilações;
  - acompanha o ponto ao vivo: acelera para 1,1× quando atrasa e salta direto para o ao vivo se o atraso ficar grande. No MPEG-TS isso fica com o `liveSync` do mpegts.js;
  - **reconexão automática** quando o sinal trava (12 s sem avançar) ou cai: tenta a mesma fonte e depois as outras, mantendo o último quadro congelado na tela;
  - volta para o ao vivo ao retomar depois de pausar, ao voltar para a aba e quando a internet retorna;
  - indicador de sinal e buffer no player, além do botão "Voltar ao vivo".
  - Corrige o token de uso único dos servidores Xtream: a playlist ao vivo é sempre recarregada pela URL original.
- **Lista sempre atual**: o servidor revalida a cada 10 min e o navegador busca a versão nova sozinho. O topo mostra o status AO VIVO/OFFLINE com relógio.
- **Banner de destaque** com prévia ao vivo, sem som (desktop).
- **Busca** (atalho `/`), **favoritos** e **continue assistindo** (salvos no navegador).
- No player: `↑`/`↓` trocam de canal, `F` alterna tela cheia, `Esc` fecha.
- Conteúdo adulto das listas é filtrado.

## Arquitetura

| Caminho | Função |
| --- | --- |
| `src/lib/catalog.ts` | Baixa as listas no servidor e guarda o resultado em cache, revalidando em segundo plano a cada 10 min (`'use cache'` + `cacheLife`) |
| `src/lib/m3u.ts` | Parser M3U, normalização de nomes, agrupamento e classificação por categoria |
| `src/app/api/stream` | Proxy de streams: reescreve playlists HLS e repassa os segmentos. Necessário em HTTPS, porque todas as fontes são `http://` e o navegador bloquearia conteúdo misto |
| `src/app/api/img` | Proxy das logos dos canais (com cache) |
| `src/lib/use-stream-player.ts` | Engine de reprodução com fallback automático |

As rotas de proxy bloqueiam hosts privados/loopback, validando cada redirecionamento (proteção contra SSRF).

## Login

O app inteiro exige login (usuário único), configurado no `.env.local`:

```bash
AUTH_USERNAME=Ajac
AUTH_PASSWORD=...
AUTH_SECRET=...   # 32+ caracteres aleatórios; trocar desconecta todas as sessões
```

- `src/proxy.ts` protege todas as páginas e APIs. Sem sessão, as páginas redirecionam para `/login` e as APIs respondem 401. As rotas de API também conferem a sessão por conta própria.
- A sessão fica num cookie `httpOnly` assinado (HMAC-SHA256), válido por 30 dias.
- Depois de 5 tentativas erradas, o login fica bloqueado por 5 minutos (por IP).
- Para trocar usuário ou senha, edite o `.env.local` e reinicie o servidor.

## Configuração

Para usar outras listas, defina `PLAYLIST_URLS` (URLs separadas por vírgula). Veja `.env.example`.

> **Deploy:** o proxy repassa o vídeo pelo seu servidor. Em hospedagens serverless isso conta como banda/tempo de execução, e streams longos podem atingir os limites de duração da função. Para uso contínuo, prefira um servidor Node (`npm start`) ou um container.

## Aviso

O AJACTv não hospeda nem transmite nenhum conteúdo: ele só lê listas M3U públicas. A disponibilidade de cada sinal depende das fontes originais.

Os arquivos originais das logos estão em `assets/logos-originais/`. As versões recortadas usadas no site ficam em `public/brand/`.
