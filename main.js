// Zen Relax Game - Main Application
// Architecture modulaire ES6, Web Audio, Canvas, Vibration, LocalStorage

(function(){
  "use strict";

  // -------------------- Configuration & State --------------------
  const CONFIG = {
    MAX_BUBBLES: 20,
    MAX_GLOWS: 15,
    BUBBLE_BASE_RADIUS: 30,
    GLOW_BASE_RADIUS: 35,
    PARTICLE_COUNT: 18,
    RELAX_POINTS_PER_POP: 10,
    POSITIVE_MESSAGES: [
      "🌱 Tout va bien...",
      "💆 Respire profondément",
      "✨ Tu es en sécurité",
      "🌊 Laisse aller...",
      "🌸 Doucement...",
      "🕊️ Libère les tensions",
      "☁️ Comme un nuage",
    ],
    BREATH_CYCLE: { inhale: 4, hold: 4, exhale: 6 }, // secondes
  };

  // État global
  const state = {
    currentMode: 'menu', // menu, bubble, glow, draw, breathe
    theme: 'ocean',      // ocean, night, forest
    soundEnabled: true,
    musicEnabled: true,
    relaxPoints: 0,
    popsCount: 0,
    sessionSeconds: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    bubbles: [],
    glows: [],
    particles: [],
    drawingStrokes: [],  // pour drawing mode
    breathing: {
      phase: 'inhale', // inhale, hold, exhale
      timeLeft: 4,
      progress: 0,
    },
    animationFrame: null,
    lastTimestamp: 0,
    positiveMsgTimeout: null,
    timerInterval: null,
  };

  // DOM Elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  
  // UI Elements
  const relaxPointsDisplay = document.getElementById('relaxPointsDisplay');
  const relaxLevelDisplay = document.getElementById('relaxLevelDisplay');
  const timerDisplay = document.getElementById('timerDisplay');
  const popsCountDisplay = document.getElementById('popsCountDisplay');
  const positiveMsgDiv = document.getElementById('positiveMessage');
  const mainMenu = document.getElementById('mainMenu');
  const instructionsPanel = document.getElementById('instructionsPanel');
  const breathingGuide = document.getElementById('breathingGuide');
  const breathCircle = document.getElementById('breathCircle');
  const breathText = document.getElementById('breathText');
  const breathTimer = document.getElementById('breathTimer');
  const backToMenuFAB = document.getElementById('backToMenuFAB');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const themeBtn = document.getElementById('themeBtn');
  const menuBtn = document.getElementById('menuBtn');

  // Audio context and sounds (Web Audio API)
  let audioCtx = null;
  let musicGainNode = null;
  let musicSource = null;
  let isMusicPlaying = false;
  
  // -------------------- Initialisation Audio --------------------
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // On suspend pour éviter autoplay policy, on démarrera sur interaction
    } catch(e) {
      console.warn("Web Audio non supporté");
    }
  }

  function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (state.musicEnabled && !isMusicPlaying) {
      startAmbientMusic();
    }
  }

  // Son pop doux
  function playPopSound() {
    if (!state.soundEnabled || !audioCtx) return;
    resumeAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 480 + Math.random() * 200;
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(now + 0.12);
  }

  // Musique d'ambiance (générée)
  function startAmbientMusic() {
    if (!audioCtx || !state.musicEnabled) return;
    if (musicSource) {
      try { musicSource.stop(); } catch(e){}
    }
    const now = audioCtx.currentTime;
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Bruit rose très doux + tonalité apaisante
      data[i] = (Math.random() * 2 - 1) * 0.02;
      data[i] += Math.sin(i * 0.005) * 0.03;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.value = 0.15;
    source.connect(musicGainNode).connect(audioCtx.destination);
    source.start();
    musicSource = source;
    isMusicPlaying = true;
  }

  function stopMusic() {
    if (musicSource) {
      try { musicSource.stop(); } catch(e){}
      musicSource = null;
      isMusicPlaying = false;
    }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    soundToggleBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
    if (!state.soundEnabled) {
      stopMusic();
    } else {
      if (state.musicEnabled) startAmbientMusic();
    }
    saveSettings();
  }

  function toggleMusic(enabled) {
    state.musicEnabled = enabled;
    if (enabled && state.soundEnabled) startAmbientMusic();
    else stopMusic();
  }

  // Vibration
  function vibrate(duration = 15) {
    if (navigator.vibrate) navigator.vibrate(duration);
  }

  // -------------------- Helpers UI --------------------
  function updateUIStats() {
    relaxPointsDisplay.textContent = state.relaxPoints;
    const level = Math.min(100, Math.floor(state.relaxPoints / 5) + 1);
    relaxLevelDisplay.textContent = level;
    popsCountDisplay.textContent = state.popsCount;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.sessionSeconds++;
      timerDisplay.textContent = formatTime(state.sessionSeconds);
    }, 1000);
  }

  function showPositiveMessage() {
    const msg = CONFIG.POSITIVE_MESSAGES[Math.floor(Math.random() * CONFIG.POSITIVE_MESSAGES.length)];
    positiveMsgDiv.textContent = msg;
    positiveMsgDiv.classList.add('show');
    if (state.positiveMsgTimeout) clearTimeout(state.positiveMsgTimeout);
    state.positiveMsgTimeout = setTimeout(() => {
      positiveMsgDiv.classList.remove('show');
    }, 2200);
  }

  // -------------------- Modes Management --------------------
  function setMode(mode) {
    state.currentMode = mode;
    // Reset spécifique au mode
    if (mode === 'bubble') {
      state.bubbles = [];
      for (let i=0; i<CONFIG.MAX_BUBBLES; i++) spawnBubble();
    } else if (mode === 'glow') {
      state.glows = [];
      for (let i=0; i<CONFIG.MAX_GLOWS; i++) spawnGlow();
    } else if (mode === 'draw') {
      state.drawingStrokes = [];
    } else if (mode === 'breathe') {
      resetBreathing();
      breathingGuide.classList.remove('hidden');
    } else {
      breathingGuide.classList.add('hidden');
    }
    
    // UI
    if (mode === 'menu') {
      mainMenu.classList.remove('hidden');
      backToMenuFAB.classList.add('hidden');
    } else {
      mainMenu.classList.add('hidden');
      backToMenuFAB.classList.remove('hidden');
      if (mode !== 'breathe') breathingGuide.classList.add('hidden');
    }
    instructionsPanel.classList.add('hidden');
  }

  function resetBreathing() {
    state.breathing = { phase: 'inhale', timeLeft: CONFIG.BREATH_CYCLE.inhale, progress: 0 };
    updateBreathingUI();
  }

  function updateBreathingUI() {
    const b = state.breathing;
    breathText.textContent = b.phase === 'inhale' ? 'Inspire' : (b.phase === 'hold' ? 'Retiens' : 'Expire');
    breathTimer.textContent = `${Math.ceil(b.timeLeft)}s`;
    // animation circle scale
    let scale = 1;
    if (b.phase === 'inhale') scale = 1 + (1 - b.timeLeft/CONFIG.BREATH_CYCLE.inhale) * 0.6;
    else if (b.phase === 'exhale') scale = 1.6 - (1 - b.timeLeft/CONFIG.BREATH_CYCLE.exhale) * 0.6;
    else scale = 1.6;
    breathCircle.style.transform = `scale(${scale})`;
  }

  // -------------------- Spawning --------------------
  function spawnBubble() {
    const radius = 20 + Math.random() * 30;
    state.bubbles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      radius,
      color: `hsla(${180 + Math.random()*60}, 70%, 75%, 0.7)`,
    });
  }

  function spawnGlow() {
    state.glows.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: 25 + Math.random() * 25,
      hue: 200 + Math.random() * 100,
    });
  }

  // -------------------- Physics & Update --------------------
  function updateBubbles() {
    for (let b of state.bubbles) {
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < b.radius || b.x > canvas.width - b.radius) { b.vx *= -0.9; b.x = Math.min(Math.max(b.x, b.radius), canvas.width - b.radius); }
      if (b.y < b.radius || b.y > canvas.height - b.radius) { b.vy *= -0.9; b.y = Math.min(Math.max(b.y, b.radius), canvas.height - b.radius); }
      b.vx *= 0.998;
      b.vy *= 0.998;
    }
  }

  function updateGlows() {
    for (let g of state.glows) {
      g.x += g.vx;
      g.y += g.vy;
      if (g.x < g.radius || g.x > canvas.width - g.radius) g.vx *= -0.9;
      if (g.y < g.radius || g.y > canvas.height - g.radius) g.vy *= -0.9;
    }
  }

  function updateParticles() {
    state.particles = state.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 0.015;
      return p.life > 0;
    });
  }

  function addExplosion(px, py, baseHue = 200) {
    for (let i=0; i<CONFIG.PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      state.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 8,
        life: 1.0,
        hue: baseHue + Math.random() * 60 - 30,
      });
    }
  }

  // -------------------- Drawing --------------------
  function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyThemeBackground();

    if (state.currentMode === 'bubble') {
      updateBubbles();
      state.bubbles.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, 2*Math.PI);
        ctx.fillStyle = b.color;
        ctx.shadowColor = 'rgba(180,220,255,0.6)';
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    } else if (state.currentMode === 'glow') {
      updateGlows();
      state.glows.forEach(g => {
        const gradient = ctx.createRadialGradient(g.x-5, g.y-5, 5, g.x, g.y, g.radius+5);
        gradient.addColorStop(0, `hsla(${g.hue}, 80%, 80%, 0.9)`);
        gradient.addColorStop(1, `hsla(${g.hue}, 70%, 60%, 0.2)`);
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.radius, 0, 2*Math.PI);
        ctx.fillStyle = gradient;
        ctx.shadowColor = `hsl(${g.hue}, 80%, 70%)`;
        ctx.shadowBlur = 30;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    } else if (state.currentMode === 'draw') {
      // dessiner les strokes
      state.drawingStrokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i=1; i<stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = stroke.opacity;
        ctx.stroke();
      });
      ctx.globalAlpha = 1.0;
    } else if (state.currentMode === 'breathe') {
      // fond apaisant
      ctx.fillStyle = '#0b1a2a';
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }

    // Particules (tous modes)
    updateParticles();
    state.particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, 2*Math.PI);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.life*0.7})`;
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsl(${p.hue}, 80%, 70%)`;
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  function applyThemeBackground() {
    let grad;
    if (state.theme === 'ocean') {
      grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
      grad.addColorStop(0, '#0f2b3d');
      grad.addColorStop(1, '#1b4f6e');
    } else if (state.theme === 'night') {
      grad = ctx.createLinearGradient(0,0,0,canvas.height);
      grad.addColorStop(0, '#0f1123');
      grad.addColorStop(1, '#232844');
    } else {
      grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
      grad.addColorStop(0, '#1a3b2e');
      grad.addColorStop(1, '#2b5e42');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  // -------------------- Interactions --------------------
  function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = (e.clientX - rect.left) * scaleX;
    const clientY = (e.clientY - rect.top) * scaleY;

    if (state.currentMode === 'bubble') {
      for (let i=state.bubbles.length-1; i>=0; i--) {
        const b = state.bubbles[i];
        const dx = clientX - b.x, dy = clientY - b.y;
        if (dx*dx + dy*dy < b.radius*b.radius) {
          // pop
          addExplosion(b.x, b.y, 190);
          state.bubbles.splice(i,1);
          state.relaxPoints += CONFIG.RELAX_POINTS_PER_POP;
          state.popsCount++;
          playPopSound();
          vibrate(10);
          showPositiveMessage();
          spawnBubble();
          updateUIStats();
          break;
        }
      }
    } else if (state.currentMode === 'glow') {
      for (let i=state.glows.length-1; i>=0; i--) {
        const g = state.glows[i];
        const dx = clientX - g.x, dy = clientY - g.y;
        if (dx*dx + dy*dy < g.radius*g.radius) {
          addExplosion(g.x, g.y, g.hue);
          state.glows.splice(i,1);
          state.relaxPoints += CONFIG.RELAX_POINTS_PER_POP;
          state.popsCount++;
          playPopSound();
          vibrate(8);
          showPositiveMessage();
          spawnGlow();
          updateUIStats();
          break;
        }
      }
    } else if (state.currentMode === 'draw') {
      // début d'un trait? On utilise mouse move pour dessiner, mais click ajoute point
    }
  }

  // Dessin continu
  let isDrawing = false;
  let currentStroke = null;
  
  function startDrawing(x, y) {
    if (state.currentMode !== 'draw') return;
    isDrawing = true;
    currentStroke = { points: [{x,y}], color: `hsla(${180+Math.random()*120}, 70%, 70%, 0.7)`, width: 8, opacity: 0.8 };
    state.drawingStrokes.push(currentStroke);
  }

  function drawMove(x, y) {
    if (!isDrawing || !currentStroke) return;
    currentStroke.points.push({x,y});
    if (currentStroke.points.length % 5 === 0) {
      state.relaxPoints += 1;
      updateUIStats();
    }
  }

  function stopDrawing() {
    isDrawing = false;
    currentStroke = null;
  }

  // -------------------- Breathing update (time based) --------------------
  function breathingUpdate(deltaSec) {
    const b = state.breathing;
    b.timeLeft -= deltaSec;
    if (b.timeLeft <= 0) {
      // transition
      if (b.phase === 'inhale') {
        b.phase = 'hold';
        b.timeLeft = CONFIG.BREATH_CYCLE.hold;
      } else if (b.phase === 'hold') {
        b.phase = 'exhale';
        b.timeLeft = CONFIG.BREATH_CYCLE.exhale;
      } else {
        b.phase = 'inhale';
        b.timeLeft = CONFIG.BREATH_CYCLE.inhale;
        state.relaxPoints += 5;
        updateUIStats();
        showPositiveMessage();
      }
    }
    updateBreathingUI();
  }

  // -------------------- Game Loop --------------------
  function gameLoop(now) {
    if (!state.lastTimestamp) state.lastTimestamp = now;
    const deltaSec = Math.min(0.05, (now - state.lastTimestamp) / 1000);
    
    if (state.currentMode === 'breathe') {
      breathingUpdate(deltaSec);
    }
    
    drawScene();
    
    state.lastTimestamp = now;
    state.animationFrame = requestAnimationFrame(gameLoop);
  }

  // -------------------- Resize --------------------
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.canvasWidth = canvas.width;
    state.canvasHeight = canvas.height;
  }

  // -------------------- LocalStorage --------------------
  function saveSettings() {
    localStorage.setItem('zenRelax_settings', JSON.stringify({
      soundEnabled: state.soundEnabled,
      theme: state.theme,
      relaxPoints: state.relaxPoints,
      popsCount: state.popsCount,
    }));
  }

  function loadSettings() {
    const saved = localStorage.getItem('zenRelax_settings');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        state.soundEnabled = data.soundEnabled ?? true;
        state.theme = data.theme ?? 'ocean';
        state.relaxPoints = data.relaxPoints || 0;
        state.popsCount = data.popsCount || 0;
      } catch(e){}
    }
    soundToggleBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
    updateUIStats();
  }

  function resetStats() {
    state.relaxPoints = 0;
    state.popsCount = 0;
    state.sessionSeconds = 0;
    updateUIStats();
    timerDisplay.textContent = '00:00';
  }

  // -------------------- Initialisation --------------------
  function init() {
    resizeCanvas();
    loadSettings();
    initAudio();
    startTimer();
    
    // Event listeners
    window.addEventListener('resize', () => { resizeCanvas(); });
    
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width/rect.width);
      const y = (e.clientY - rect.top) * (canvas.height/rect.height);
      startDrawing(x, y);
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width/rect.width);
      const y = (e.clientY - rect.top) * (canvas.height/rect.height);
      drawMove(x, y);
    });
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    // Touch
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; 
      const rect = canvas.getBoundingClientRect(); 
      const x = (t.clientX - rect.left) * (canvas.width/rect.width); 
      const y = (t.clientY - rect.top) * (canvas.height/rect.height);
      startDrawing(x, y); 
      handleCanvasClick({ clientX: t.clientX, clientY: t.clientY }); 
    });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      drawMove((t.clientX - rect.left)*(canvas.width/rect.width), (t.clientY - rect.top)*(canvas.height/rect.height));
    });
    canvas.addEventListener('touchend', stopDrawing);
    
    // UI buttons
    document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.mode;
      setMode(mode);
      resumeAudio();
    }));
    
    menuBtn.addEventListener('click', () => setMode('menu'));
    backToMenuFAB.addEventListener('click', () => setMode('menu'));
    
    soundToggleBtn.addEventListener('click', toggleSound);
    
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });
    
    themeBtn.addEventListener('click', () => {
      const themes = ['ocean', 'night', 'forest'];
      const idx = themes.indexOf(state.theme);
      state.theme = themes[(idx+1)%themes.length];
      saveSettings();
    });
    
    document.getElementById('howToPlayBtn').addEventListener('click', () => {
      instructionsPanel.classList.remove('hidden');
    });
    document.getElementById('closeInstructionsBtn').addEventListener('click', () => {
      instructionsPanel.classList.add('hidden');
    });
    
    document.getElementById('resetStatsBtn').addEventListener('click', resetStats);
    
    // Démarrer loop
    state.animationFrame = requestAnimationFrame(gameLoop);
  }

  init();
})();