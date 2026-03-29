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
        ├── GeminiProvider    ← Gemini 1.5 Flash (free tier)
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
    imageUrl: 'https://example.com/artwork.jpg',  // immagine da analizzare
    provider: 'gemini',                           // default: 'gemini' — vedi opzioni sotto
    apiKey: 'AIza...',                            // chiave API (non richiesta per 'mock')
    model: 'gemini-1.5-flash',                   // default: 'gemini-1.5-flash', sovrascrivibile
  },
})
```

#### Provider disponibili e relativi default

| `provider` | `model` default | `apiKey` | Note |
|---|---|---|---|
| `'mock'` | — | non richiesta | Fixture locale, zero latenza, per dev/test/CI |
| `'gemini'` (**default**) | `gemini-1.5-flash` | Google AI Studio | Free tier: 15 RPM, 1M token/giorno |
| `'openai'` | `gpt-4o` | OpenAI | Massima qualità, a pagamento |
| `'huggingface'` | `llava-hf/llava-1.5-7b-hf` | HuggingFace | Free tier, latenza variabile |
| `'ollama'` | `llava:13b` | non richiesta | Locale, privacy-preserving |

#### Cambiare modello e client

Per usare un modello diverso di Gemini (es. `gemini-1.5-pro` per qualità superiore, o `gemini-2.0-flash` quando disponibile):

```typescript
ai: {
  provider: 'gemini',
  model: 'gemini-1.5-pro',   // sovrascrive il default 'gemini-1.5-flash'
  apiKey: 'AIza...',
}
```

Per usare un endpoint compatibile con l'API Gemini ma ospitato altrove (es. Vertex AI):

```typescript
ai: {
  provider: 'gemini',
  model: 'gemini-1.5-flash',
  apiKey: 'AIza...',
  baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1/...',  // endpoint custom
}
```

Per Ollama con un modello locale diverso da `llava:13b`:

```typescript
ai: {
  provider: 'ollama',
  model: 'llava:7b',         // modello più leggero per macchine con poca VRAM
  baseUrl: 'http://localhost:11434',  // default Ollama, sovrascrivibile
}
```
```

### Lifecycle: idratazione ad ogni `enable()`

La chiamata AI avviene in `enable()`, non in `mount()`. Questo è intenzionale: l'utente potrebbe zoomare su un dettaglio prima di attivare il layer, e le descrizioni devono riflettere **quello che vede in quel momento**, non la vista iniziale.

```
Alt+A (o click sul toggle)
  → SenseArtViewer.enable()
      → mapper.snapshotViewport()         ← cattura bounds viewport corrente
      → mapClient.clearCache()            ← forza ri-fetch ad ogni attivazione
      → hydrateAILabels() [async]         ← non blocca l'attivazione del layer
          → canvas.toDataURL('image/jpeg') ← screenshot del viewport corrente
          → dispatch 'senseArt:ai-loading' ← UI mostra "⏳ AI analizza la vista…"
          → ArtworkMapClient.getMap(dataUrl, grid)
              → provider.fetchMap(dataUrl, grid)
                  → [Gemini API call con canvas corrente come immagine]
                  → parse + validate JSON
              → cache (keyed su dataUrl + grid)
          → per ogni cella (r, c):
              A11yOverlay.updateCellLabel(r, c, metadata.label)
              GridCell.metadata = metadata
          → dispatch 'senseArt:ai-ready'  ← UI mostra "✓ Etichette AI pronte"
      → overlay.setInteractive(true)
      → focusTrap.activate()
```

L'attivazione del layer è **immediata**: la griglia ARIA è navigabile con etichette generiche mentre l'AI lavora in background (≈1–2s). Se il provider fallisce, le etichette generiche rimangono — degradazione silenziosa.

### Evento di stato AI: `senseArt:ai-loading` / `senseArt:ai-ready`

`SenseArtViewer` dispatcha due eventi custom sul container OSD durante ogni idratazione:

```typescript
// Inizio chiamata AI
container.dispatchEvent(new CustomEvent('senseArt:ai-loading', { bubbles: true }))

// Fine (successo o fallimento)
container.dispatchEvent(new CustomEvent('senseArt:ai-ready', { bubbles: true }))
```

Il consumer può ascoltarli per aggiornare la UI:

```typescript
const osdEl = document.getElementById('osd')!

osdEl.addEventListener('senseArt:ai-loading', () => {
  loadingBadge.style.display = 'inline'
})
osdEl.addEventListener('senseArt:ai-ready', () => {
  loadingBadge.style.display = 'none'
  readyBadge.style.display = 'inline'
})
```

`senseArt:ai-ready` è sempre emesso (nel `finally`), anche in caso di errore — l'indicatore di caricamento non rimane bloccato.

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

- Le chiavi API (`apiKey`) non vengono mai loggate o esposte in bundle pubblici. Passarle come variabile d'ambiente server-side per produzione.
- `OllamaProvider` è l'unica opzione che non invia dati a server remoti — raccomandata per opere inedite o contesti con restrizioni IP.
- `MockProvider` non richiede nessuna chiave ed è sicuro per ambienti offline e testing CI.
