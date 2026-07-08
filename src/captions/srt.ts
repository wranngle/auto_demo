import type {DemoFlow, DemoStep} from '../types.js';

export const supportedLanguages = ['en', 'es', 'pt', 'fr'] as const;
export type CaptionLanguage = (typeof supportedLanguages)[number];

const defaultCaptionMs = 1200;
const minDisplayMs = 600;

type CaptionCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

export function parseLanguages(raw: string): CaptionLanguage[] {
  const seen = new Set<CaptionLanguage>();
  const out: CaptionLanguage[] = [];
  for (const part of raw.split(',')) {
    const code = part.trim().toLowerCase();
    if (code.length === 0) {
      continue;
    }

    if (!isSupported(code)) {
      throw new Error(`Unsupported caption language: ${code}. Supported: ${supportedLanguages.join(',')}`);
    }

    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }

  if (out.length === 0) {
    throw new Error('captions-lang requires at least one language code');
  }

  return out;
}

export function buildCaptionCues(flow: DemoFlow, effectiveSpeed?: number): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let cursorMs = 0;
  let index = 0;

  // The runner divides every wait by its EFFECTIVE speed — the clamped
  // `options.speed ?? flow.timing?.speed ?? 1` (normalizeTiming in
  // runner.ts) — so cue estimates must scale by the same value or captions
  // drift behind the retimed video (~35% on the 1.35x widget flows; 2x on
  // a `--speed 2` override). The runner passes that value in; callers
  // without runtime context fall back to the flow's own pinned speed.
  const rawSpeed = effectiveSpeed ?? flow.timing?.speed;
  const speed = rawSpeed !== undefined && rawSpeed > 0 ? rawSpeed : 1;

  for (const step of flow.steps) {
    const dwellMs = estimateStepMs(step) / speed;
    if (step.action === 'caption' && typeof step.text === 'string' && step.text.length > 0) {
      index += 1;
      const startMs = cursorMs;
      const endMs = cursorMs + Math.max(dwellMs, minDisplayMs);
      cues.push({
        index,
        startMs,
        endMs,
        text: step.text,
      });
    }

    cursorMs += dwellMs;
  }

  return cues;
}

export function renderSrt(cues: CaptionCue[], translator: (text: string) => string): string {
  return cues
    .map(cue => [
      String(cue.index),
      `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`,
      translator(cue.text),
      '',
    ].join('\n'))
    .join('\n');
}

export function translateCaption(text: string, lang: CaptionLanguage): string {
  if (lang === 'en') {
    return text;
  }

  const dict = phraseBook.get(lang);
  if (dict === undefined) {
    return text;
  }

  return text.replaceAll(/[\p{L}\p{N}']+/gv, token => {
    const lower = token.toLowerCase();
    const translated = dict.get(lower);
    if (translated === undefined) {
      return token;
    }

    return preserveCase(token, translated);
  });
}

export function formatTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const millis = safe % 1000;
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function isSupported(code: string): code is CaptionLanguage {
  return (supportedLanguages as readonly string[]).includes(code);
}

function estimateStepMs(step: DemoStep): number {
  if (step.action === 'caption') {
    return step.ms ?? defaultCaptionMs;
  }

  if (step.action === 'pause') {
    return step.ms ?? 0;
  }

  if (step.action === 'focus' || step.action === 'zoom' || step.action === 'resetZoom') {
    return (step.durationMs ?? 420) + (step.holdMs ?? 0);
  }

  if (step.action === 'fill') {
    return ((step.value?.length ?? 0) * 40) + 320;
  }

  if (step.action === 'click' || step.action === 'hover' || step.action === 'press') {
    return 420;
  }

  if (step.action === 'scroll') {
    return 320;
  }

  if (step.action === 'goto' || step.action === 'waitForText' || step.action === 'waitForSelector') {
    return 500;
  }

  return 200;
}

function preserveCase(source: string, target: string): string {
  if (source.length === 0) {
    return target;
  }

  if (source.toUpperCase() === source) {
    return target.toUpperCase();
  }

  const firstChar = source.charAt(0);
  if (firstChar === firstChar.toUpperCase() && source.startsWith(firstChar)) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }

  return target;
}

const phraseBook = new Map<CaptionLanguage, Map<string, string>>([
  ['es', loadPhraseTable('open=abre|opens=abre|start=comienza|starts=comienza|on=en|the=el|working=trabajo|surface=superficie|then=luego|move=avanza|through=por|ui=interfaz|in=en|reading=lectura|order=orden|proof=prueba|not=no|a=un|title=título|slide=diapositiva|next=siguiente|action=acción|review=revisión|search=buscar|voice=voz|automation=automatización|capture=captura|final=final|state=estado|return=volver|to=a|full=completo|context=contexto|confirm=confirmar|landing=inicio|view=vista|show=mostrar|opening=apertura|caption=subtítulo|pipeline=canalización|console=consola|opportunity=oportunidad|zoom=acercar|toward=hacia|fit=ajustar|page=página|frame=cuadro|recording=grabación|demo=demostración')],
  ['pt', loadPhraseTable('open=abre|opens=abre|start=começa|starts=começa|on=em|the=o|working=trabalho|surface=superfície|then=depois|move=mova|through=pela|ui=interface|in=em|reading=leitura|order=ordem|proof=prova|not=não|a=um|title=título|slide=slide|next=próxima|action=ação|review=revisão|search=pesquisar|voice=voz|automation=automação|capture=captura|final=final|state=estado|return=voltar|to=para|full=completo|context=contexto|confirm=confirmar|landing=entrada|view=vista|show=mostrar|opening=abertura|caption=legenda|pipeline=pipeline|console=console|opportunity=oportunidade|zoom=aproximar|toward=em direção|fit=ajustar|page=página|frame=quadro|recording=gravação|demo=demonstração')],
  ['fr', loadPhraseTable('open=ouvre|opens=ouvre|start=commence|starts=commence|on=sur|the=la|working=travail|surface=surface|then=puis|move=avance|through=à travers|ui=interface|in=en|reading=lecture|order=ordre|proof=preuve|not=pas|a=une|title=titre|slide=diapositive|next=prochaine|action=action|review=révision|search=recherche|voice=voix|automation=automatisation|capture=capturer|final=final|state=état|return=revenir|to=à|full=plein|context=contexte|confirm=confirmer|landing=arrivée|view=vue|show=montrer|opening=ouverture|caption=légende|pipeline=pipeline|console=console|opportunity=occasion|zoom=agrandir|toward=vers|fit=ajuster|page=page|frame=cadre|recording=enregistrement|demo=démonstration')],
]);

function loadPhraseTable(packed: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of packed.split('|')) {
    const eqIndex = entry.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    out.set(entry.slice(0, eqIndex), entry.slice(eqIndex + 1));
  }

  return out;
}
