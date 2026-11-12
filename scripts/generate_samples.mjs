import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve(out);
    else reject(new Error(`${cmd} ${args.join(' ')} uscito con codice ${code}: ${err || out}`));
  });
});

const SAMPLE_TEXT = 'Buongiorno! Stai ascoltando Quotidie, la tua rassegna del mattino. Oggi esploriamo le notizie principali e una nuova lezione di storia e scienza.';

const QWEN_DIR = path.join(os.homedir(), 'qwen3-tts');
const QWEN_BIN = path.join(QWEN_DIR, 'qwen_tts');
const QWEN_MODEL = path.join(QWEN_DIR, 'qwen3-tts-0.6b');
const OUT_DIR = path.resolve('data', 'audio', 'samples');

const QWEN_SPEAKERS = [
  { id: 'ryan', name: 'Ryan', gender: 'male', desc: 'Maschile, ritmo dinamico e incisivo' },
  { id: 'aiden', name: 'Aiden', gender: 'male', desc: 'Maschile, tono solare, pulito e moderno' },
  { id: 'dylan', name: 'Dylan', gender: 'male', desc: 'Maschile, voce naturale, giovanile e morbida' },
  { id: 'eric', name: 'Eric', gender: 'male', desc: 'Maschile, vivace, brillante ed energico' },
  { id: 'uncle_fu', name: 'Uncle Fu', gender: 'male', desc: 'Maschile, profondo, caldo e maturo' },
  { id: 'serena', name: 'Serena', gender: 'female', desc: 'Femminile, calda, rassicurante e fluida' },
  { id: 'vivian', name: 'Vivian', gender: 'female', desc: 'Femminile, limpida, chiara e brillante' },
  { id: 'ono_anna', name: 'Ono Anna', gender: 'female', desc: 'Femminile, vivace, spontanea e colloquiale' },
  { id: 'sohee', name: 'Sohee', gender: 'female', desc: 'Femminile, espressiva e armoniosa' },
];

const EDGE_VOICES = [
  { id: 'giuseppe', voice: 'it-IT-GiuseppeMultilingualNeural', name: 'Giuseppe', gender: 'male', desc: 'Voce italiana predefinita Edge-TTS, rapida e chiara' },
  { id: 'diego', voice: 'it-IT-DiegoNeural', name: 'Diego', gender: 'male', desc: 'Voce maschile classica Edge-TTS' },
  { id: 'isabella', voice: 'it-IT-IsabellaNeural', name: 'Isabella', gender: 'female', desc: 'Voce femminile naturale Edge-TTS' },
  { id: 'elsa', voice: 'it-IT-ElsaNeural', name: 'Elsa', gender: 'female', desc: 'Voce femminile classica Edge-TTS' },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Directory creata/verificata: ${OUT_DIR}`);

  // 1. Voci Qwen3-TTS
  if (existsSync(QWEN_BIN) && existsSync(QWEN_MODEL)) {
    console.log('\n=== Generazione campioni Qwen3-TTS ===');
    for (const spk of QWEN_SPEAKERS) {
      console.log(`- Sintesi Qwen: ${spk.id} (${spk.name})...`);
      const wavOut = path.join(os.tmpdir(), `sample-qwen-${spk.id}.wav`);
      const mp3Out = path.join(OUT_DIR, `sample-${spk.id}.mp3`);
      try {
        await run(QWEN_BIN, [
          '-d', QWEN_MODEL,
          '-s', spk.id,
          '-l', 'Italian',
          '--int4',
          '--silent',
          '--text', SAMPLE_TEXT,
          '-o', wavOut,
        ]);
        await run('ffmpeg', [
          '-y',
          '-loglevel', 'error',
          '-i', wavOut,
          '-ac', '1',
          '-codec:a', 'libmp3lame',
          '-b:a', '64k',
          mp3Out,
        ]);
        console.log(`  ✓ MP3 creato: ${path.basename(mp3Out)}`);
      } catch (err) {
        console.error(`  ✗ Errore sintesi ${spk.id}:`, err.message);
      }
    }
  } else {
    console.warn(`\n[AVVISO] Binario Qwen non trovato (${QWEN_BIN}): salto le voci Qwen.`);
  }

  // 2. Voci Edge-TTS
  console.log('\n=== Generazione campioni Edge-TTS ===');
  for (const { id, voice, name } of EDGE_VOICES) {
    console.log(`- Sintesi Edge: ${name} (${voice})...`);
    const mp3Out = path.join(OUT_DIR, `sample-${id}.mp3`);
    try {
      await run('edge-tts', [
        '--voice', voice,
        '--text', SAMPLE_TEXT,
        '--write-media', mp3Out,
      ]);
      console.log(`  ✓ MP3 creato: ${path.basename(mp3Out)}`);
    } catch (err) {
      console.error(`  ✗ Errore Edge ${voice}:`, err.message);
    }
  }

  // 3. Salva catalogo JSON per la pagina di ascolto
  const manifest = {
    sampleText: SAMPLE_TEXT,
    updatedAt: new Date().toISOString(),
    qwen: QWEN_SPEAKERS.map((s) => ({
      ...s,
      file: `data/audio/samples/sample-${s.id}.mp3`,
      engine: 'qwen3-tts',
    })),
    edge: EDGE_VOICES.map((s) => ({
      ...s,
      file: `data/audio/samples/sample-${s.id}.mp3`,
      engine: 'edge-tts',
    })),
  };
  const manifestPath = path.join(OUT_DIR, 'voices.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nManifest scritto in: ${manifestPath}`);
  console.log('Generazione completata con successo!');
}

main().catch((err) => {
  console.error('Errore fatale:', err);
  process.exit(1);
});
