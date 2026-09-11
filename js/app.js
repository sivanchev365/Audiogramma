(() => {
  "use strict";

  const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
  const frequencySlider = document.querySelector("#frequency");
  const durationSlider = document.querySelector("#duration");
  const volumeSlider = document.querySelector("#volume");
  const frequencyValue = document.querySelector("#frequencyValue");
  const durationValue = document.querySelector("#durationValue");
  const volumeValue = document.querySelector("#volumeValue");
  const timer = document.querySelector("#timer");
  const status = document.querySelector("#status");
  const statusRing = document.querySelector("#statusRing");
  const statusIcon = document.querySelector("#statusIcon");
  const toggleButton = document.querySelector("#toggleButton");
  const buttonIcon = document.querySelector("#buttonIcon");
  const buttonText = document.querySelector("#buttonText");

  let audioContext;
  let oscillator;
  let gainNode;
  let stopTimer;
  let countdownTimer;
  let startedAt;

  const formatFrequency = (frequency) => frequency >= 1000 ? `${frequency / 1000}k` : frequency;

  function updateDisplays() {
    const frequency = frequencies[Number(frequencySlider.value)];
    frequencyValue.textContent = frequency;
    durationValue.textContent = `${durationSlider.value} сек`;
    volumeValue.textContent = `${volumeSlider.value}%`;
    if (!oscillator) timer.textContent = `${Number(durationSlider.value).toFixed(1)} сек`;
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
    gainNode = null;
    startedAt = null;
    updateDisplays();
  }

  function stopTone(message = "Тонът е спрян") {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
    }
    if (audioContext && audioContext.state === "running") audioContext.suspend();
    setIdle(message);
  }

  async function startTone() {
    if (oscillator) {
      stopTone();
      return;
    }

    if (!audioContext) audioContext = new AudioContext();
    await audioContext.resume();

    const frequency = frequencies[Number(frequencySlider.value)];
    const duration = Number(durationSlider.value);
    const volume = Number(volumeSlider.value) / 100;
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    // Keep the browser output conservative; the system volume still applies.
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.35, audioContext.currentTime + 0.04);
    gainNode.gain.setValueAtTime(volume * 0.35, audioContext.currentTime + Math.max(0.05, duration - 0.08));
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    oscillator.connect(gainNode).connect(audioContext.destination);
    oscillator.start();
    oscillator.onended = () => setIdle("Тестът приключи");

    startedAt = performance.now();
    status.textContent = `Звучи ${formatFrequency(frequency)} Hz`;
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
    stopTimer = setTimeout(() => stopTone("Тестът приключи"), duration * 1000 + 120);
  }

  [frequencySlider, durationSlider, volumeSlider].forEach((control) => control.addEventListener("input", updateDisplays));
  toggleButton.addEventListener("click", () => startTone().catch(() => setIdle("Аудиото не може да бъде стартирано")));
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && event.target === document.body) {
      event.preventDefault();
      startTone().catch(() => setIdle("Аудиото не може да бъде стартирано"));
    }
  });
  updateDisplays();
})();
