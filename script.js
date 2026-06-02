const refs = {
  fileInput: document.getElementById('audio-file'),
  dropZone: document.getElementById('drop-zone'),
  resetButton: document.getElementById('reset-button'),
  audioPlayer: document.getElementById('audio-player'),
  statusText: document.getElementById('status-text'),
  statusDot: document.getElementById('status-dot'),
  toast: document.getElementById('toast'),
  reactorBpm: document.getElementById('reactor-bpm'),
  reactor: document.getElementById('reactor'),
  trackKicker: document.getElementById('track-kicker'),
  trackName: document.getElementById('track-name'),
  trackSubtitle: document.getElementById('track-subtitle'),
  waveform: document.getElementById('waveform-canvas'),
  spectrum: document.getElementById('spectrum-canvas'),
  spectrogram: document.getElementById('spectrogram-canvas'),
  loudness: document.getElementById('loudness-canvas'),
  bandList: document.getElementById('band-list'),
  metadataList: document.getElementById('metadata-list'),
  moodCopy: document.getElementById('mood-copy'),
  traitList: document.getElementById('trait-list'),
  signatureGrid: document.getElementById('signature-grid'),
  tags: {
    waveform: document.getElementById('waveform-tag'),
    spectrum: document.getElementById('spectrum-tag'),
    spectrogram: document.getElementById('spectrogram-tag'),
    loudness: document.getElementById('loudness-tag'),
    bands: document.getElementById('bands-tag'),
    mood: document.getElementById('mood-tag'),
    signature: document.getElementById('signature-tag')
  },
  metrics: {
    duration: document.getElementById('duration-value'),
    durationNote: document.getElementById('duration-note'),
    durationMeter: document.getElementById('duration-meter'),
    tempo: document.getElementById('tempo-value'),
    tempoNote: document.getElementById('tempo-note'),
    tempoMeter: document.getElementById('tempo-meter'),
    key: document.getElementById('key-value'),
    keyNote: document.getElementById('key-note'),
    keyMeter: document.getElementById('key-meter'),
    loudness: document.getElementById('loudness-value'),
    loudnessNote: document.getElementById('loudness-note'),
    loudnessMeter: document.getElementById('loudness-meter'),
    dynamic: document.getElementById('dynamic-value'),
    dynamicNote: document.getElementById('dynamic-note'),
    dynamicMeter: document.getElementById('dynamic-meter'),
    centroid: document.getElementById('centroid-value'),
    centroidNote: document.getElementById('centroid-note'),
    centroidMeter: document.getElementById('centroid-meter'),
    stereo: document.getElementById('stereo-value'),
    stereoNote: document.getElementById('stereo-note'),
    stereoMeter: document.getElementById('stereo-meter'),
    clip: document.getElementById('clip-value'),
    clipNote: document.getElementById('clip-note'),
    clipMeter: document.getElementById('clip-meter')
  }
};

const BAND_DEFS = [
  { key: 'sub', label: 'Sub', range: '20-60 Hz', min: 20, max: 60 },
  { key: 'bass', label: 'Bass', range: '60-250 Hz', min: 60, max: 250 },
  { key: 'lowMid', label: 'Low Mid', range: '250-500 Hz', min: 250, max: 500 },
  { key: 'mid', label: 'Mid', range: '500 Hz-2 kHz', min: 500, max: 2000 },
  { key: 'presence', label: 'Presence', range: '2-6 kHz', min: 2000, max: 6000 },
  { key: 'air', label: 'Air', range: '6-16 kHz', min: 6000, max: 16000 }
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

let audioContext;
let currentAnalysis = null;
let currentObjectUrl = '';
let animationFrame = 0;
let resizeTimer = 0;
let toastTimer = 0;

initialize();

function initialize() {
  refs.dropZone.addEventListener('dragenter', handleDragEnter);
  refs.dropZone.addEventListener('dragover', preventDefault);
  refs.dropZone.addEventListener('dragleave', handleDragLeave);
  refs.dropZone.addEventListener('drop', handleDrop);
  refs.fileInput.addEventListener('change', () => {
    const file = refs.fileInput.files?.[0];
    if (file) handleFile(file);
  });
  refs.resetButton.addEventListener('click', resetApp);
  refs.audioPlayer.addEventListener('play', startPlaybackLoop);
  refs.audioPlayer.addEventListener('pause', stopPlaybackLoop);
  refs.audioPlayer.addEventListener('ended', stopPlaybackLoop);
  refs.audioPlayer.addEventListener('seeked', () => drawAllCanvases());
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(drawAllCanvases, 120);
  });

  renderEmptyState();
}

function preventDefault(event) {
  event.preventDefault();
}

function handleDragEnter(event) {
  event.preventDefault();
  refs.dropZone.classList.add('is-dragging');
}

function handleDragLeave(event) {
  event.preventDefault();
  if (!refs.dropZone.contains(event.relatedTarget)) {
    refs.dropZone.classList.remove('is-dragging');
  }
}

function handleDrop(event) {
  event.preventDefault();
  refs.dropZone.classList.remove('is-dragging');
  const file = event.dataTransfer?.files?.[0];
  if (file) handleFile(file);
}

async function handleFile(file) {
  if (!isAudioFile(file)) {
    showToast('오디오 파일을 선택해 주세요.');
    return;
  }

  stopPlaybackLoop();
  setBusy(true, '파일 읽는 중');
  resetVisualLabels('분석 중');

  try {
    initAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    await nextFrame();
    setBusy(true, '오디오 디코딩 중');
    const audioBuffer = await decodeAudio(arrayBuffer.slice(0));

    setBusy(true, '메타데이터 정리 중');
    const tags = parseAudioTags(arrayBuffer, file);
    await nextFrame();

    setBusy(true, '파형 계산 중');
    const mono = createMonoSignal(audioBuffer);
    const waveform = makeWaveformPeaks(mono, 2400);
    await nextFrame();

    setBusy(true, '라우드니스 계산 중');
    const loudness = analyzeLoudness(mono, audioBuffer.sampleRate);
    await nextFrame();

    setBusy(true, 'BPM 추정 중');
    const tempo = estimateTempo(mono, audioBuffer.sampleRate);
    await nextFrame();

    setBusy(true, '스펙트럼 분석 중');
    const spectrum = analyzeSpectrum(mono, audioBuffer.sampleRate);
    await nextFrame();

    setBusy(true, '키와 색채 추정 중');
    const key = estimateKey(mono, audioBuffer.sampleRate);
    const stereo = analyzeStereo(audioBuffer);
    const zcr = estimateZeroCrossing(mono, audioBuffer.sampleRate);
    const spectrogram = makeSpectrogram(mono, audioBuffer.sampleRate);
    const signature = buildSoundSignature({ loudness, tempo, spectrum, key, stereo, zcr });
    const hue = deriveAccentHue(key, spectrum, tempo);

    currentAnalysis = {
      file,
      tags,
      audioBuffer,
      waveform,
      loudness,
      tempo,
      spectrum,
      spectrogram,
      key,
      stereo,
      zcr,
      signature,
      hue,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      bitrate: audioBuffer.duration > 0 ? (file.size * 8) / audioBuffer.duration / 1000 : 0
    };

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    refs.audioPlayer.src = currentObjectUrl;

    applyAnalysis(currentAnalysis);
    setBusy(false, '분석 완료');
    document.body.classList.add('has-analysis');
    refs.resetButton.hidden = false;
  } catch (error) {
    console.error(error);
    setBusy(false, '분석 실패');
    showToast('이 파일은 브라우저에서 디코딩할 수 없습니다.');
    renderEmptyState();
  }
}

function isAudioFile(file) {
  const knownExtension = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|webm)$/i.test(file.name);
  return file.type.startsWith('audio/') || knownExtension;
}

function initAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    throw new Error('AudioContext is not supported.');
  }
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

async function decodeAudio(arrayBuffer) {
  try {
    return await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    return new Promise((resolve, reject) => {
      audioContext.decodeAudioData(arrayBuffer, resolve, reject);
    });
  }
}

function createMonoSignal(buffer) {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  if (channels === 1) {
    return buffer.getChannelData(0);
  }

  const mono = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / channels;
    }
  }
  return mono;
}

function makeWaveformPeaks(samples, pointCount) {
  const peaks = new Float32Array(pointCount * 3);
  const block = Math.max(1, Math.floor(samples.length / pointCount));

  for (let i = 0; i < pointCount; i += 1) {
    const start = i * block;
    const end = Math.min(samples.length, start + block);
    let min = 1;
    let max = -1;
    let sum = 0;

    for (let j = start; j < end; j += 1) {
      const value = samples[j] || 0;
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value * value;
    }

    const count = Math.max(1, end - start);
    peaks[i * 3] = min;
    peaks[i * 3 + 1] = max;
    peaks[i * 3 + 2] = Math.sqrt(sum / count);
  }

  return peaks;
}

function analyzeLoudness(samples, sampleRate) {
  const windowSize = Math.max(1024, Math.floor(sampleRate * 0.5));
  const windows = [];
  let sumSquares = 0;
  let peak = 0;
  let clipCount = 0;
  let dcSum = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] || 0;
    const abs = Math.abs(value);
    sumSquares += value * value;
    dcSum += value;
    if (abs > peak) peak = abs;
    if (abs >= 0.999) clipCount += 1;
  }

  for (let start = 0; start < samples.length; start += windowSize) {
    let localSum = 0;
    let localPeak = 0;
    const end = Math.min(samples.length, start + windowSize);
    for (let i = start; i < end; i += 1) {
      const value = samples[i] || 0;
      localSum += value * value;
      localPeak = Math.max(localPeak, Math.abs(value));
    }
    const count = Math.max(1, end - start);
    windows.push({
      time: start / sampleRate,
      rms: Math.sqrt(localSum / count),
      db: ampToDb(Math.sqrt(localSum / count)),
      peak: localPeak
    });
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  const windowDbs = windows.map((item) => item.db).filter(Number.isFinite).sort((a, b) => a - b);
  const p10 = percentile(windowDbs, 0.1);
  const p90 = percentile(windowDbs, 0.9);
  const rmsDb = ampToDb(rms);
  const peakDb = ampToDb(peak);
  const dynamicRange = Number.isFinite(p90 - p10) ? Math.max(0, p90 - p10) : 0;

  return {
    rms,
    rmsDb,
    peak,
    peakDb,
    crest: Math.max(0, peakDb - rmsDb),
    dynamicRange,
    clippingPercent: samples.length ? (clipCount / samples.length) * 100 : 0,
    dcOffset: samples.length ? dcSum / samples.length : 0,
    windows,
    energyScore: clamp((rmsDb + 36) / 30, 0, 1)
  };
}

function estimateTempo(samples, sampleRate) {
  const hopSize = Math.max(256, Math.floor(sampleRate * 0.02));
  const frameSize = Math.max(hopSize * 2, Math.floor(sampleRate * 0.046));
  const maxSamples = Math.min(samples.length, sampleRate * 300);
  const envelope = [];

  for (let start = 0; start + frameSize < maxSamples; start += hopSize) {
    let energy = 0;
    for (let i = start; i < start + frameSize; i += 1) {
      const value = samples[i] || 0;
      energy += Math.abs(value);
    }
    envelope.push(energy / frameSize);
  }

  if (envelope.length < 24) {
    return { bpm: 0, confidence: 0 };
  }

  const flux = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i += 1) {
    flux[i] = Math.max(0, envelope[i] - envelope[i - 1]);
  }

  const smoothed = smoothArray(flux, 4);
  const frameRate = sampleRate / hopSize;
  let bestBpm = 0;
  let bestScore = 0;
  const scores = [];

  for (let bpm = 58; bpm <= 190; bpm += 1) {
    const lag = Math.round((60 / bpm) * frameRate);
    if (lag < 2 || lag >= smoothed.length) continue;
    let score = 0;
    for (let i = lag; i < smoothed.length; i += 1) {
      score += smoothed[i] * smoothed[i - lag];
    }
    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  if (!bestBpm) {
    return { bpm: 0, confidence: 0 };
  }

  const averageScore = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
  const confidence = clamp((bestScore / Math.max(averageScore, 1e-9) - 1) / 2.4, 0, 1);
  return { bpm: bestBpm, confidence };
}

function analyzeSpectrum(samples, sampleRate) {
  const fftSize = 4096;
  const frameCount = Math.min(90, Math.max(12, Math.floor(samples.length / sampleRate)));
  const magnitudes = new Float32Array(fftSize / 2);
  const window = hannWindow(fftSize);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const maxStart = Math.max(0, samples.length - fftSize - 1);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = Math.floor((maxStart * frame) / Math.max(1, frameCount - 1));
    real.fill(0);
    imag.fill(0);
    for (let i = 0; i < fftSize; i += 1) {
      real[i] = (samples[start + i] || 0) * window[i];
    }
    fft(real, imag);
    for (let bin = 1; bin < fftSize / 2; bin += 1) {
      const mag = Math.hypot(real[bin], imag[bin]);
      magnitudes[bin] += mag / frameCount;
    }
  }

  const binHz = sampleRate / fftSize;
  let total = 0;
  let weighted = 0;
  let cumulative = 0;
  let rolloff = 0;
  let maxMagnitude = 0;
  const bands = BAND_DEFS.map((band) => ({ ...band, energy: 0, percent: 0 }));

  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    const freq = bin * binHz;
    const value = magnitudes[bin];
    total += value;
    weighted += value * freq;
    maxMagnitude = Math.max(maxMagnitude, value);
    bands.forEach((band) => {
      if (freq >= band.min && freq < band.max) band.energy += value;
    });
  }

  const threshold = total * 0.85;
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    cumulative += magnitudes[bin];
    if (cumulative >= threshold) {
      rolloff = bin * binHz;
      break;
    }
  }

  let highEnergy = 0;
  let lowEnergy = 0;
  let geometric = 0;
  let arithmetic = 0;
  let flatnessCount = 0;
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    const freq = bin * binHz;
    const value = magnitudes[bin];
    if (freq >= 3000) highEnergy += value;
    if (freq <= 250) lowEnergy += value;
    if (freq >= 80 && freq <= 12000 && value > 0) {
      geometric += Math.log(value + 1e-12);
      arithmetic += value;
      flatnessCount += 1;
    }
  }

  bands.forEach((band) => {
    band.percent = total ? band.energy / total : 0;
  });

  const flatness = flatnessCount
    ? Math.exp(geometric / flatnessCount) / Math.max(arithmetic / flatnessCount, 1e-12)
    : 0;

  return {
    magnitudes,
    binHz,
    maxMagnitude,
    bands,
    centroid: total ? weighted / total : 0,
    rolloff,
    brightness: total ? highEnergy / total : 0,
    warmth: total ? lowEnergy / total : 0,
    flatness: clamp(flatness, 0, 1)
  };
}

function makeSpectrogram(samples, sampleRate) {
  const fftSize = 2048;
  const frameCount = 168;
  const binCount = 128;
  const window = hannWindow(fftSize);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const values = Array.from({ length: frameCount }, () => new Float32Array(binCount));
  const maxStart = Math.max(0, samples.length - fftSize - 1);
  const binHz = sampleRate / fftSize;
  const minHz = 45;
  const maxHz = Math.min(16000, sampleRate / 2);
  let maxValue = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = Math.floor((maxStart * frame) / Math.max(1, frameCount - 1));
    real.fill(0);
    imag.fill(0);
    for (let i = 0; i < fftSize; i += 1) {
      real[i] = (samples[start + i] || 0) * window[i];
    }
    fft(real, imag);

    for (let y = 0; y < binCount; y += 1) {
      const ratio = 1 - y / Math.max(1, binCount - 1);
      const freq = minHz * Math.pow(maxHz / minHz, ratio);
      const bin = clamp(Math.round(freq / binHz), 1, fftSize / 2 - 1);
      const mag = Math.hypot(real[bin], imag[bin]);
      const value = Math.log10(1 + mag * 18);
      values[frame][y] = value;
      if (value > maxValue) maxValue = value;
    }
  }

  if (maxValue > 0) {
    values.forEach((frame) => {
      for (let i = 0; i < frame.length; i += 1) {
        frame[i] /= maxValue;
      }
    });
  }

  return { values, frameCount, binCount, minHz, maxHz };
}

function estimateKey(samples, sampleRate) {
  const fftSize = 4096;
  const frameCount = Math.min(72, Math.max(10, Math.floor(samples.length / sampleRate)));
  const chroma = new Float32Array(12);
  const window = hannWindow(fftSize);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const maxStart = Math.max(0, samples.length - fftSize - 1);
  const binHz = sampleRate / fftSize;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = Math.floor((maxStart * frame) / Math.max(1, frameCount - 1));
    real.fill(0);
    imag.fill(0);
    for (let i = 0; i < fftSize; i += 1) {
      real[i] = (samples[start + i] || 0) * window[i];
    }
    fft(real, imag);

    for (let bin = 1; bin < fftSize / 2; bin += 1) {
      const freq = bin * binHz;
      if (freq < 55 || freq > 5000) continue;
      const midi = Math.round(69 + 12 * Math.log2(freq / 440));
      const pitchClass = ((midi % 12) + 12) % 12;
      const magnitude = Math.hypot(real[bin], imag[bin]);
      chroma[pitchClass] += magnitude / Math.sqrt(freq);
    }
  }

  normalizeArray(chroma);
  let best = { root: 0, mode: 'major', score: -Infinity };
  const allScores = [];

  for (let root = 0; root < 12; root += 1) {
    const major = profileScore(chroma, MAJOR_PROFILE, root);
    const minor = profileScore(chroma, MINOR_PROFILE, root);
    allScores.push(major, minor);
    if (major > best.score) best = { root, mode: 'major', score: major };
    if (minor > best.score) best = { root, mode: 'minor', score: minor };
  }

  const avg = allScores.reduce((sum, value) => sum + value, 0) / allScores.length;
  const max = Math.max(...allScores);
  const confidence = clamp((max - avg) / Math.max(Math.abs(max), 1e-9) * 2.2, 0, 1);
  const rootName = NOTE_NAMES[best.root];
  const modeKo = best.mode === 'major' ? '장조' : '단조';

  return {
    root: rootName,
    mode: best.mode,
    label: `${rootName} ${modeKo}`,
    confidence,
    chroma: Array.from(chroma)
  };
}

function analyzeStereo(buffer) {
  if (buffer.numberOfChannels < 2) {
    return { width: 0, correlation: 1, label: 'Mono' };
  }

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const step = Math.max(1, Math.floor(left.length / 250000));
  let sumLr = 0;
  let sumL2 = 0;
  let sumR2 = 0;
  let sumMid2 = 0;
  let sumSide2 = 0;
  let count = 0;

  for (let i = 0; i < left.length; i += step) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    sumLr += l * r;
    sumL2 += l * l;
    sumR2 += r * r;
    sumMid2 += mid * mid;
    sumSide2 += side * side;
    count += 1;
  }

  const correlation = sumL2 && sumR2 ? sumLr / Math.sqrt(sumL2 * sumR2) : 1;
  const width = Math.sqrt(sumSide2 / Math.max(count, 1)) / Math.max(Math.sqrt(sumMid2 / Math.max(count, 1)), 1e-9);
  const label = width < 0.18 ? 'Narrow' : width < 0.55 ? 'Balanced' : width < 1.1 ? 'Wide' : 'Ultra Wide';
  return { width: clamp(width, 0, 1.8), correlation: clamp(correlation, -1, 1), label };
}

function estimateZeroCrossing(samples, sampleRate) {
  const step = Math.max(1, Math.floor(samples.length / 600000));
  let crossings = 0;
  let previous = samples[0] || 0;
  let inspected = 0;

  for (let i = step; i < samples.length; i += step) {
    const current = samples[i] || 0;
    if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) crossings += 1;
    previous = current;
    inspected += 1;
  }

  const inspectedSeconds = inspected * step / sampleRate;
  return inspectedSeconds ? crossings / inspectedSeconds : 0;
}

function buildSoundSignature({ loudness, tempo, spectrum, key, stereo, zcr }) {
  const energy = loudness.energyScore;
  const pace = tempo.bpm ? clamp((tempo.bpm - 60) / 130, 0, 1) : 0.35;
  const brightness = clamp(spectrum.brightness * 4.5, 0, 1);
  const warmth = clamp(spectrum.warmth * 7, 0, 1);
  const space = clamp(stereo.width / 1.2, 0, 1);
  const texture = clamp((spectrum.flatness * 0.65) + (zcr / 7200), 0, 1);
  const bass = clamp((spectrum.bands.find((band) => band.key === 'bass')?.percent || 0) * 8, 0, 1);

  const descriptors = [];
  descriptors.push(energy > 0.68 ? '강한 에너지' : energy > 0.42 ? '안정적인 에너지' : '부드러운 에너지');
  descriptors.push(pace > 0.68 ? '빠른 리듬' : pace > 0.38 ? '중간 템포' : '느린 흐름');
  descriptors.push(brightness > 0.6 ? '밝은 질감' : warmth > 0.55 ? '따뜻한 질감' : '차분한 톤');
  descriptors.push(space > 0.58 ? '넓은 공간감' : '집중된 이미지');
  if (key.confidence > 0.34) descriptors.push(key.mode === 'major' ? '장조 색채' : '단조 색채');

  let genreHint = 'cinematic / indie';
  if (pace > 0.68 && bass > 0.48 && brightness > 0.42) genreHint = 'electronic / dance';
  else if (pace > 0.55 && energy > 0.55 && brightness > 0.45) genreHint = 'pop / rock';
  else if (pace < 0.35 && warmth > 0.52) genreHint = 'ballad / ambient';
  else if (texture > 0.55 && space > 0.5) genreHint = 'experimental / electronic';
  else if (bass > 0.55 && pace < 0.55) genreHint = 'hip-hop / groove';

  const mood = [
    energy > 0.62 ? '선명하고 추진력이 있는 편입니다' : '압박감보다는 여백이 살아 있습니다',
    brightness > 0.55 ? '고역대가 전면에 있어 반짝이는 인상이 납니다' : '중저역 중심의 색이 더 두드러집니다',
    space > 0.55 ? '좌우 스테이지가 넓게 펼쳐집니다' : '중앙 이미지가 단단하게 잡혀 있습니다'
  ].join('. ') + '.';

  return {
    traits: [
      { label: 'Energy', value: energy },
      { label: 'Pace', value: pace },
      { label: 'Brightness', value: brightness },
      { label: 'Warmth', value: warmth },
      { label: 'Space', value: space },
      { label: 'Texture', value: texture }
    ],
    descriptors,
    genreHint,
    mood
  };
}

function deriveAccentHue(key, spectrum, tempo) {
  const noteHueMap = {
    C: 205,
    'C#': 230,
    D: 188,
    'D#': 265,
    E: 48,
    F: 160,
    'F#': 92,
    G: 175,
    'G#': 310,
    A: 24,
    'A#': 338,
    B: 208
  };
  const base = noteHueMap[key.root] ?? 172;
  const brightnessShift = clamp(spectrum.brightness * 90, 0, 60);
  const tempoShift = tempo.bpm ? clamp((tempo.bpm - 100) * 0.18, -16, 16) : 0;
  return Math.round((base + brightnessShift + tempoShift + 360) % 360);
}

function applyAnalysis(analysis) {
  document.documentElement.style.setProperty('--accent-h', analysis.hue);
  document.documentElement.style.setProperty('--energy', analysis.loudness.energyScore.toFixed(3));

  const title = analysis.tags.title || stripExtension(analysis.file.name);
  const artist = analysis.tags.artist || '알 수 없는 아티스트';
  refs.trackKicker.textContent = analysis.signature.genreHint;
  refs.trackName.textContent = title;
  refs.trackSubtitle.textContent = `${artist} · ${formatTime(analysis.duration)} · ${analysis.channels}ch · ${formatHz(analysis.sampleRate)}`;
  refs.reactorBpm.textContent = analysis.tempo.bpm ? Math.round(analysis.tempo.bpm) : '--';

  renderMetrics(analysis);
  renderMetadata(analysis);
  renderBands(analysis);
  renderMood(analysis);
  drawAllCanvases();

  refs.tags.waveform.textContent = '완료';
  refs.tags.spectrum.textContent = `${formatHz(analysis.spectrum.centroid)} 중심`;
  refs.tags.spectrogram.textContent = '완료';
  refs.tags.loudness.textContent = `${analysis.loudness.windows.length} windows`;
  refs.tags.bands.textContent = '6 bands';
  refs.tags.mood.textContent = analysis.signature.genreHint;
  refs.tags.signature.textContent = analysis.key.label;
}

function renderMetrics(analysis) {
  const loud = analysis.loudness;
  const tempo = analysis.tempo;
  const spectrum = analysis.spectrum;
  const stereo = analysis.stereo;

  refs.metrics.duration.textContent = formatTime(analysis.duration);
  refs.metrics.durationNote.textContent = `${analysis.file.type || 'audio'} · ${formatBytes(analysis.file.size)}`;
  setMeter(refs.metrics.durationMeter, clamp(analysis.duration / 420, 0.04, 1));

  refs.metrics.tempo.textContent = tempo.bpm ? Math.round(tempo.bpm) : '--';
  refs.metrics.tempoNote.textContent = tempo.confidence ? `신뢰도 ${Math.round(tempo.confidence * 100)}%` : '리듬 약함';
  setMeter(refs.metrics.tempoMeter, tempo.bpm ? clamp((tempo.bpm - 50) / 150, 0.05, 1) : 0.08);

  refs.metrics.key.textContent = analysis.key.label;
  refs.metrics.keyNote.textContent = `신뢰도 ${Math.round(analysis.key.confidence * 100)}%`;
  setMeter(refs.metrics.keyMeter, clamp(analysis.key.confidence, 0.08, 1));

  refs.metrics.loudness.textContent = `${loud.rmsDb.toFixed(1)} dBFS`;
  refs.metrics.loudnessNote.textContent = `peak ${loud.peakDb.toFixed(1)} dB`;
  setMeter(refs.metrics.loudnessMeter, loud.energyScore);

  refs.metrics.dynamic.textContent = `${loud.dynamicRange.toFixed(1)} dB`;
  refs.metrics.dynamicNote.textContent = `crest ${loud.crest.toFixed(1)} dB`;
  setMeter(refs.metrics.dynamicMeter, clamp(loud.dynamicRange / 22, 0.04, 1));

  refs.metrics.centroid.textContent = formatHz(spectrum.centroid);
  refs.metrics.centroidNote.textContent = `rolloff ${formatHz(spectrum.rolloff)}`;
  setMeter(refs.metrics.centroidMeter, clamp(spectrum.centroid / 6200, 0.04, 1));

  refs.metrics.stereo.textContent = stereo.label;
  refs.metrics.stereoNote.textContent = `corr ${stereo.correlation.toFixed(2)}`;
  setMeter(refs.metrics.stereoMeter, clamp(stereo.width / 1.35, 0.04, 1));

  refs.metrics.clip.textContent = `${loud.clippingPercent.toFixed(3)}%`;
  refs.metrics.clipNote.textContent = loud.clippingPercent > 0.02 ? '주의' : 'clean';
  setMeter(refs.metrics.clipMeter, clamp(loud.clippingPercent * 18, 0.02, 1));
}

function renderMetadata(analysis) {
  const tags = analysis.tags;
  const items = [
    ['파일명', analysis.file.name],
    ['제목', tags.title || '없음'],
    ['아티스트', tags.artist || '없음'],
    ['앨범', tags.album || '없음'],
    ['장르', tags.genre || '없음'],
    ['연도', tags.year || '없음'],
    ['트랙', tags.track || '없음'],
    ['길이', formatTime(analysis.duration)],
    ['파일 크기', formatBytes(analysis.file.size)],
    ['추정 비트레이트', analysis.bitrate ? `${Math.round(analysis.bitrate)} kbps` : '알 수 없음'],
    ['샘플레이트', formatHz(analysis.sampleRate)],
    ['채널', `${analysis.channels}ch`],
    ['DC 오프셋', analysis.loudness.dcOffset.toFixed(5)]
  ];

  refs.metadataList.innerHTML = items.map(([term, value]) => (
    `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(String(value))}</dd></div>`
  )).join('');
}

function renderBands(analysis) {
  refs.bandList.innerHTML = analysis.spectrum.bands.map((band) => {
    const width = clamp(band.percent * 6.4, 0.025, 1) * 100;
    return `
      <div class="band-row">
        <strong>${escapeHtml(band.label)}</strong>
        <span class="band-track" title="${escapeHtml(band.range)}"><span style="--band-width:${width.toFixed(1)}%"></span></span>
        <em>${Math.round(band.percent * 100)}%</em>
      </div>
    `;
  }).join('');
}

function renderMood(analysis) {
  refs.moodCopy.textContent = analysis.signature.mood;
  refs.traitList.innerHTML = analysis.signature.traits.map((trait) => `
    <div class="trait-row">
      <strong>${escapeHtml(trait.label)}</strong>
      <span class="trait-track"><span style="--trait-width:${Math.round(trait.value * 100)}%"></span></span>
    </div>
  `).join('');

  refs.signatureGrid.innerHTML = [
    ...analysis.signature.descriptors,
    analysis.key.label,
    analysis.signature.genreHint,
    `ZCR ${Math.round(analysis.zcr)}/s`
  ].map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
}

function drawAllCanvases() {
  if (!currentAnalysis) {
    renderEmptyCanvases();
    return;
  }
  drawWaveform(currentAnalysis, refs.audioPlayer.currentTime || 0);
  drawSpectrum(currentAnalysis);
  drawSpectrogram(currentAnalysis);
  drawLoudness(currentAnalysis, refs.audioPlayer.currentTime || 0);
}

function drawWaveform(analysis, currentTime = 0) {
  const { ctx, width, height, dpr } = prepareCanvas(refs.waveform);
  const peaks = analysis.waveform;
  const count = peaks.length / 3;
  const center = height * 0.5;
  const cursorX = analysis.duration ? (currentTime / analysis.duration) * width : 0;

  drawCanvasBackground(ctx, width, height, analysis.hue);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, center);
  ctx.lineTo(width, center);
  ctx.stroke();

  const upper = new Path2D();
  const lower = new Path2D();
  for (let i = 0; i < count; i += 1) {
    const x = (i / Math.max(1, count - 1)) * width;
    const min = peaks[i * 3];
    const max = peaks[i * 3 + 1];
    const yTop = center - Math.abs(max) * height * 0.42;
    const yBottom = center + Math.abs(min) * height * 0.42;
    if (i === 0) {
      upper.moveTo(x, yTop);
      lower.moveTo(x, yBottom);
    } else {
      upper.lineTo(x, yTop);
      lower.lineTo(x, yBottom);
    }
  }

  const fill = ctx.createLinearGradient(0, 0, width, 0);
  fill.addColorStop(0, `hsl(${analysis.hue} 86% 62% / 0.86)`);
  fill.addColorStop(0.52, 'rgba(244, 201, 93, 0.78)');
  fill.addColorStop(1, 'rgba(255, 116, 111, 0.82)');
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(1.5, dpr * 1.4);
  ctx.stroke(upper);
  ctx.stroke(lower);

  ctx.fillStyle = `hsl(${analysis.hue} 90% 62% / 0.12)`;
  for (let i = 0; i < count; i += 3) {
    const x = (i / Math.max(1, count - 1)) * width;
    const rms = peaks[i * 3 + 2];
    const barHeight = Math.max(1, rms * height * 0.9);
    ctx.fillRect(x, center - barHeight / 2, Math.max(1, width / count), barHeight);
  }

  if (currentTime > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = Math.max(1.5, dpr * 1.5);
    ctx.beginPath();
    ctx.moveTo(cursorX, 12 * dpr);
    ctx.lineTo(cursorX, height - 12 * dpr);
    ctx.stroke();
  }
}

function drawSpectrum(analysis) {
  const { ctx, width, height, dpr } = prepareCanvas(refs.spectrum);
  const { magnitudes, binHz, maxMagnitude } = analysis.spectrum;
  drawCanvasBackground(ctx, width, height, analysis.hue);

  const barCount = 96;
  const minHz = 35;
  const maxHz = Math.min(18000, analysis.sampleRate / 2);
  const gap = Math.max(1, dpr * 2);
  const barWidth = (width - gap * (barCount - 1)) / barCount;

  for (let i = 0; i < barCount; i += 1) {
    const a = i / barCount;
    const b = (i + 1) / barCount;
    const startHz = minHz * Math.pow(maxHz / minHz, a);
    const endHz = minHz * Math.pow(maxHz / minHz, b);
    const startBin = Math.max(1, Math.floor(startHz / binHz));
    const endBin = Math.min(magnitudes.length - 1, Math.ceil(endHz / binHz));
    let sum = 0;
    let localMax = 0;
    for (let bin = startBin; bin <= endBin; bin += 1) {
      sum += magnitudes[bin];
      localMax = Math.max(localMax, magnitudes[bin]);
    }
    const value = Math.max(sum / Math.max(1, endBin - startBin + 1), localMax * 0.55) / Math.max(maxMagnitude, 1e-12);
    const normalized = clamp(Math.log10(1 + value * 18) / Math.log10(19), 0, 1);
    const barHeight = Math.max(2 * dpr, normalized * height * 0.82);
    const x = i * (barWidth + gap);
    const y = height - barHeight - 18 * dpr;
    const hue = (analysis.hue + i * 1.7) % 360;
    ctx.fillStyle = `hsl(${hue} 86% ${58 + normalized * 18}% / ${0.36 + normalized * 0.56})`;
    roundRect(ctx, x, y, barWidth, barHeight, Math.min(6 * dpr, barWidth / 2));
    ctx.fill();
  }

  drawAxisLabel(ctx, `${formatHz(analysis.spectrum.centroid)} centroid`, width, height, dpr);
}

function drawSpectrogram(analysis) {
  const { ctx, width, height, dpr } = prepareCanvas(refs.spectrogram);
  const { values, frameCount, binCount } = analysis.spectrogram;
  drawCanvasBackground(ctx, width, height, analysis.hue);
  const cellW = width / frameCount;
  const cellH = height / binCount;

  for (let x = 0; x < frameCount; x += 1) {
    for (let y = 0; y < binCount; y += 1) {
      const value = values[x][y];
      if (value < 0.015) continue;
      const hue = (analysis.hue + value * 85 + y * 0.22) % 360;
      const light = 18 + value * 54;
      ctx.fillStyle = `hsl(${hue} 88% ${light}% / ${0.25 + value * 0.72})`;
      ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
    }
  }

  drawAxisLabel(ctx, `${formatHz(analysis.spectrogram.minHz)} - ${formatHz(analysis.spectrogram.maxHz)}`, width, height, dpr);
}

function drawLoudness(analysis, currentTime = 0) {
  const { ctx, width, height, dpr } = prepareCanvas(refs.loudness);
  const windows = analysis.loudness.windows;
  drawCanvasBackground(ctx, width, height, analysis.hue);

  if (!windows.length) return;

  const minDb = Math.min(-70, Math.floor(Math.min(...windows.map((item) => item.db)) / 5) * 5);
  const maxDb = 0;
  const yForDb = (db) => {
    const ratio = clamp((db - minDb) / (maxDb - minDb), 0, 1);
    return height - (ratio * (height - 34 * dpr) + 18 * dpr);
  };

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = Math.max(1, dpr);
  for (let line = -60; line <= 0; line += 12) {
    const y = yForDb(line);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, `hsl(${analysis.hue} 86% 62%)`);
  gradient.addColorStop(0.5, 'rgba(244, 201, 93, 0.95)');
  gradient.addColorStop(1, 'rgba(255, 116, 111, 0.95)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(2.5, dpr * 2.2);
  ctx.beginPath();

  windows.forEach((item, index) => {
    const x = (index / Math.max(1, windows.length - 1)) * width;
    const y = yForDb(item.db);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (currentTime > 0) {
    const cursorX = analysis.duration ? (currentTime / analysis.duration) * width : 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = Math.max(1.2, dpr * 1.2);
    ctx.beginPath();
    ctx.moveTo(cursorX, 10 * dpr);
    ctx.lineTo(cursorX, height - 10 * dpr);
    ctx.stroke();
  }

  drawAxisLabel(ctx, `${analysis.loudness.rmsDb.toFixed(1)} dBFS RMS`, width, height, dpr);
}

function drawCanvasBackground(ctx, width, height, hue) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, 'rgba(255,255,255,0.045)');
  bg.addColorStop(0.48, `hsl(${hue} 70% 20% / 0.18)`);
  bg.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  const spacing = Math.max(26, Math.round(width / 16));
  for (let x = spacing; x < width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function drawAxisLabel(ctx, text, width, height, dpr) {
  ctx.fillStyle = 'rgba(244,240,232,0.7)';
  ctx.font = `${Math.max(11, 11 * dpr)}px system-ui, sans-serif`;
  ctx.fillText(text, 12 * dpr, height - 12 * dpr);
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(320, Math.floor(rect.width * dpr));
  const height = Math.max(180, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height, dpr };
}

function renderEmptyState() {
  document.body.classList.remove('has-analysis', 'is-busy');
  document.documentElement.style.setProperty('--accent-h', 172);
  document.documentElement.style.setProperty('--energy', 0.32);
  document.documentElement.style.setProperty('--live-level', 0.12);
  refs.statusText.textContent = '로컬 분석 대기';
  refs.trackKicker.textContent = '분석 대기';
  refs.trackName.textContent = '아직 선택된 파일이 없습니다';
  refs.trackSubtitle.textContent = '파일을 선택하면 결과가 이곳에 정리됩니다.';
  refs.reactorBpm.textContent = '--';
  refs.resetButton.hidden = true;
  refs.audioPlayer.removeAttribute('src');
  refs.audioPlayer.load();

  Object.entries(refs.metrics).forEach(([key, element]) => {
    if (key.endsWith('Meter')) setMeter(element, 0);
  });
  refs.metrics.duration.textContent = '--:--';
  refs.metrics.durationNote.textContent = 'duration';
  refs.metrics.tempo.textContent = '--';
  refs.metrics.tempoNote.textContent = 'tempo';
  refs.metrics.key.textContent = '--';
  refs.metrics.keyNote.textContent = 'tonality';
  refs.metrics.loudness.textContent = '-- dBFS';
  refs.metrics.loudnessNote.textContent = 'RMS';
  refs.metrics.dynamic.textContent = '-- dB';
  refs.metrics.dynamicNote.textContent = 'range';
  refs.metrics.centroid.textContent = '-- Hz';
  refs.metrics.centroidNote.textContent = 'centroid';
  refs.metrics.stereo.textContent = '--';
  refs.metrics.stereoNote.textContent = 'width';
  refs.metrics.clip.textContent = '--%';
  refs.metrics.clipNote.textContent = 'peak risk';

  refs.bandList.innerHTML = BAND_DEFS.map((band) => `
    <div class="band-row">
      <strong>${band.label}</strong>
      <span class="band-track" title="${band.range}"><span style="--band-width:0%"></span></span>
      <em>0%</em>
    </div>
  `).join('');
  refs.metadataList.innerHTML = '<div><dt>상태</dt><dd>업로드 대기</dd></div>';
  refs.moodCopy.textContent = '분석할 음악을 선택하면 에너지, 밝기, 공간감, 리듬 밀도를 바탕으로 사운드 인상을 정리합니다.';
  refs.traitList.innerHTML = ['Energy', 'Pace', 'Brightness', 'Warmth', 'Space', 'Texture'].map((label) => `
    <div class="trait-row">
      <strong>${label}</strong>
      <span class="trait-track"><span style="--trait-width:0%"></span></span>
    </div>
  `).join('');
  refs.signatureGrid.innerHTML = ['analysis', 'sound', 'mood', 'tone'].map((tag) => `<span>${tag}</span>`).join('');
  resetVisualLabels('대기');
  renderEmptyCanvases();
}

function renderEmptyCanvases() {
  [refs.waveform, refs.spectrum, refs.spectrogram, refs.loudness].forEach((canvas) => {
    const { ctx, width, height, dpr } = prepareCanvas(canvas);
    drawCanvasBackground(ctx, width, height, 172);
    ctx.fillStyle = 'rgba(244,240,232,0.62)';
    ctx.font = `${Math.max(13, 13 * dpr)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('음악 파일을 선택하면 시각화가 표시됩니다', width / 2, height / 2);
    ctx.textAlign = 'left';
  });
}

function resetApp() {
  stopPlaybackLoop();
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = '';
  currentAnalysis = null;
  refs.fileInput.value = '';
  renderEmptyState();
}

function resetVisualLabels(text) {
  Object.values(refs.tags).forEach((tag) => {
    tag.textContent = text;
  });
}

function setBusy(isBusy, message) {
  document.body.classList.toggle('is-busy', isBusy);
  refs.statusText.textContent = message;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    refs.toast.hidden = true;
  }, 2600);
}

function startPlaybackLoop() {
  if (!currentAnalysis) return;
  if (animationFrame) cancelAnimationFrame(animationFrame);

  const tick = () => {
    const level = getLiveLevel(currentAnalysis, refs.audioPlayer.currentTime || 0);
    document.documentElement.style.setProperty('--live-level', level.toFixed(3));
    drawWaveform(currentAnalysis, refs.audioPlayer.currentTime || 0);
    drawLoudness(currentAnalysis, refs.audioPlayer.currentTime || 0);
    animationFrame = requestAnimationFrame(tick);
  };

  tick();
}

function stopPlaybackLoop() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  if (currentAnalysis) {
    document.documentElement.style.setProperty('--live-level', '0.16');
    drawWaveform(currentAnalysis, refs.audioPlayer.currentTime || 0);
    drawLoudness(currentAnalysis, refs.audioPlayer.currentTime || 0);
  }
}

function getLiveLevel(analysis, time) {
  const windows = analysis.loudness.windows;
  if (!windows.length || !analysis.duration) return 0.16;
  const index = clamp(Math.floor((time / analysis.duration) * windows.length), 0, windows.length - 1);
  return clamp((windows[index].db + 54) / 42, 0.08, 1);
}

function parseAudioTags(arrayBuffer, file) {
  const tags = {
    title: '',
    artist: '',
    album: '',
    genre: '',
    year: '',
    track: '',
    bpm: '',
    key: '',
    source: 'native'
  };

  if (/\.mp3$/i.test(file.name) || file.type.includes('mpeg')) {
    Object.assign(tags, parseId3(arrayBuffer));
  }

  return tags;
}

function parseId3(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 10 || readAscii(view, 0, 3) !== 'ID3') return {};

  const version = view.getUint8(3);
  const size = readSyncSafeInt(view, 6);
  let offset = 10;
  const end = Math.min(view.byteLength, 10 + size);
  const tags = {};
  const map = {
    TIT2: 'title',
    TPE1: 'artist',
    TALB: 'album',
    TCON: 'genre',
    TDRC: 'year',
    TYER: 'year',
    TRCK: 'track',
    TBPM: 'bpm',
    TKEY: 'key'
  };

  while (offset + 10 <= end) {
    const id = readAscii(view, offset, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const frameSize = version === 4 ? readSyncSafeInt(view, offset + 4) : view.getUint32(offset + 4);
    if (!frameSize || offset + 10 + frameSize > view.byteLength) break;
    const frameStart = offset + 10;
    const frameEnd = frameStart + frameSize;

    if (map[id]) {
      tags[map[id]] = decodeId3Text(new Uint8Array(arrayBuffer, frameStart, frameSize));
    } else if (id === 'COMM') {
      const comment = decodeId3Text(new Uint8Array(arrayBuffer, frameStart, frameSize));
      if (comment && !tags.comment) tags.comment = comment;
    }
    offset = frameEnd;
  }

  return tags;
}

function decodeId3Text(bytes) {
  if (!bytes.length) return '';
  const encoding = bytes[0];
  const body = bytes.slice(1);
  try {
    if (encoding === 0) {
      return cleanText(new TextDecoder('latin1').decode(body));
    }
    if (encoding === 3) {
      return cleanText(new TextDecoder('utf-8').decode(body));
    }
    if (encoding === 1 || encoding === 2) {
      if (body[0] === 0xff && body[1] === 0xfe) {
        return cleanText(new TextDecoder('utf-16le').decode(body.slice(2)));
      }
      if (body[0] === 0xfe && body[1] === 0xff) {
        return cleanText(decodeUtf16Be(body.slice(2)));
      }
      return cleanText(new TextDecoder('utf-16le').decode(body));
    }
  } catch (error) {
    return '';
  }
  return '';
}

function decodeUtf16Be(bytes) {
  const swapped = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1] || 0;
    swapped[i + 1] = bytes[i] || 0;
  }
  return new TextDecoder('utf-16le').decode(swapped);
}

function cleanText(text) {
  return text.replace(/\0/g, ' ').replace(/\s+/g, ' ').trim();
}

function readAscii(view, offset, length) {
  let text = '';
  for (let i = 0; i < length; i += 1) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}

function readSyncSafeInt(view, offset) {
  return (
    (view.getUint8(offset) << 21) |
    (view.getUint8(offset + 1) << 14) |
    (view.getUint8(offset + 2) << 7) |
    view.getUint8(offset + 3)
  );
}

function fft(real, imag) {
  const n = real.length;
  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tempReal = real[i];
      const tempImag = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = tempReal;
      imag[j] = tempImag;
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let i = 0; i < n; i += length) {
      let wReal = 1;
      let wImag = 0;
      for (let k = 0; k < length / 2; k += 1) {
        const evenReal = real[i + k];
        const evenImag = imag[i + k];
        const oddReal = real[i + k + length / 2] * wReal - imag[i + k + length / 2] * wImag;
        const oddImag = real[i + k + length / 2] * wImag + imag[i + k + length / 2] * wReal;
        real[i + k] = evenReal + oddReal;
        imag[i + k] = evenImag + oddImag;
        real[i + k + length / 2] = evenReal - oddReal;
        imag[i + k + length / 2] = evenImag - oddImag;

        const nextReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextReal;
      }
    }
  }
}

function hannWindow(size) {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

function profileScore(chroma, profile, root) {
  let score = 0;
  for (let pc = 0; pc < 12; pc += 1) {
    score += chroma[pc] * profile[(pc - root + 12) % 12];
  }
  return score;
}

function normalizeArray(array) {
  let sum = 0;
  for (let i = 0; i < array.length; i += 1) sum += array[i];
  if (!sum) return;
  for (let i = 0; i < array.length; i += 1) array[i] /= sum;
}

function smoothArray(values, radius) {
  const smoothed = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = i + offset;
      if (index >= 0 && index < values.length) {
        sum += values[index];
        count += 1;
      }
    }
    smoothed[i] = sum / Math.max(1, count);
  }
  return smoothed;
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = clamp((sortedValues.length - 1) * ratio, 0, sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const t = index - lower;
  return sortedValues[lower] * (1 - t) + sortedValues[upper] * t;
}

function ampToDb(value) {
  return 20 * Math.log10(Math.max(value, 1e-9));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function setMeter(element, ratio) {
  element.style.width = `${Math.round(clamp(ratio, 0, 1) * 100)}%`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes.toString().padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatHz(value) {
  if (!Number.isFinite(value) || value <= 0) return '-- Hz';
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz` : `${Math.round(value)} Hz`;
}

function stripExtension(name) {
  return name.replace(/\.[^/.]+$/, '');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
