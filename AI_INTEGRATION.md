# SenseArt — AI Mental Map: Integration Guide

## Motivazione

### Il problema rimasto dopo Phase 1 e Phase 2

Dopo Phase 1, un utente non vedente può navigare spazialmente un'opera d'arte tramite griglia ARIA: sa di essere nella cella "Alto-Sinistra" e sente "Regione Alto-Sinistra. Zoom 1x". Dopo Phase 2, sente anche un tono sonoro che mappa la luminosità e la saturazione del pixel.

Quello che ancora manca è il **significato**: cosa c'è in quella zona? È un volto? Un'ombra? Un simbolo iconografico? La cella produce un suono, ma non racconta nulla.

Questo è il gap che l'AI colma. Invece di "Regione Alto-Sinistra", lo screen reader annuncia:

> *"Alto-Sinistra — ombra profonda, architettura sullo sfondo"*

oppure, per la cella centrale de *La Ronda di Notte*:

> *"Centro — capitano Cocq e luogotenente van Ruytenburch, figure principali"*

### Perché questo è utile

1. **Agenzia semantica**: l'utente non vedente può scegliere consapevolmente dove andare. "Voglio esplorare dove ci sono i volti" → naviga verso le celle con tag `["volti", "luce"]`.
2. **Apprendimento contestuale**: il tono sonoro dice *quanto* c'è luce; l'etichetta AI dice *cosa* è illuminato.
3. **Accessibilità in musei reali**: la stessa API funziona su qualsiasi IIIF endpoint — Rijksmuseum, Uffizi, Metropolitan — senza lavoro manuale per ogni opera.
4. **Pluggabilità**: ogni istituzione può scegliere il provider AI che rispetta la propria policy (on-premise con Ollama, cloud con Gemini, ecc.).

---

## Architettura

### Provider Pattern

```
SenseArtViewer
└── ArtworkMapClient          ← orchestratore, gestisce cache
    └── ArtworkMapProvider    ← interfaccia pluggabile
        ├── MockProvider      ← fixture JSON, nessuna API key
        ├── GeminiProvider    ← Gemini 2.0 Flash (free tier)
        ├── GroqProvider      ← Llama 4 Scout via Groq (free tier, ultra-fast)
        ├── OpenAIProvider    ← GPT-4o (planned)
        ├── HuggingFaceProvider ← LLaVA (planned)
        └── OllamaProvider    ← locale, privacy-preserving (planned)
```

L'interfaccia è minima e stabile:

```typescript
interface ArtworkMapProvider {
  fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap>
}
```

Ogni provider implementa questa sola firma. `ArtworkMapClient` non sa nulla del provider concreto — la dipendenza è iniettata dal costruttore di `SenseArtViewer` in base a `SenseArtOptions.ai.provider`.

### Struttura dati: `ArtworkMap`

```typescript
interface CellMetadata {
  row: number
  col: number
  interestScore: number      // 0.0 (basso interesse) – 1.0 (alta rilevanza compositiva)
  label: string              // descrizione italiana ≤80 caratteri, senza gergo visivo
  sensoryTags: string[]      // es. ["caldo", "volti", "luce", "contrasto"]
}

interface ArtworkMap {
  cells: CellMetadata[][]    // [row][col], dimensioni == grid.rows × grid.columns
}
```

### Caching

`ArtworkMapClient` mantiene una `Map<string, ArtworkMap>` keyed su `${imageUrl}__${rows}x${cols}`. La prima chiamata a `getMap()` colpisce il provider; le successive ritornano dalla cache in memoria senza latenza. Se la griglia cambia (es. `setGrid(5,5)`), la cache va svuotata con `clearCache()`.

---

## Come viene integrato in `SenseArtViewer`

### Configurazione

```typescript
const senseArt = new SenseArtViewer(viewer, {
  grid: { rows: 3, columns: 3 },
  ai: {
    provider: 'gemini',
    apiKey: import.meta.env.VITE_GEMINI_API_KEY,  // ← variabile d'ambiente, mai hardcoded
  },
})
```

> **Sicurezza**: non inserire mai l'`apiKey` come stringa letterale nel codice sorgente. Vedi la sezione [Sicurezza e privacy](#sicurezza-e-privacy) per i dettagli.

#### Provider disponibili e relativi default

| `provider` | `model` default | `apiKey` | Note |
|---|---|---|---|
| `'mock'` | — | non richiesta | Fixture locale, zero latenza, per dev/test/CI |
| `'gemini'` | `gemini-2.0-flash` | Google AI Studio | Free tier: 15 RPM, 1M token/giorno |
| `'groq'` | `meta-llama/llama-4-scout-17b-16e-instruct` | console.groq.com | Free tier generoso, latenza ultra-bassa |
| `'openai'` | `gpt-4o` | OpenAI | Massima qualità, a pagamento |
| `'huggingface'` | `llava-hf/llava-1.5-7b-hf` | HuggingFace | Free tier, latenza variabile |
| `'ollama'` | `llava:13b` | non richiesta | Locale, privacy-preserving |

#### Esempi di configurazione per provider

**Gemini** (Google AI Studio — free tier):
```typescript
ai: {
  provider: 'gemini',
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  // model opzionale — default: 'gemini-2.0-flash'
}
```

**Groq** (Llama 4 Scout — free tier, velocissimo):
```typescript
ai: {
  provider: 'groq',
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  // model opzionale — default: 'meta-llama/llama-4-scout-17b-16e-instruct'
  // ⚠️ usare solo modelli vision-capable: llama-3.1-8b-instant è text-only
}
```

**Endpoint custom** (es. Vertex AI, proxy aziendale):
```typescript
ai: {
  provider: 'gemini',
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1/...',
}
```

**Ollama** (locale, nessuna chiave, privacy-preserving):
```typescript
ai: {
  provider: 'ollama',
  model: 'llava:7b',
  baseUrl: 'http://localhost:11434',
}
```

### Lifecycle: idratazione ad ogni `enable()`

La chiamata AI avviene in `enable()`, non in `mount()`. Questo è intenzionale: l'utente potrebbe zoomare su un dettaglio prima di attivare il layer, e le descrizioni devono riflettere **quello che vede in quel momento**, non la vista iniziale.

```
Alt+A (o click sul toggle)
  → SenseArtViewer.enable()
      → mapper.snapshotViewport()         ← cattura bounds viewport corrente
      → mapClient.clearCache()            ← forza ri-fetch ad ogni attivazione
      → showAILoadingBanner()             ← banner "⏳ AI sta analizzando…" sul viewer
      → hydrateAILabels() [async]
          → dispatch 'senseArt:ai-loading'  ← evento per consumer custom
          → canvas.toDataURL('image/jpeg')  ← screenshot del viewport corrente
          → ArtworkMapClient.getMap(dataUrl, grid)
              → provider.fetchMap(dataUrl, grid)
                  → [API call con canvas corrente come immagine]
                  → parse + validate JSON
              → cache (keyed su dataUrl + grid)
          → per ogni cella (r, c):
              A11yOverlay.updateCellLabel(r, c, metadata.label)
              GridCell.metadata = metadata
          → dispatch 'senseArt:ai-ready'   ← evento per consumer custom
      → hideAILoadingBanner()              ← banner rimosso dal DOM
      → activateGrid()                     ← celle già etichettate prima dell'interazione
          → overlay.setInteractive(true)
          → focusTrap.activate()
          → focusCell(0, 0)                ← prima cella già ha il label AI
```

L'attivazione del layer è **differita al completamento AI**: le celle diventano interattive solo quando i label sono pronti, così la prima cella non appare mai vuota. Se il provider fallisce (rete, quota esaurita), `hydrateAILabels()` cattura l'errore nel `catch`, il `finally` rimuove comunque il banner, e la griglia si attiva con etichette generiche di fallback — degradazione silenziosa.

### Banner di caricamento built-in

Quando è configurato un provider AI, `SenseArtViewer` inietta automaticamente un banner visivo sul container OSD durante l'analisi:

```
┌─────────────────────────────────────────┐
│  ⏳ AI sta analizzando la vista…        │  ← banner semi-trasparente, aria-live="polite"
├─────────────────────────────────────────┤
│                                         │
│         [OSD viewer / opera]            │
│                                         │
└─────────────────────────────────────────┘
```

Il banner è rimosso automaticamente quando i label sono pronti (o in caso di errore). **Nessun codice richiesto nel consumer.**

### Evento di stato AI: `senseArt:ai-loading` / `senseArt:ai-ready`

In aggiunta al banner built-in, `SenseArtViewer` dispatcha due eventi custom sul container OSD, utili per chi vuole una UI personalizzata:

```typescript
// Inizio chiamata AI
container.dispatchEvent(new CustomEvent('senseArt:ai-loading', { bubbles: true }))

// Fine (successo o fallimento — sempre emesso nel finally)
container.dispatchEvent(new CustomEvent('senseArt:ai-ready', { bubbles: true }))
```

Esempio di uso avanzato (badge custom nell'header dell'app):

```typescript
const osdEl = document.getElementById('osd')!

osdEl.addEventListener('senseArt:ai-loading', () => {
  statusBadge.textContent = '⏳ Analisi in corso…'
})
osdEl.addEventListener('senseArt:ai-ready', () => {
  statusBadge.textContent = '✓ Pronto'
  setTimeout(() => { statusBadge.textContent = '' }, 3000)
})
```

---

## GeminiProvider: implementazione tecnica

### Perché Gemini 1.5 Flash

- **Gratuito** fino a 15 RPM / 1M token/giorno (free tier, senza carta di credito)
- **Multimodale**: accetta immagini via base64 o URL pubblici
- **JSON mode**: supporta `responseMimeType: "application/json"` per output strutturato garantito
- **Velocità**: Flash è ottimizzato per bassa latenza (≈1–2s per un'immagine 800px)

### Flusso di una chiamata

```
GeminiProvider.fetchMap(imageUrl, grid)
  1. Scarica l'immagine (o usa il thumbnail IIIF se disponibile)
  2. Codifica in base64 (mimeType: image/jpeg)
  3. Costruisce il prompt (vedi sotto)
  4. POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
  5. Parsa la risposta JSON
  6. Valida che cells.length == grid.rows e cells[0].length == grid.columns
  7. Ritorna ArtworkMap
```

### Design del prompt

Il prompt è la parte più critica. Deve:
- Dividere l'immagine in una griglia `rows × columns`
- Produrre descrizioni **sensoriali** (non visive) in italiano
- Rispettare il limite di 80 caratteri per label (screen reader troncano oltre)
- Evitare gergo visivo inaccessibile ("zone luminose" → "zona luminosa — probabile cielo")
- Restituire JSON puro, senza markdown

```
Sei un assistente per la fruizione accessibile di opere d'arte rivolto a utenti non vedenti.

Analizza questa immagine e dividila mentalmente in una griglia di {rows} righe × {columns} colonne
(riga 0 = alto, riga {rows-1} = basso; colonna 0 = sinistra, colonna {cols-1} = destra).

Per ogni cella fornisci:
- "label": descrizione sensoriale in italiano, massimo 80 caratteri.
  Evita gergo visivo puro. Preferisci descrizioni che evocano materiali,
  persone, azioni, atmosfera. Es: "figura in abito scuro, postura eretta"
  invece di "zona scura a sinistra".
- "sensoryTags": 3–5 tag in italiano che descrivono qualità sensoriali
  (es. "caldo", "freddo", "testurizzato", "movimento", "silenzio", "metallo").
- "interestScore": da 0.0 a 1.0, importanza compositiva della cella
  (1.0 = soggetto principale, 0.0 = sfondo vuoto).

Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo aggiuntivo:
{
  "cells": [
    [ {"row":0,"col":0,"label":"...","sensoryTags":["..."],"interestScore":0.5}, ... ],
    ...
  ]
}
```

### Sorgente immagine: canvas vs URL

`GeminiProvider` riceve l'immagine come `data:` URL generato da `canvas.toDataURL()`. Supporta due formati:

- **`data:image/jpeg;base64,...`** — generato da OSD canvas. Il provider estrae il base64 direttamente senza fetch. È la sorgente usata di default: contiene esattamente la viewport visibile.
- **URL pubblico** — passato esplicitamente in `imageUrl`. Viene scaricato con `fetch()` e convertito in base64. Utile quando si vuole analizzare l'immagine intera anziché il viewport corrente.

Per immagini IIIF di grandi dimensioni (es. 14645×12158 px), usare un thumbnail:
```
https://{iiif-server}/{identifier}/full/800,/0/default.jpg
```

---

## Come funziona per un utente

### Scenario: utente non vedente al Rijksmuseum digitale

1. Utente apre `demo-osd` su Safari con VoiceOver attivo.
2. Preme `Alt+A`. VoiceOver annuncia: *"Layer accessibilità attivato. Usa le frecce per navigare l'opera."*
3. Nel frattempo, in background, `GeminiProvider` ha già ricevuto la risposta AI (latenza ≈1–2s, prima che l'utente abbia avuto tempo di premere una freccia).
4. L'utente preme `ArrowRight`. VoiceOver annuncia: *"Riga 1, Colonna 2 — Alto-Centro — volti emergenti dall'oscurità"*.
5. L'utente preme `Enter`. OSD zooma nella cella. Il sonificatore suona una nota acuta (alta luminosità = pitch alto).
6. L'utente naviga verso Centro con `ArrowDown`. VoiceOver: *"Riga 2, Colonna 2 — Centro — capitano Cocq e luogotenente van Ruytenburch, figure principali"*. Suono: nota calda, filtro aperto (alta saturazione cromatica).
7. L'utente capisce che il centro dell'opera è il punto focale — lo stesso insight che un visitatore vedente ricava visivamente in pochi secondi.

### Cosa sente VS cosa sentiva prima

| Cella | Prima (senza AI) | Dopo (con AI) |
|---|---|---|
| (0,0) | "Riga 1, Colonna 1" | "Alto-Sinistra — ombra profonda, architettura sullo sfondo" |
| (1,1) | "Riga 2, Colonna 2" | "Centro — capitano Cocq e luogotenente van Ruytenburch, figure principali" |
| (2,1) | "Riga 3, Colonna 2" | "Basso-Centro — fanciulla in giallo con pollo bianco, simbolo araldico" |

---

## Come aggiungere un nuovo provider

1. Crea `src/ai/MyProvider.ts`:

```typescript
import type { ArtworkMap, ArtworkMapProvider, GridConfig } from '../types/index.js'

export class MyProvider implements ArtworkMapProvider {
  constructor(private readonly apiKey: string) {}

  async fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap> {
    // ... chiama la tua API, parsa la risposta
    return { cells: [...] }
  }
}
```

2. Esportalo da `src/index.ts`:

```typescript
export { MyProvider } from './ai/MyProvider.js'
```

3. Aggiorna `SenseArtOptions.ai.provider` in `src/types/index.ts`:

```typescript
provider?: 'mock' | 'gemini' | 'openai' | 'huggingface' | 'ollama' | 'my-provider'
```

4. Aggiungilo allo switch in `SenseArtViewer` che costruisce il provider concreto.

---

## Linee guida per le label AI

Queste regole derivano da `DOC_GUIDE.md` e vanno applicate a tutti i provider:

| Regola | Esempio sbagliato | Esempio corretto |
|---|---|---|
| Massimo 80 caratteri | — | "Centro — capitano Cocq, figura principale in abito nero" |
| Nessun gergo visivo puro | "zona luminosa" | "zona luminosa — probabile cielo o sfondo aperto" |
| Lingua italiana | "dark shadow" | "ombra profonda" |
| Evitare colori puri | "area rossa" | "zona calda, toni di fuoco" |
| Descrivere persone | "figura" | "uomo in armatura, postura eretta" |
| Descrivere atmosfera | "area scura" | "ombra densa, senso di profondità" |

---

## Sicurezza e privacy

### Gestione delle chiavi API

> **Regola fondamentale**: non inserire mai una chiave API come stringa letterale nel codice sorgente. Una chiave nel sorgente finisce nel repository git e, nei progetti Vite, anche nel bundle JS distribuito — dove chiunque può leggerla con DevTools.

**Approccio corretto per app Vite (sviluppo/demo)**:

1. Crea `apps/demo-osd/.env.local` (già in `.gitignore`):
   ```
   VITE_GROQ_API_KEY=gsk_...
   VITE_GEMINI_API_KEY=AIza...
   ```

2. Leggi la variabile in `main.ts`:
   ```typescript
   ai: {
     provider: 'groq',
     apiKey: import.meta.env.VITE_GROQ_API_KEY,
   }
   ```

3. Aggiungi `"types": ["vite/client"]` in `tsconfig.json` per il tipo `ImportMeta.env`.

**Limiti dell'approccio Vite**: la variabile viene inlinata nel bundle al build time — è oscurata rispetto al sorgente ma tecnicamente estraibile dal bundle minificato. Per produzione con utenti anonimi usare un **backend proxy** che non espone la chiave al browser.

**Matrice di sicurezza per provider**:

| Provider | Chiave esposta al browser? | Raccomandato per |
|---|---|---|
| `'mock'` | — | CI, test, demo offline |
| `'ollama'` | No (chiamata locale) | Produzione privacy-sensitive |
| `'groq'` / `'gemini'` / `'openai'` | Sì (in bundle) | Dev/demo con `.env.local` |
| Qualsiasi via proxy server | No | Produzione pubblica |

- `OllamaProvider` è l'unica opzione cloud-free — raccomandata per opere inedite o contesti con restrizioni di trasmissione dati.
- `MockProvider` non richiede nessuna chiave ed è sicuro per ambienti offline e testing CI.
