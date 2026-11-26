<p align="center">
  <img src="public/logo.png" alt="Azuri Music" width="120" />
</p>

<h1 align="center">Azuri Music</h1>

<p align="center">
  Plataforma completa de streaming musical com estética <strong>glassmorphism ciano neon</strong>, criada para que cada usuário ouça suas músicas favoritas com alta qualidade sonora — equalizador em tempo real, letras sincronizadas com IA e recomendações personalizadas — e com uma área dedicada para artistas independentes publicarem e divulgarem seus próprios trabalhos.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=000" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=fff" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=fff" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=fff" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Web_Audio_API-FF5722?style=for-the-badge&logo=mdnwebdocs&logoColor=fff" alt="Web Audio API" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=fff" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=fff" alt="Express" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Spotify_Web_API-1DB954?style=for-the-badge&logo=spotify&logoColor=fff" alt="Spotify Web API" />
  <img src="https://img.shields.io/badge/Google_Gemini-4285F4?style=for-the-badge&logo=googlegemini&logoColor=fff" alt="Google Gemini AI" />
  <img src="https://img.shields.io/badge/gemini--2.5--flash-00E5FF?style=for-the-badge&logo=google&logoColor=000" alt="gemini-2.5-flash" />
  <img src="https://img.shields.io/badge/LRCLIB-94A3B8?style=for-the-badge" alt="LRCLIB" />
  <img src="https://img.shields.io/badge/Genius-FFFF64?style=for-the-badge&logo=genius&logoColor=000" alt="Genius" />
</p>

---

## Como o Sistema Funciona (Arquitetura)

### Frontend SPA (`src/`)

Interface responsiva com tema escuro glassmorphism, player persistente, fila inteligente, perfil personalizável e persistência local (`localStorage` / `sessionStorage`). Estado global do player via **Zustand**; rotas com **React Router**.

### Motor de Áudio em Tempo Real (Web Audio API)

Grafo de áudio com `AudioContext`, equalizador paramétrico de 5 bandas (60 Hz a 14 kHz via `BiquadFilterNode`), Bass Boost, normalização dinâmica (`DynamicsCompressorNode`), crossfade e seletor de qualidade (96 kbps a Hi-Fi).

### Backend Proxy & Streaming (`server/`)

Servidor **Express** que atua como proxy de stream com cabeçalhos CORS liberados para processamento de áudio, busca multi-fonte de letras com filtros anti-spam/cypher e cache em memória/disco (`server/cache/`).

### Sincronização de Letras com IA (Google Gemini)

Pipeline híbrido que combina busca no **LRCLIB** / **Genius** com alinhamento multimodal via **gemini-2.5-flash** (analisando o áudio real para mapear o segundo exato de cada verso), além de renderização em 60 fps (`requestAnimationFrame`), Tap Sync e ancoragem manual.

### Motor de Recomendação Resiliente

Curadoria personalizada baseada em histórico e gêneros favoritos, com cache de sessão e circuit breaker contra limites de requisição (`429`) da API do Spotify.

---

## Organização de Pastas

```text
Azuri Music/
├── public/                      # Assets estáticos servidos pelo Vite
│   ├── logo.png                 # Logo da marca
│   ├── favicon.svg
│   └── icons.svg
├── src/                         # Frontend SPA (React + TypeScript)
│   ├── assets/                  # Imagens e assets importados no bundle
│   ├── components/              # UI reutilizável (player, letras, modais, cards)
│   │   └── layout/              # Shell: Sidebar, MusicPlayer, AppLayout, etc.
│   ├── contexts/                # Contextos React (ex.: PlayerContext)
│   ├── hooks/                   # Hooks customizados
│   ├── pages/                   # Rotas: Home, Search, Library, Profile, etc.
│   ├── services/                # Spotify, letras, recomendações, perfil, áudio
│   ├── store/                   # Zustand (estado global do player)
│   ├── utils/                   # Utilitários (ex.: waveform)
│   ├── App.tsx                  # Rotas e composição da aplicação
│   ├── main.tsx                 # Entry point
│   └── index.css                # Tema Azuri + Tailwind
├── server/                      # Backend Express (proxy + letras + IA)
│   ├── cache/                   # Cache em disco (.gitkeep versionado)
│   ├── src/
│   │   ├── index.ts             # Servidor Express, rotas e proxy de stream
│   │   ├── aiLyricsSync.ts      # Pipeline Gemini de sync multimodal
│   │   └── utils/
│   │       └── lyricsNormalizer.ts
│   ├── .env.example             # GEMINI_API_KEY, PORT
│   ├── package.json
│   └── tsconfig.json
├── .env.example                 # VITE_SPOTIFY_CLIENT_ID / SECRET
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

---

## Como Instalar e Executar

### Pré-requisitos

- **Node.js 18+**
- Conta e app no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) (Client ID e Client Secret)
- Chave de API no [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)

### 1. Clonar o repositório

```bash
git clone <url-do-repositorio>
cd "Azuri Music"
```

### 2. Instalar dependências

```bash
# Frontend (raiz)
npm install

# Backend
cd server
npm install
cd ..
```

### 3. Configurar variáveis de ambiente

Copie os arquivos de exemplo e preencha as chaves (sem commitar os `.env` reais):

```bash
# Raiz — credenciais Spotify (Vite)
cp .env.example .env

# Server — Gemini + porta
cp server/.env.example server/.env
```

**`.env` (raiz)**

```env
VITE_SPOTIFY_CLIENT_ID=
VITE_SPOTIFY_CLIENT_SECRET=
```

**`server/.env`**

```env
GEMINI_API_KEY=
PORT=3001
```

### 4. Iniciar o backend

Em um terminal:

```bash
cd server
npm run dev
```

Servidor em **http://localhost:3001**.

### 5. Iniciar o frontend

Em outro terminal (na raiz do projeto):

```bash
npm run dev
```

App em **http://localhost:5173**.

---

## Scripts úteis

| Local   | Comando           | Descrição                                      |
|---------|-------------------|------------------------------------------------|
| Raiz    | `npm run dev`     | Vite dev server (porta 5173)                   |
| Raiz    | `npm run build`   | Build de produção (`tsc -b` + Vite)            |
| Raiz    | `npm run preview` | Preview do build                               |
| Raiz    | `npm run lint`    | Oxlint                                         |
| Server  | `npm run dev`     | Express com watch (`tsx`) na porta 3001        |
| Server  | `npm run build`   | Compila TypeScript para `server/dist/`         |
| Server  | `npm start`       | Sobe o build de produção                       |

---

## Design System (Azuri Theme)

| Token              | Hex       | Uso                         |
|--------------------|-----------|-----------------------------|
| Fundo principal    | `#0B0F19` | Background da aplicação     |
| Fundo secundário   | `#111827` | Sidebar / player            |
| Destaque (neon)    | `#00E5FF` | Primária / acentos          |
| Texto primário     | `#F8FAFC` | Títulos e conteúdo          |
| Texto secundário   | `#94A3B8` | Metadados e labels          |

---

## Segurança

- Arquivos `.env` / `*.env` estão no `.gitignore` (raiz e `server/`).
- Apenas `.env.example` e `server/.env.example` são versionados (sem valores reais).
- Caches (`server/cache/`, `.vite/`), builds (`dist/`, `server/dist/`) e `node_modules/` não entram no Git.

---

<p align="center">
  Suas músicas favoritas em alta fidelidade e espaço aberto para artistas independentes — <strong>Azuri Music</strong>
</p>
