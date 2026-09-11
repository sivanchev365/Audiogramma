(() => {
  "use strict";

  const frequencies = [63, 80, 125, 180, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 5600, 8000, 16000];
  const storageKey = "audiogram-tone-generator-v2";
  const $ = (selector) => document.querySelector(selector);
  const frequencySlider = $("#frequency");
  const durationSlider = $("#duration");
  const volumeSlider = $("#volume");
  const referenceSlider = $("#referenceLevel");
  const fadeSlider = $("#fade");
  const frequencyValue = $("#frequencyValue");
  const durationValue = $("#durationValue");
  const volumeValue = $("#volumeValue");
  const referenceValue = $("#referenceLevelValue");
  const fadeValue = $("#fadeValue");
  const earSelect = $("#ear");
  const randomMode = $("#randomMode");
  const maskingEnabled = $("#maskingEnabled");
  const maskingVolume = $("#maskingVolume");
  const timer = $("#timer");
  const status = $("#status");
  const statusRing = $("#statusRing");
  const statusIcon = $("#statusIcon");
  const toggleButton = $("#toggleButton");
  const buttonIcon = $("#buttonIcon");
  const buttonText = $("#buttonText");
  const resultStatus = $("#resultStatus");
  const chart = $("#audiogramChart");

  let audioContext;
  let oscillator;
  let noiseSource;
  let toneGain;
  let noiseGain;
  let tonePan;
  let noisePan;
  let stopTimer;
  let countdownTimer;
  let startedAt;
  let runNumber = 0;
  let randomOrder = [];
  let randomPosition = 0;
  let tonePeak = 0;
  let noisePeak = 0;
  let audioStartedAt = 0;
  let audioDuration = 0;
  let state = {
    frequency: 8,
    duration: 5,
    volume: 10,
    referenceLevel: 35,
    fade: 0.04,
    ear: "both",
    randomMode: false,
    maskingEnabled: false,
    maskingVolume: 10,
    theme: "dark",
    results: { left: {}, right: {} }
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state = { ...state, ...saved, results: { left: {}, right: {}, ...(saved.results || {}) } };
    } catch (error) {
      // A corrupt local preference should never prevent the offline app from starting.
    }
    frequencySlider.value = Math.max(0, Math.min(frequencies.length - 1, Number(state.frequency) || 8));
    durationSlider.value = Math.max(1, Math.min(30, Number(state.duration) || 5));
    volumeSlider.value = Math.max(0, Math.min(100, Number(state.volume) || 10));
    referenceSlider.value = Math.max(10, Math.min(100, Number(state.referenceLevel) || 35));
    fadeSlider.value = Math.max(.01, Math.min(1, Number(state.fade) || .04));
    earSelect.value = ["both", "left", "right"].includes(state.ear) ? state.ear : "both";
    randomMode.checked = Boolean(state.randomMode);
    maskingEnabled.checked = Boolean(state.maskingEnabled);
    maskingVolume.value = ["5", "10", "20"].includes(String(state.maskingVolume)) ? state.maskingVolume : 10;
    document.documentElement.dataset.theme = state.theme === "light" ? "light" : "dark";
  }

  function saveState() {
    state.frequency = Number(frequencySlider.value);
    state.duration = Number(durationSlider.value);
    state.volume = Number(volumeSlider.value);
    state.referenceLevel = Number(referenceSlider.value);
    state.fade = Number(fadeSlider.value);
    state.ear = earSelect.value;
    state.randomMode = randomMode.checked;
    state.maskingEnabled = maskingEnabled.checked;
    state.maskingVolume = Number(maskingVolume.value);
    state.theme = document.documentElement.dataset.theme;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (error) { /* Storage is optional. */ }
  }

  const formatFrequency = (frequency) => frequency >= 1000 ? `${frequency / 1000}k` : frequency;
  const currentFrequency = () => frequencies[Number(frequencySlider.value)];

  function updateDisplays() {
    frequencyValue.textContent = currentFrequency();
    durationValue.textContent = `${durationSlider.value} сек`;
    volumeValue.textContent = `${volumeSlider.value}%`;
    referenceValue.textContent = `${referenceSlider.value}%`;
    fadeValue.textContent = `${Number(fadeSlider.value).toFixed(2)} сек`;
    if (!oscillator) timer.textContent = `${Number(durationSlider.value).toFixed(1)} сек`;
    saveState();
  }

  function setIdle(message = "Готово за тест") {
    status.textContent = message;
    statusRing.classList.remove("playing");
    statusIcon.textContent = "♪";
    toggleButton.classList.remove("stop");
    buttonIcon.textContent = "▶";
    buttonText.textContent = "Пусни тона";
    clearTimeout(stopTimer);
    clearInterval(countdownTimer);
    oscillator = null;
    noiseSource = null;
    toneGain = null;
    noiseGain = null;
    tonePan = null;
    noisePan = null;
    tonePeak = 0;
    noisePeak = 0;
    audioStartedAt = 0;
    audioDuration = 0;
    startedAt = null;
    updateDisplays();
  }

  function routeForEar(node) {
    const pan = audioContext.createStereoPanner();
    pan.pan.value = earSelect.value === "left" ? -1 : earSelect.value === "right" ? 1 : 0;
    node.connect(pan).connect(audioContext.destination);
    return pan;
  }

  function createNoise() {
    const bufferSize = audioContext.sampleRate * 2;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) data[index] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  function stopTone(message = "Тонът е спрян") {
    if (!oscillator && !noiseSource) return;
    const fade = Number(fadeSlider.value);
    const now = audioContext ? audioContext.currentTime : 0;
    const elapsed = Math.max(0, now - audioStartedAt);
    const levelAt = (peak) => {
      if (elapsed < fade) return peak * elapsed / fade;
      if (elapsed > audioDuration - fade) return peak * Math.max(0, (audioDuration - elapsed) / fade);
      return peak;
    };
    if (toneGain) {
      toneGain.gain.cancelScheduledValues(now);
      toneGain.gain.setValueAtTime(levelAt(tonePeak), now);
      toneGain.gain.linearRampToValueAtTime(0, now + fade);
    }
    if (noiseGain) {
      noiseGain.gain.cancelScheduledValues(now);
      noiseGain.gain.setValueAtTime(levelAt(noisePeak), now);
      noiseGain.gain.linearRampToValueAtTime(0, now + fade);
    }
    try { if (oscillator) oscillator.stop(now + fade + .02); } catch (error) { /* Already stopped. */ }
    try { if (noiseSource) noiseSource.stop(now + fade + .02); } catch (error) { /* Already stopped. */ }
    clearTimeout(stopTimer);
    clearInterval(countdownTimer);
    const oldRun = runNumber;
    setTimeout(() => {
      if (oldRun === runNumber) setIdle(message);
    }, (fade + .05) * 1000);
  }

  function nextRandomFrequency() {
    if (!randomOrder.length || randomPosition >= randomOrder.length) {
      randomOrder = frequencies.map((value, index) => index);
      for (let index = randomOrder.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [randomOrder[index], randomOrder[swap]] = [randomOrder[swap], randomOrder[index]];
      }
      randomPosition = 0;
    }
    frequencySlider.value = randomOrder[randomPosition];
    randomPosition += 1;
  }

  async function startTone() {
    if (oscillator || noiseSource) {
      stopTone();
      return;
    }
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    if (randomMode.checked) nextRandomFrequency();
    updateDisplays();

    const frequency = currentFrequency();
    const duration = Number(durationSlider.value);
    const fade = Number(fadeSlider.value);
    const toneLevel = Number(volumeSlider.value) / 100 * Number(referenceSlider.value) / 100 * .65;
    const maskLevel = Number(maskingVolume.value) / 100 * Number(referenceSlider.value) / 100 * .22;
    const now = audioContext.currentTime;
    oscillator = audioContext.createOscillator();
    toneGain = audioContext.createGain();
    tonePan = routeForEar(toneGain);
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    toneGain.gain.setValueAtTime(0, now);
    toneGain.gain.linearRampToValueAtTime(toneLevel, now + Math.min(fade, duration / 2));
    toneGain.gain.setValueAtTime(toneLevel, now + Math.max(fade, duration - fade));
    toneGain.gain.linearRampToValueAtTime(0, now + duration);
    oscillator.connect(toneGain);
    oscillator.start(now);
    tonePeak = toneLevel;
    noisePeak = maskLevel;
    audioStartedAt = now;
    audioDuration = duration;

    if (maskingEnabled.checked) {
      noiseSource = createNoise();
      noiseGain = audioContext.createGain();
      noisePan = routeForEar(noiseGain);
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(maskLevel, now + Math.min(fade, duration / 2));
      noiseGain.gain.setValueAtTime(maskLevel, now + Math.max(fade, duration - fade));
      noiseGain.gain.linearRampToValueAtTime(0, now + duration);
      noiseSource.connect(noiseGain);
      noiseSource.start(now);
    }

    runNumber += 1;
    startedAt = performance.now();
    status.textContent = `${formatFrequency(frequency)} Hz · ${earSelect.options[earSelect.selectedIndex].text}`;
    statusRing.classList.add("playing");
    statusIcon.textContent = "◉";
    toggleButton.classList.add("stop");
    buttonIcon.textContent = "■";
    buttonText.textContent = "Спри тона";
    timer.textContent = `${duration.toFixed(1)} сек`;
    countdownTimer = setInterval(() => {
      const remaining = Math.max(0, duration - (performance.now() - startedAt) / 1000);
      timer.textContent = `${remaining.toFixed(1)} сек`;
    }, 50);
    stopTimer = setTimeout(() => stopTone("Тестът приключи"), duration * 1000);
  }

  function markResult(result) {
    const frequency = currentFrequency();
    const level = Number(volumeSlider.value) * Number(referenceSlider.value) / 100;
    const entry = { result, level, time: new Date().toISOString() };
    if (earSelect.value === "both" || earSelect.value === "left") state.results.left[frequency] = entry;
    if (earSelect.value === "both" || earSelect.value === "right") state.results.right[frequency] = entry;
    resultStatus.textContent = `${result === "heard" ? "Чух" : "Не чух"} · ${formatFrequency(frequency)} Hz · ${earSelect.options[earSelect.selectedIndex].text}`;
    saveState();
    renderChart();
  }

  function xForFrequency(frequency) {
    return 56 + (Math.log(frequency / frequencies[0]) / Math.log(frequencies[frequencies.length - 1] / frequencies[0])) * 548;
  }

  function renderChart() {
    const NS = "http://www.w3.org/2000/svg";
    while (chart.firstChild) chart.removeChild(chart.firstChild);
    const add = (name, attrs, text) => {
      const node = document.createElementNS(NS, name);
      Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
      if (text) node.textContent = text;
      chart.appendChild(node);
      return node;
    };
    [0, 25, 50, 75, 100].forEach((level) => {
      const y = 238 - level * 1.8;
      add("line", { x1: 56, y1: y, x2: 604, y2: y, class: "grid" });
      add("text", { x: 48, y: y + 4, "text-anchor": "end" }, `${level}%`);
    });
    frequencies.forEach((frequency) => {
      const x = xForFrequency(frequency);
      add("line", { x1: x, y1: 58, x2: x, y2: 238, class: "grid" });
      add("text", { x, y: 254, "text-anchor": "middle" }, formatFrequency(frequency));
    });
    add("line", { x1: 56, y1: 58, x2: 56, y2: 238, class: "axis" });
    add("line", { x1: 56, y1: 238, x2: 604, y2: 238, class: "axis" });
    add("text", { x: 58, y: 18, class: "legend left" }, "● ляво ухо · × не чух");
    add("text", { x: 350, y: 18, class: "legend right" }, "● дясно ухо · × не чух");
    ["left", "right"].forEach((ear) => {
      Object.entries(state.results[ear] || {}).forEach(([frequency, entry]) => {
        const x = xForFrequency(Number(frequency));
        const y = 238 - Math.max(0, Math.min(100, Number(entry.level) || 0)) * 1.8;
        const isLeft = ear === "left";
        const colorClass = isLeft ? "left" : "right";
        if (entry.result === "heard") {
          add("circle", { cx: x, cy: y, r: 5, class: colorClass });
        } else {
          add("path", { d: `M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}`, class: `${colorClass} not-heard` });
        }
      });
    });
  }

  function exportCsv() {
    const rows = [["frequency_hz", "ear", "result", "relative_level_percent", "timestamp"]];
    ["left", "right"].forEach((ear) => Object.entries(state.results[ear] || {}).forEach(([frequency, entry]) => {
      rows.push([frequency, ear, entry.result, entry.level, entry.time]);
    }));
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `audiogram-results-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  [frequencySlider, durationSlider, volumeSlider, referenceSlider, fadeSlider].forEach((control) => control.addEventListener("input", updateDisplays));
  [earSelect, randomMode, maskingEnabled, maskingVolume].forEach((control) => control.addEventListener("change", () => { saveState(); updateDisplays(); }));
  toggleButton.addEventListener("click", () => startTone().catch(() => setIdle("Аудиото не може да бъде стартирано")));
  $("#heardButton").addEventListener("click", () => markResult("heard"));
  $("#notHeardButton").addEventListener("click", () => markResult("not-heard"));
  $("#csvButton").addEventListener("click", exportCsv);
  $("#printButton").addEventListener("click", () => window.print());
  $("#clearResultsButton").addEventListener("click", () => {
    state.results = { left: {}, right: {} };
    resultStatus.textContent = "Резултатите са изчистени.";
    saveState();
    renderChart();
  });
  $("#themeToggle").addEventListener("click", () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    saveState();
  });
  document.addEventListener("keydown", (event) => {
    const isControl = event.target.matches("input, button, select, textarea");
    if (event.code === "Space" && !isControl) {
      event.preventDefault();
      startTone().catch(() => setIdle("Аудиото не може да бъде стартирано"));
    }
    if (isControl) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      frequencySlider.value = Math.min(frequencies.length - 1, Math.max(0, Number(frequencySlider.value) + direction));
      updateDisplays();
    }
    if (event.key.toLowerCase() === "a" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      const direction = event.key.toLowerCase() === "d" ? 1 : -1;
      durationSlider.value = Math.min(30, Math.max(1, Number(durationSlider.value) + direction));
      updateDisplays();
    }
    if (event.key.toLowerCase() === "h") markResult("heard");
    if (event.key.toLowerCase() === "n") markResult("not-heard");
  });

  loadState();
  updateDisplays();
  renderChart();
})();
