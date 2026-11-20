/**
 * Laser Security Alarm System — Digital Electronics Simulator
 * Academic Mini-Project: Shahid Ali & Ravi Shankar | Shri Ramswaroop Memorial University
 * Pure Vanilla JavaScript: HTML5 Canvas API + Web Audio API
 */

(function () {
  'use strict';

  // Helper for cross-browser rounded rectangles on Canvas
  function drawRoundRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
  }

  // =========================================================================
  // 1. Audio Engine (2.4 kHz Piezoelectric Buzzer Synthesizer via Web Audio)
  // =========================================================================
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.pulseTimer = null;
      this.isMuted = false;
      this.isPlaying = false;
      this.freq = 2400; // 2.4 kHz resonant frequency of piezo buzzers
    }

    init() {
      if (this.ctx) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
      } catch (e) {
        console.warn('Web Audio API not supported in this browser.', e);
      }
    }

    resume() {
      if (!this.ctx) {
        this.init();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    startBuzzer() {
      if (this.isPlaying || this.isMuted) return;
      this.init();
      if (!this.ctx) return;
      this.resume();

      this.isPlaying = true;

      // Start rapid 6Hz alarm pulsing (typical security beeper pulse)
      this.pulseTone();
      this.pulseTimer = setInterval(() => {
        this.pulseTone();
      }, 125);
    }

    pulseTone() {
      if (!this.isPlaying || this.isMuted || !this.ctx) return;

      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Piezo ceramic buzzer produces 2400Hz sharp square wave
        osc.type = 'square';
        osc.frequency.setValueAtTime(this.freq, now);

        // Volume envelope: sharp attack, fast decay to emulate piezo diaphragm click
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

        // Lowpass filter to temper extreme square harmonics while maintaining authentic piercing piezo tone
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(5200, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
      } catch (err) {
        console.warn('Audio synthesis error:', err);
      }
    }

    stopBuzzer() {
      this.isPlaying = false;
      if (this.pulseTimer) {
        clearInterval(this.pulseTimer);
        this.pulseTimer = null;
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      if (this.isMuted && this.isPlaying) {
        this.stopBuzzer();
      }
      return this.isMuted;
    }
  }

  // =========================================================================
  // 2. Circuit Physics & Digital Electronics Logic Model
  // =========================================================================
  class CircuitSimulator {
    constructor() {
      this.vcc = 5.0; // 5V TTL logic rail
      this.vbeThreshold = 0.70; // Silicon BJT (BC547) forward conduction threshold

      // Configurable Parameters
      this.isArmed = true;
      this.isDualBeam = false;
      this.isAlarmLatchMode = false;
      this.isLatchedAlarm = false;

      this.rPreset = 10.0; // kΩ (1 to 100 kΩ)
      this.ambientPercent = 15; // 0 to 100%

      // Dynamic Sensor States
      this.beam1Blocked = false;
      this.beam2Blocked = false;

      // Calculated values
      this.lux1 = 1800;
      this.lux2 = 1800;
      this.rLdr1 = 1.2; // kΩ
      this.rLdr2 = 1.2; // kΩ
      this.vNode = 0.45; // Voltage divider node (V)
      this.vBE = 0.45; // Base-Emitter voltage (V)
      this.transistorState = 'CUTOFF'; // 'CUTOFF' | 'SATURATION'
      this.logicOutput = 0; // 0 | 1
      this.isAlarmActive = false;
      this.stateClassification = 'normal'; // 'normal' | 'alarm' | 'fault'
    }

    // Calculate LDR resistance based on incident light
    // Darkroom (0 lux): ~180 kΩ. High laser intensity: ~0.9-1.2 kΩ.
    calculateRLdr(lux) {
      if (lux <= 1) return 180.0;
      const r = 12.0 * Math.pow(10 / lux, 0.72);
      return Math.max(0.65, Math.min(200.0, r));
    }

    update() {
      // 1. Calculate incident light levels (Lux)
      const ambientLux = (this.ambientPercent / 100) * 1200; // ambient light contribution
      const laserLux = 1800; // high-intensity collimated laser diode beam

      this.lux1 = (this.beam1Blocked ? 0 : laserLux) + ambientLux;
      this.lux2 = (this.beam2Blocked ? 0 : laserLux) + ambientLux;

      this.rLdr1 = this.calculateRLdr(this.lux1);
      this.rLdr2 = this.calculateRLdr(this.lux2);

      // In dual-beam mode, sensors are combined via OR logic (either beam broken triggers alarm)
      let activeRLdr = this.rLdr1;
      let anyBeamBroken = this.beam1Blocked;

      if (this.isDualBeam) {
        anyBeamBroken = this.beam1Blocked || this.beam2Blocked;
        activeRLdr = Math.max(this.rLdr1, this.rLdr2);
      }

      // 2. Voltage Divider calculation: V_B = V_CC * [ R_LDR / (R_PRESET + R_LDR) ]
      // The LDR is in the lower leg to ground, R_PRESET in the upper leg to Vcc
      this.vNode = this.vcc * (activeRLdr / (this.rPreset + activeRLdr));

      // 3. Transistor Silicon BJT base-emitter forward voltage drop modeling
      if (this.vNode < this.vbeThreshold) {
        this.vBE = this.vNode;
        this.transistorState = 'CUTOFF';
      } else {
        // In saturation, V_BE is clamped near 0.70 - 0.75V due to forward p-n junction conduction
        this.vBE = 0.70 + 0.04 * Math.tanh((this.vNode - 0.70) / 1.5);
        this.transistorState = 'SATURATION';
      }

      // 4. Digital Output Determination
      const rawAlarm = (this.transistorState === 'SATURATION');

      // Academic Limitation Check: False Negative Missed Intrusion
      // If beam is physically broken, but V_BE < 0.7V because ambient light or preset resistor is miscalibrated
      if (anyBeamBroken && !rawAlarm) {
        this.stateClassification = 'fault'; // Missed intrusion!
      } else if (rawAlarm) {
        this.stateClassification = 'alarm';
      } else {
        this.stateClassification = 'normal';
      }

      // 5. Alarm Latch Behavior
      if (this.isAlarmLatchMode && rawAlarm && this.isArmed) {
        this.isLatchedAlarm = true;
      }

      // 6. Master Arm & Buzzer Status
      if (!this.isArmed) {
        this.logicOutput = 0;
        this.isAlarmActive = false;
      } else if (this.isLatchedAlarm) {
        this.logicOutput = 1;
        this.isAlarmActive = true;
      } else {
        this.logicOutput = rawAlarm ? 1 : 0;
        this.isAlarmActive = rawAlarm;
      }
    }

    resetLatch() {
      this.isLatchedAlarm = false;
      this.update();
    }
  }

  // =========================================================================
  // 3. Optical Bench & Circuit Canvas Renderer
  // =========================================================================
  class OpticalBenchCanvas {
    constructor(canvas, sim, onInteraction) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.sim = sim;
      this.onInteraction = onInteraction;

      // Base Virtual Resolution for crisp uniform rendering & scaling
      this.BASE_WIDTH = 920;
      this.BASE_HEIGHT = 420;
      this.scaleFactor = 1;
      this.dpr = window.devicePixelRatio || 1;

      this.setupDPI();

      // Optical bench layout coordinates in virtual space
      this.laser1Pos = { x: 50, y: 120 };
      this.ldr1Pos = { x: 510, y: 120 };

      this.laser2Pos = { x: 50, y: 220 };
      this.ldr2Pos = { x: 510, y: 220 };

      // Circuit Schematic component positions (Right side of canvas)
      this.presetPotPos = { x: 620, y: 90 };
      this.transistorPos = { x: 720, y: 170 };
      this.buzzerPos = { x: 830, y: 120 };
      this.ledPos = { x: 830, y: 220 };

      // Draggable Intruder Block
      this.intruder = {
        x: 270,
        y: 285, // initially parked below the beam
        width: 44,
        height: 135,
        isDragging: false,
        dragOffsetX: 0,
        dragOffsetY: 0,
        isAutoPatrol: false,
        patrolSpeed: 2.2,
        patrolDirection: 1, // 1 = down/up
      };

      // Dust particles for laser beam scatter realism
      this.particles = [];
      for (let i = 0; i < 40; i++) {
        this.particles.push({
          x: 50 + Math.random() * 460,
          y: 70 + Math.random() * 200,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.3,
          size: 1 + Math.random() * 1.5,
          alpha: 0.2 + Math.random() * 0.5
        });
      }

      this.electronPhase = 0;
      this.buzzerWavePhase = 0;

      this.bindEvents();
    }

    setupDPI() {
      const rect = this.canvas.getBoundingClientRect();
      const displayWidth = rect.width || this.BASE_WIDTH;
      const displayHeight = rect.height || this.BASE_HEIGHT;
      this.dpr = window.devicePixelRatio || 1;

      this.canvas.width = displayWidth * this.dpr;
      this.canvas.height = displayHeight * this.dpr;

      // Calculate uniform scale factor to map virtual 920x420 coordinate system
      this.scaleFactorX = displayWidth / this.BASE_WIDTH;
      this.scaleFactorY = displayHeight / this.BASE_HEIGHT;
      this.scaleFactor = Math.min(this.scaleFactorX, this.scaleFactorY);

      this.ctx.setTransform(this.scaleFactorX * this.dpr, 0, 0, this.scaleFactorY * this.dpr, 0, 0);
    }

    bindEvents() {
      window.addEventListener('resize', () => {
        this.setupDPI();
      });

      const getVirtualCoords = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) / this.scaleFactorX,
          y: (clientY - rect.top) / this.scaleFactorY
        };
      };

      const isInsideIntruder = (x, y) => {
        return (
          x >= this.intruder.x &&
          x <= this.intruder.x + this.intruder.width &&
          y >= this.intruder.y &&
          y <= this.intruder.y + this.intruder.height
        );
      };

      const startDrag = (coords) => {
        if (isInsideIntruder(coords.x, coords.y)) {
          this.intruder.isDragging = true;
          this.intruder.isAutoPatrol = false; // stop auto patrol on manual touch
          this.intruder.dragOffsetX = coords.x - this.intruder.x;
          this.intruder.dragOffsetY = coords.y - this.intruder.y;
          if (this.onInteraction) this.onInteraction('drag_start');
        }
      };

      const moveDrag = (coords) => {
        if (this.intruder.isDragging) {
          let newX = coords.x - this.intruder.dragOffsetX;
          let newY = coords.y - this.intruder.dragOffsetY;

          // Constrain within optical bench area in virtual space
          newX = Math.max(90, Math.min(460, newX));
          newY = Math.max(30, Math.min(this.BASE_HEIGHT - this.intruder.height - 10, newY));

          this.intruder.x = newX;
          this.intruder.y = newY;
        }
      };

      const endDrag = () => {
        if (this.intruder.isDragging) {
          this.intruder.isDragging = false;
          if (this.onInteraction) this.onInteraction('drag_end');
        }
      };

      // Mouse events
      this.canvas.addEventListener('mousedown', (e) => startDrag(getVirtualCoords(e)));
      window.addEventListener('mousemove', (e) => moveDrag(getVirtualCoords(e)));
      window.addEventListener('mouseup', endDrag);

      // Touch events (Mobile / Tablet friendly)
      this.canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrag(getVirtualCoords(e));
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (this.intruder.isDragging) {
          e.preventDefault();
          moveDrag(getVirtualCoords(e));
        }
      }, { passive: false });

      window.addEventListener('touchend', endDrag);
    }

    toggleQuickBlock() {
      this.intruder.isAutoPatrol = false;
      const isCurrentlyBlocking = this.sim.beam1Blocked || (this.sim.isDualBeam && this.sim.beam2Blocked);
      if (isCurrentlyBlocking) {
        // Move intruder down to clear path
        this.intruder.x = 270;
        this.intruder.y = 285;
      } else {
        // Move intruder directly into path
        this.intruder.x = 270;
        this.intruder.y = this.sim.isDualBeam ? 85 : 65;
      }
    }

    resetPosition() {
      this.intruder.isAutoPatrol = false;
      this.intruder.x = 270;
      this.intruder.y = 285;
    }

    toggleAutoPatrol() {
      this.intruder.isAutoPatrol = !this.intruder.isAutoPatrol;
      return this.intruder.isAutoPatrol;
    }

    updatePhysics() {
      // Auto-Patrol animation
      if (this.intruder.isAutoPatrol) {
        this.intruder.y += this.intruder.patrolSpeed * this.intruder.patrolDirection;
        if (this.intruder.y > 275) {
          this.intruder.y = 275;
          this.intruder.patrolDirection = -1;
        } else if (this.intruder.y < 50) {
          this.intruder.y = 50;
          this.intruder.patrolDirection = 1;
        }
      }

      // Check laser beam collisions with intruder bounding box
      const b1 = this.laser1Pos.y >= this.intruder.y && this.laser1Pos.y <= this.intruder.y + this.intruder.height &&
                 this.intruder.x <= this.ldr1Pos.x && this.intruder.x + this.intruder.width >= this.laser1Pos.x;

      this.sim.beam1Blocked = b1;

      if (this.sim.isDualBeam) {
        const b2 = this.laser2Pos.y >= this.intruder.y && this.laser2Pos.y <= this.intruder.y + this.intruder.height &&
                   this.intruder.x <= this.ldr2Pos.x && this.intruder.x + this.intruder.width >= this.laser2Pos.x;
        this.sim.beam2Blocked = b2;
      } else {
        this.sim.beam2Blocked = false;
      }

      // Update simulation logic state
      this.sim.update();

      // Tick electron animation
      if (this.sim.transistorState === 'SATURATION') {
        this.electronPhase += 0.2;
      }
      if (this.sim.isAlarmActive) {
        this.buzzerWavePhase += 0.15;
      }

      // Update atmospheric dust particles
      for (let p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 50) p.x = 510;
        if (p.x > 510) p.x = 50;
        if (p.y < 70) p.y = 270;
        if (p.y > 270) p.y = 70;
      }
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.BASE_WIDTH, this.BASE_HEIGHT);

      // 1. Draw Optical Bench Grid & Ambient Light Wash
      this.drawBenchSurface();

      // 2. Draw Lasers and Beams
      this.drawLaserModule(this.laser1Pos.x, this.laser1Pos.y, 'TX1: PRIMARY');
      this.drawLaserBeam(this.laser1Pos, this.ldr1Pos, this.sim.beam1Blocked);

      if (this.sim.isDualBeam) {
        this.drawLaserModule(this.laser2Pos.x, this.laser2Pos.y, 'TX2: SECONDARY');
        this.drawLaserBeam(this.laser2Pos, this.ldr2Pos, this.sim.beam2Blocked);
      }

      // 3. Draw Atmospheric Floating Dust
      this.drawDustParticles();

      // 4. Draw Draggable Intruder Object
      this.drawIntruder();

      // 5. Draw LDR Sensors
      this.drawLdrSensor(this.ldr1Pos.x, this.ldr1Pos.y, this.sim.rLdr1, this.sim.beam1Blocked, 'LDR1');
      if (this.sim.isDualBeam) {
        this.drawLdrSensor(this.ldr2Pos.x, this.ldr2Pos.y, this.sim.rLdr2, this.sim.beam2Blocked, 'LDR2');
      }

      // 6. Draw Circuit Schematic & Electronics (PCB Tracks, Potentiometer, Transistor, Buzzer, LED)
      this.drawCircuitSchematic();
    }

    drawBenchSurface() {
      const ctx = this.ctx;

      // Subtle ambient lighting tint on the canvas to represent room illumination
      if (this.sim.ambientPercent > 0) {
        const ambientAlpha = (this.sim.ambientPercent / 100) * 0.18;
        ctx.fillStyle = `rgba(255, 230, 160, ${ambientAlpha})`;
        ctx.fillRect(0, 0, this.BASE_WIDTH, this.BASE_HEIGHT);
      }

      // Subtle engineering grid on the optical breadboard
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;
      const step = 20;

      for (let x = 0; x < this.BASE_WIDTH; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.BASE_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < this.BASE_HEIGHT; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.BASE_WIDTH, y);
        ctx.stroke();
      }

      // Optical breadboard tapped screw holes
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      for (let x = 40; x < 540; x += 40) {
        for (let y = 40; y < this.BASE_HEIGHT - 20; y += 40) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Division line between optical bench and electronic circuit section
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(555, 15);
      ctx.lineTo(555, this.BASE_HEIGHT - 15);
      ctx.stroke();
      ctx.setLineDash([]);

      // Section titles
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.fillText('OPTICAL BENCH ALIGNMENT ZONE', 60, 28);
      ctx.fillText('SIGNAL CONDITIONING & SWITCHING CIRCUIT (PCB)', 575, 28);
    }

    drawLaserModule(x, y, label) {
      const ctx = this.ctx;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 36, y - 18, 36, 36);

      // Metallic heatsink lines
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 30 + i * 7, y - 16);
        ctx.lineTo(x - 30 + i * 7, y + 16);
        ctx.stroke();
      }

      // Brass / Gold Aperture Collar
      ctx.fillStyle = '#d97706';
      ctx.fillRect(x, y - 10, 10, 20);

      // Laser Diode Lens Output
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x + 10, y, 6, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Power Indicator LED on module
      ctx.fillStyle = this.sim.isArmed ? '#22c55e' : '#64748b';
      ctx.shadowColor = this.sim.isArmed ? '#22c55e' : 'transparent';
      ctx.shadowBlur = this.sim.isArmed ? 6 : 0;
      ctx.beginPath();
      ctx.arc(x - 24, y - 10, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Module Label
      ctx.font = '700 9px monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText(label, x - 36, y + 28);
    }

    drawLaserBeam(from, to, isBlocked) {
      const ctx = this.ctx;
      const startX = from.x + 10;
      const startY = from.y;

      let endX = to.x;
      if (isBlocked) {
        endX = this.intruder.x;
      }

      ctx.save();

      // 1. Outer Soft Ruby Aura
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, startY);
      ctx.stroke();

      // 2. Mid Laser Glow
      ctx.strokeStyle = 'rgba(255, 51, 75, 0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, startY);
      ctx.stroke();

      // 3. Bright White Core Filament
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#ff2244';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, startY);
      ctx.stroke();

      // If blocked, draw glowing impact spot on the intruder's left side
      if (isBlocked) {
        ctx.fillStyle = '#ff2244';
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(endX, startY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Scatter reflection sparks
        ctx.strokeStyle = 'rgba(255, 120, 140, 0.7)';
        ctx.lineWidth = 1;
        for (let a = 0; a < 4; a++) {
          const angle = Math.PI - 0.7 + a * 0.45;
          ctx.beginPath();
          ctx.moveTo(endX, startY);
          ctx.lineTo(endX + Math.cos(angle) * 12, startY + Math.sin(angle) * 12);
          ctx.stroke();
        }
      } else {
        // Laser arrives at LDR aperture spot
        ctx.fillStyle = '#ff1133';
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(to.x, startY, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    drawDustParticles() {
      const ctx = this.ctx;
      ctx.save();
      for (let p of this.particles) {
        const nearBeam1 = Math.abs(p.y - this.laser1Pos.y) < 8 && (!this.sim.beam1Blocked || p.x < this.intruder.x);
        const nearBeam2 = this.sim.isDualBeam && Math.abs(p.y - this.laser2Pos.y) < 8 && (!this.sim.beam2Blocked || p.x < this.intruder.x);

        if (nearBeam1 || nearBeam2) {
          ctx.fillStyle = '#ff8899';
          ctx.shadowColor = '#ff2244';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(148, 163, 184, ${p.alpha * 0.25})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    drawIntruder() {
      const ctx = this.ctx;
      const { x, y, width, height, isDragging } = this.intruder;

      ctx.save();

      // Shadow underneath
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = isDragging ? 22 : 12;
      ctx.shadowOffsetY = isDragging ? 8 : 4;

      // Intruder Body Block
      const isBlockingAny = this.sim.beam1Blocked || (this.sim.isDualBeam && this.sim.beam2Blocked);
      ctx.fillStyle = isBlockingAny ? '#1e1b2e' : '#1e293b';
      ctx.strokeStyle = isDragging ? '#38bdf8' : (isBlockingAny ? '#ef4444' : '#475569');
      ctx.lineWidth = isDragging ? 2.5 : 1.5;

      drawRoundRect(ctx, x, y, width, height, 8);
      ctx.fill();
      ctx.stroke();

      // Hazard diagonal warning stripes on the block
      ctx.save();
      drawRoundRect(ctx, x, y, width, height, 8);
      ctx.clip();
      ctx.strokeStyle = isBlockingAny ? 'rgba(239, 68, 68, 0.28)' : 'rgba(245, 158, 11, 0.2)';
      ctx.lineWidth = 6;
      for (let i = -height; i < width + height; i += 18) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i - height, y + height);
        ctx.stroke();
      }
      ctx.restore();

      // Intruder Center Gripper / Handle
      ctx.fillStyle = isDragging ? '#38bdf8' : '#64748b';
      drawRoundRect(ctx, x + width / 2 - 8, y + height / 2 - 16, 16, 32, 4);
      ctx.fill();

      // Grip tactile ribs
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      for (let r = 0; r < 4; r++) {
        ctx.beginPath();
        ctx.moveTo(x + width / 2 - 5, y + height / 2 - 10 + r * 6);
        ctx.lineTo(x + width / 2 + 5, y + height / 2 - 10 + r * 6);
        ctx.stroke();
      }

      // Block Label
      ctx.save();
      ctx.translate(x + width / 2, y + 24);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '700 9px monospace';
      ctx.fillStyle = isBlockingAny ? '#fca5a5' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(isBlockingAny ? 'BREACHING' : 'INTRUDER', 0, 0);
      ctx.restore();

      // "DRAG ME" indicator tag when idle
      if (!isDragging && !this.intruder.isAutoPatrol) {
        ctx.font = '600 8px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.fillText('\u2195 DRAG', x + width / 2, y - 8);
      }

      ctx.restore();
    }

    drawLdrSensor(x, y, resistance, isBlocked, label) {
      const ctx = this.ctx;

      ctx.save();

      // Mounting bracket
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y - 16, 26, 32);
      ctx.strokeRect(x, y - 16, 26, 32);

      // Ceramic LDR Disc
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(x + 13, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();

      // Cadmium Sulfide (CdS) Serpentine Track
      ctx.strokeStyle = isBlocked ? '#92400e' : '#d97706';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x + 19, y - 6);
      ctx.lineTo(x + 19, y - 2);
      ctx.lineTo(x + 7, y - 2);
      ctx.lineTo(x + 7, y + 2);
      ctx.lineTo(x + 19, y + 2);
      ctx.lineTo(x + 19, y + 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.stroke();

      // Terminal Pins (Gold)
      ctx.fillStyle = '#eab308';
      ctx.fillRect(x + 26, y - 6, 8, 2);
      ctx.fillRect(x + 26, y + 6, 8, 2);

      // Value Badge
      ctx.font = '700 9px monospace';
      ctx.fillStyle = isBlocked ? '#f87171' : '#34d399';
      ctx.fillText(`${label}: ${resistance.toFixed(1)}k\u03A9`, x - 10, y + 26);

      ctx.restore();
    }

    drawCircuitSchematic() {
      const ctx = this.ctx;
      const isSaturated = this.sim.transistorState === 'SATURATION';
      const isAlarm = this.sim.isAlarmActive;

      ctx.save();

      // --- PCB Copper Traces ---
      ctx.strokeStyle = isSaturated ? 'rgba(6, 182, 212, 0.85)' : '#1e293b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Connection from LDR1/2 terminals to Voltage Divider Node
      const nodeX = 640;
      const nodeY = 170;

      ctx.beginPath();
      ctx.moveTo(this.ldr1Pos.x + 34, this.ldr1Pos.y);
      ctx.lineTo(nodeX, this.ldr1Pos.y);
      ctx.lineTo(nodeX, nodeY);
      ctx.stroke();

      if (this.sim.isDualBeam) {
        ctx.beginPath();
        ctx.moveTo(this.ldr2Pos.x + 34, this.ldr2Pos.y);
        ctx.lineTo(nodeX, this.ldr2Pos.y);
        ctx.lineTo(nodeX, nodeY);
        ctx.stroke();
      }

      // 2. Preset Potentiometer (R_PRESET) connection to +5V Rail
      ctx.beginPath();
      ctx.moveTo(nodeX, nodeY);
      ctx.lineTo(this.presetPotPos.x, this.presetPotPos.y + 20);
      ctx.stroke();

      // +5V Rail wire
      ctx.strokeStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(this.presetPotPos.x - 20, 60);
      ctx.lineTo(this.buzzerPos.x + 20, 60);
      ctx.stroke();

      ctx.font = '700 10px monospace';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('+5.0V VCC RAIL', this.presetPotPos.x - 20, 52);

      // Pot to VCC
      ctx.beginPath();
      ctx.moveTo(this.presetPotPos.x, 60);
      ctx.lineTo(this.presetPotPos.x, this.presetPotPos.y - 15);
      ctx.stroke();

      // 3. Trace from Divider Node to Transistor Base
      ctx.strokeStyle = isSaturated ? '#38bdf8' : '#334155';
      ctx.beginPath();
      ctx.moveTo(nodeX, nodeY);
      ctx.lineTo(this.transistorPos.x - 24, nodeY);
      ctx.stroke();

      // Node Solder Pad
      ctx.fillStyle = isSaturated ? '#38bdf8' : '#475569';
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '700 9px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`VB: ${this.sim.vBE.toFixed(2)}V`, nodeX - 18, nodeY + 16);

      // 4. Draw Preset Potentiometer Component
      this.drawPotentiometer(this.presetPotPos.x, this.presetPotPos.y, this.sim.rPreset);

      // 5. Draw NPN Transistor (BC547)
      this.drawNpnTransistor(this.transistorPos.x, this.transistorPos.y, isSaturated);

      // 6. Trace from Collector to Buzzer & Status LED
      ctx.strokeStyle = isSaturated ? '#ef4444' : '#334155';
      ctx.beginPath();
      ctx.moveTo(this.transistorPos.x, this.transistorPos.y - 24);
      ctx.lineTo(this.transistorPos.x, this.buzzerPos.y);
      ctx.lineTo(this.buzzerPos.x - 24, this.buzzerPos.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(this.transistorPos.x, this.transistorPos.y - 24);
      ctx.lineTo(this.transistorPos.x, this.ledPos.y);
      ctx.lineTo(this.ledPos.x - 20, this.ledPos.y);
      ctx.stroke();

      // 7. Buzzer connection to +5V
      ctx.strokeStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(this.buzzerPos.x, 60);
      ctx.lineTo(this.buzzerPos.x, this.buzzerPos.y - 22);
      ctx.stroke();

      // 8. Ground Trace from Emitter
      ctx.strokeStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(this.transistorPos.x, this.transistorPos.y + 24);
      ctx.lineTo(this.transistorPos.x, this.transistorPos.y + 55);
      ctx.stroke();
      this.drawGroundSymbol(this.transistorPos.x, this.transistorPos.y + 55);

      // 9. Draw Buzzer & LED Components
      this.drawBuzzerComponent(this.buzzerPos.x, this.buzzerPos.y, isAlarm);
      this.drawLedComponent(this.ledPos.x, this.ledPos.y, isAlarm);

      // 10. Animated Electron flow when transistor conducts
      if (isSaturated) {
        this.drawCurrentFlowDots();
      }

      ctx.restore();
    }

    drawPotentiometer(x, y, value) {
      const ctx = this.ctx;
      ctx.save();

      // Potentiometer Body
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      drawRoundRect(ctx, x - 16, y - 14, 32, 28, 4);
      ctx.fill();
      ctx.stroke();

      // Potentiometer Dial Knob
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      // Dial pointer based on resistance value (1 to 100 kΩ)
      const angle = -Math.PI * 0.75 + (value / 100) * (Math.PI * 1.5);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * 7, y + Math.sin(angle) * 7);
      ctx.stroke();

      ctx.font = '700 8px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.fillText(`R_POT: ${value.toFixed(1)}k`, x, y + 23);
      ctx.restore();
    }

    drawNpnTransistor(x, y, isSaturated) {
      const ctx = this.ctx;
      ctx.save();

      // Transistor Package Circle
      ctx.fillStyle = isSaturated ? 'rgba(239, 68, 68, 0.15)' : '#0f172a';
      ctx.strokeStyle = isSaturated ? '#ef4444' : '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Transistor Base bar
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 12);
      ctx.lineTo(x - 8, y + 12);
      ctx.stroke();

      // Base lead (B)
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 22, y);
      ctx.lineTo(x - 8, y);
      ctx.stroke();

      // Collector lead (C)
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 6);
      ctx.lineTo(x + 10, y - 16);
      ctx.lineTo(x, y - 22);
      ctx.stroke();

      // Emitter lead with NPN Arrow (E)
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 6);
      ctx.lineTo(x + 10, y + 16);
      ctx.lineTo(x, y + 22);
      ctx.stroke();

      // NPN Outward Arrow
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 14);
      ctx.lineTo(x + 12, y + 17);
      ctx.lineTo(x + 9, y + 10);
      ctx.fill();

      // Pin Labels
      ctx.font = '700 8px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('B', x - 20, y - 5);
      ctx.fillText('C', x + 12, y - 18);
      ctx.fillText('E', x + 12, y + 18);

      // Transistor State HUD tag
      ctx.font = '700 9px monospace';
      ctx.textAlign = 'center';
      if (isSaturated) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('SAT (ON)', x, y + 36);
      } else {
        ctx.fillStyle = '#10b981';
        ctx.fillText('CUT (OFF)', x, y + 36);
      }

      ctx.restore();
    }

    drawBuzzerComponent(x, y, isAlarm) {
      const ctx = this.ctx;
      ctx.save();

      // Buzzer Cylinder Body
      ctx.fillStyle = isAlarm ? '#3b0764' : '#1e1b4b';
      ctx.strokeStyle = isAlarm ? '#a855f7' : '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Central Acoustic Hole
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Buzzer sound waves when alarm is active
      if (isAlarm) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 2;
        const waveRadius = 24 + ((this.buzzerWavePhase * 15) % 25);
        ctx.beginPath();
        ctx.arc(x, y, waveRadius, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.beginPath();
        ctx.arc(x, y, waveRadius + 8, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();
      }

      ctx.font = '700 9px monospace';
      ctx.fillStyle = isAlarm ? '#f43f5e' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('BUZZER', x, y + 30);
      ctx.fillText('2.4 kHz', x, y + 40);

      ctx.restore();
    }

    drawLedComponent(x, y, isAlarm) {
      const ctx = this.ctx;
      ctx.save();

      // LED Lens Dome
      ctx.fillStyle = isAlarm ? '#ef4444' : '#10b981';
      ctx.shadowColor = isAlarm ? '#ef4444' : '#10b981';
      ctx.shadowBlur = isAlarm ? 18 : 8;

      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight on dome
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - 3, y - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '700 9px monospace';
      ctx.fillStyle = isAlarm ? '#ef4444' : '#10b981';
      ctx.textAlign = 'center';
      ctx.fillText(isAlarm ? 'ALARM LED' : 'STATUS LED', x, y + 22);

      ctx.restore();
    }

    drawGroundSymbol(x, y) {
      const ctx = this.ctx;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x + 12, y);
      ctx.moveTo(x - 7, y + 4);
      ctx.lineTo(x + 7, y + 4);
      ctx.moveTo(x - 3, y + 8);
      ctx.lineTo(x + 3, y + 8);
      ctx.stroke();

      ctx.font = '700 8px monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText('GND', x + 16, y + 5);
    }

    drawCurrentFlowDots() {
      const ctx = this.ctx;
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6;

      const offset = (this.electronPhase * 20) % 30;
      for (let y = this.transistorPos.y - 20; y > this.buzzerPos.y; y -= 12) {
        const dotY = y - (offset % 12);
        if (dotY >= this.buzzerPos.y) {
          ctx.beginPath();
          ctx.arc(this.transistorPos.x, dotY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // =========================================================================
  // 4. Real-Time Oscilloscope Canvas (Digital Waveform & Analog V_BE)
  // =========================================================================
  class OscilloscopeCanvas {
    constructor(canvas, sim) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.sim = sim;

      this.dpr = window.devicePixelRatio || 1;
      this.setupDPI();

      this.isPaused = false;
      this.bufferLength = 300; // time steps in history
      this.vbeHistory = new Array(this.bufferLength).fill(0.45);
      this.yOutHistory = new Array(this.bufferLength).fill(0);

      window.addEventListener('resize', () => this.setupDPI());
    }

    setupDPI() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width || this.canvas.width;
      this.height = rect.height || this.canvas.height;
      this.dpr = window.devicePixelRatio || 1;

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    pushSample() {
      if (this.isPaused) return;

      this.vbeHistory.shift();
      this.yOutHistory.shift();

      this.vbeHistory.push(this.sim.vBE);
      this.yOutHistory.push(this.sim.logicOutput);
    }

    clear() {
      this.vbeHistory.fill(0);
      this.yOutHistory.fill(0);
    }

    togglePause() {
      this.isPaused = !this.isPaused;
      return this.isPaused;
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      const w = this.width;
      const h = this.height;

      // 1. Draw Phosphor CRT Oscilloscope Grid
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
      ctx.lineWidth = 1;

      // Horizontal division lines (0V, 1V, 2V, 3V, 4V, 5V)
      const numDivsY = 5;
      for (let i = 0; i <= numDivsY; i++) {
        const y = 10 + (i / numDivsY) * (h - 25);
        ctx.beginPath();
        ctx.moveTo(35, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
      }

      // Vertical timebase graticule lines
      const numDivsX = 10;
      for (let j = 0; j <= numDivsX; j++) {
        const x = 35 + (j / numDivsX) * (w - 45);
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, h - 15);
        ctx.stroke();
      }

      // 2. Draw 0.7V Threshold Marker Line (Dotted Red)
      const yThreshold = (h - 15) - (0.70 / 5.0) * (h - 25);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(35, yThreshold);
      ctx.lineTo(w - 10, yThreshold);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Render CH1: V_BE Analog Waveform (Cyan)
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#0284c7';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const startX = 35;
      const plotWidth = w - 45;
      const plotHeight = h - 25;
      const bottomY = h - 15;

      for (let i = 0; i < this.bufferLength; i++) {
        const x = startX + (i / (this.bufferLength - 1)) * plotWidth;
        const val = Math.max(0, Math.min(5.0, this.vbeHistory[i]));
        const y = bottomY - (val / 5.0) * plotHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 4. Render CH2: Digital Logic Output Y (Red/Green Square Wave)
      ctx.strokeStyle = this.sim.isAlarmActive ? '#ef4444' : '#10b981';
      ctx.shadowColor = this.sim.isAlarmActive ? '#ef4444' : '#10b981';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      for (let i = 0; i < this.bufferLength; i++) {
        const x = startX + (i / (this.bufferLength - 1)) * plotWidth;
        const digitalVal = this.yOutHistory[i]; // 0 or 1
        const y = bottomY - (digitalVal * 1.0) * plotHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 5. Sweep Cursor Bar on latest sample
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w - 10, 10);
      ctx.lineTo(w - 10, h - 15);
      ctx.stroke();
    }
  }

  // =========================================================================
  // 5. Intrusion Event Logger & CSV Exporter
  // =========================================================================
  class IntrusionEventLogger {
    constructor(tableBody, countBadge) {
      this.tableBody = tableBody;
      this.countBadge = countBadge;
      this.events = [];
      this.currentBreach = null;
      this.eventCounter = 0;
    }

    startBreach(zoneName, vbe) {
      if (this.currentBreach) return;

      this.eventCounter++;
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

      this.currentBreach = {
        id: this.eventCounter,
        timestamp: timeStr,
        startTimeMs: performance.now(),
        zone: zoneName,
        peakVbe: vbe,
        transition: '0 \u2192 1 (ALARM)',
        duration: 'Active...',
        status: 'BREACH'
      };

      this.events.unshift(this.currentBreach);
      this.render();
    }

    updateBreach(vbe) {
      if (!this.currentBreach) return;
      if (vbe > this.currentBreach.peakVbe) {
        this.currentBreach.peakVbe = vbe;
      }
      const elapsed = ((performance.now() - this.currentBreach.startTimeMs) / 1000).toFixed(2);
      this.currentBreach.duration = `${elapsed} s`;
      this.renderFirstRowOnly();
    }

    endBreach() {
      if (!this.currentBreach) return;
      const elapsed = ((performance.now() - this.currentBreach.startTimeMs) / 1000).toFixed(2);
      this.currentBreach.duration = `${elapsed} s`;
      this.currentBreach.status = 'CLEARED';
      this.currentBreach = null;
      this.render();
    }

    clear() {
      this.events = [];
      this.currentBreach = null;
      this.eventCounter = 0;
      this.render();
    }

    renderFirstRowOnly() {
      const firstRow = this.tableBody.querySelector('.active-breach-row');
      if (firstRow && this.currentBreach) {
        const durCell = firstRow.querySelector('.duration-cell');
        const vbeCell = firstRow.querySelector('.vbe-cell');
        if (durCell) durCell.textContent = this.currentBreach.duration;
        if (vbeCell) vbeCell.textContent = `${this.currentBreach.peakVbe.toFixed(2)} V`;
      }
    }

    render() {
      this.countBadge.textContent = `${this.events.length} Events`;

      if (this.events.length === 0) {
        this.tableBody.innerHTML = `
          <tr class="empty-row">
            <td colspan="7">No security breaches recorded yet. Drag intruder across laser beam to trigger an event.</td>
          </tr>
        `;
        return;
      }

      let html = '';
      this.events.slice(0, 50).forEach((ev) => {
        const isActive = ev.status === 'BREACH';
        html += `
          <tr class="${isActive ? 'active-breach-row' : ''}">
            <td>#${ev.id}</td>
            <td>${ev.timestamp}</td>
            <td><strong>${ev.zone}</strong></td>
            <td class="vbe-cell">${ev.peakVbe.toFixed(2)} V</td>
            <td><span class="bit-badge ${isActive ? 'one' : 'zero'}">${ev.transition}</span></td>
            <td class="duration-cell">${ev.duration}</td>
            <td><span class="event-status-pill ${isActive ? 'active' : 'cleared'}">${ev.status}</span></td>
          </tr>
        `;
      });

      this.tableBody.innerHTML = html;
    }

    exportCSV() {
      if (this.events.length === 0) {
        alert('Event log is empty. Trigger an alarm breach first to export data.');
        return;
      }

      let csv = 'Event ID,Timestamp,Zone,Peak Base Voltage (V),Logic Transition,Duration,Status,Academic Project\n';
      this.events.forEach((ev) => {
        csv += `"${ev.id}","${ev.timestamp}","${ev.zone}","${ev.peakVbe.toFixed(2)}","${ev.transition}","${ev.duration}","${ev.status}","SRMU - Shahid Ali & Ravi Shankar"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Laser_Security_Alarm_Log_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  // =========================================================================
  // 6. Master Application Orchestrator & UI Controller
  // =========================================================================
  class LaserSecurityApp {
    constructor() {
      this.sim = new CircuitSimulator();
      this.audio = new AudioEngine();

      this.initDOMElements();
      this.bench = new OpticalBenchCanvas(this.canvasBench, this.sim, () => {
        this.handleUserInteraction();
      });
      this.osc = new OscilloscopeCanvas(this.canvasOsc, this.sim);
      this.logger = new IntrusionEventLogger(this.eventTableBody, this.logCountBadge);

      this.bindControls();
      this.bindKeyboard();
      this.bindGlobalAudioUnlock();
      this.startSimulationLoop();
      this.startClock();
    }

    initDOMElements() {
      this.btnAudioToggle = document.getElementById('btnAudioToggle');
      this.audioStatusText = document.getElementById('audioStatusText');
      this.btnSystemArm = document.getElementById('btnSystemArm');
      this.armStatusText = document.getElementById('armStatusText');
      this.btnTheoryModal = document.getElementById('btnTheoryModal');

      this.systemAlertBanner = document.getElementById('systemAlertBanner');
      this.alertBannerText = document.getElementById('alertBannerText');
      this.btnResetLatchBanner = document.getElementById('btnResetLatchBanner');

      this.canvasBench = document.getElementById('benchCanvas');
      this.canvasOsc = document.getElementById('oscCanvas');

      this.btnQuickBlock = document.getElementById('btnQuickBlock');
      this.quickBlockText = document.getElementById('quickBlockText');
      this.btnAutoPatrol = document.getElementById('btnAutoPatrol');
      this.autoPatrolText = document.getElementById('autoPatrolText');
      this.btnResetIntruder = document.getElementById('btnResetIntruder');

      this.hudBeamVal = document.getElementById('hudBeamVal');
      this.hudDualBeamStatus = document.getElementById('hudDualBeamStatus');
      this.hudDualBeamVal = document.getElementById('hudDualBeamVal');
      this.hudLdrVal = document.getElementById('hudLdrVal');
      this.hudVbeVal = document.getElementById('hudVbeVal');
      this.hudQ1Val = document.getElementById('hudQ1Val');
      this.hudOutputVal = document.getElementById('hudOutputVal');

      this.sliderPresetResistor = document.getElementById('sliderPresetResistor');
      this.valPresetResistor = document.getElementById('valPresetResistor');
      this.sliderAmbientLight = document.getElementById('sliderAmbientLight');
      this.valAmbientLight = document.getElementById('valAmbientLight');
      this.chkAlarmLatch = document.getElementById('chkAlarmLatch');
      this.chkDualBeam = document.getElementById('chkDualBeam');

      this.calibrationAdviceCard = document.getElementById('calibrationAdviceCard');
      this.adviceDot = document.getElementById('adviceDot');
      this.adviceTitle = document.getElementById('adviceTitle');
      this.adviceDesc = document.getElementById('adviceDesc');
      this.vbeMarginBar = document.getElementById('vbeMarginBar');
      this.marginValText = document.getElementById('marginValText');

      this.rowNormal = document.getElementById('rowNormal');
      this.rowAlarm = document.getElementById('rowAlarm');
      this.rowFalseNeg = document.getElementById('rowFalseNeg');

      this.blockLaser = document.getElementById('blockLaser');
      this.blockLdr = document.getElementById('blockLdr');
      this.blockLdrSub = document.getElementById('blockLdrSub');
      this.blockTransistor = document.getElementById('blockTransistor');
      this.blockTransistorSub = document.getElementById('blockTransistorSub');
      this.blockBuzzer = document.getElementById('blockBuzzer');
      this.blockBuzzerSub = document.getElementById('blockBuzzerSub');

      this.arrowLaserToLdr = document.getElementById('arrowLaserToLdr');
      this.arrowLdrToQ1 = document.getElementById('arrowLdrToQ1');
      this.arrowQ1ToBuzzer = document.getElementById('arrowQ1ToBuzzer');

      this.btnPauseOsc = document.getElementById('btnPauseOsc');
      this.btnClearOsc = document.getElementById('btnClearOsc');

      this.eventTableBody = document.getElementById('eventTableBody');
      this.logCountBadge = document.getElementById('logCountBadge');
      this.btnClearLog = document.getElementById('btnClearLog');
      this.btnExportCSV = document.getElementById('btnExportCSV');

      this.theoryModal = document.getElementById('theoryModal');
      this.btnCloseModal = document.getElementById('btnCloseModal');
      this.btnDismissModal = document.getElementById('btnDismissModal');

      this.audioUnlockPrompt = document.getElementById('audioUnlockPrompt');
      this.btnEnableAudioPrompt = document.getElementById('btnEnableAudioPrompt');

      this.systemHealthPill = document.getElementById('systemHealthPill');
      this.clockDisplay = document.getElementById('clockDisplay');
    }

    handleUserInteraction() {
      this.audio.resume();
      if (this.audioUnlockPrompt) {
        this.audioUnlockPrompt.classList.add('hidden');
      }
    }

    bindGlobalAudioUnlock() {
      const unlock = () => {
        this.handleUserInteraction();
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });
    }

    bindControls() {
      // Audio Mute Toggle
      this.btnAudioToggle.addEventListener('click', () => {
        this.handleUserInteraction();
        const isMuted = this.audio.toggleMute();
        if (isMuted) {
          this.btnAudioToggle.classList.remove('active');
          this.btnAudioToggle.classList.add('muted');
          this.audioStatusText.textContent = 'MUTED (OFF)';
        } else {
          this.btnAudioToggle.classList.add('active');
          this.btnAudioToggle.classList.remove('muted');
          this.audioStatusText.textContent = 'ACTIVE (2.4 kHz)';
          if (this.sim.isAlarmActive) {
            this.audio.startBuzzer();
          }
        }
      });

      // System Arm / Disarm Toggle
      this.btnSystemArm.addEventListener('click', () => {
        this.handleUserInteraction();
        this.sim.isArmed = !this.sim.isArmed;
        if (this.sim.isArmed) {
          this.btnSystemArm.classList.add('armed');
          this.btnSystemArm.classList.remove('disarmed');
          this.armStatusText.textContent = 'ARMED';
        } else {
          this.btnSystemArm.classList.remove('armed');
          this.btnSystemArm.classList.add('disarmed');
          this.armStatusText.textContent = 'DISARMED';
          this.audio.stopBuzzer();
        }
      });

      // Quick Block Button
      this.btnQuickBlock.addEventListener('click', () => {
        this.handleUserInteraction();
        this.bench.toggleQuickBlock();
      });

      // Auto-Patrol Button
      this.btnAutoPatrol.addEventListener('click', () => {
        this.handleUserInteraction();
        const isPatrolling = this.bench.toggleAutoPatrol();
        if (isPatrolling) {
          this.btnAutoPatrol.classList.add('active-patrol');
          this.autoPatrolText.textContent = 'Stop Patrol (P)';
        } else {
          this.btnAutoPatrol.classList.remove('active-patrol');
          this.autoPatrolText.textContent = 'Auto-Patrol Intruder';
        }
      });

      // Reset Intruder Position
      this.btnResetIntruder.addEventListener('click', () => {
        this.handleUserInteraction();
        this.bench.resetPosition();
      });

      // Preset Potentiometer Slider
      this.sliderPresetResistor.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.sim.rPreset = val;
        this.valPresetResistor.textContent = `${val.toFixed(1)} k\u03A9`;
      });

      // Ambient Light Slider
      this.sliderAmbientLight.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.sim.ambientPercent = val;
        this.valAmbientLight.textContent = `${val} %`;
        this.updateAmbientButtonStates(val);
      });

      // Ambient Preset Quick Buttons
      document.querySelectorAll('[data-ambient]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          this.handleUserInteraction();
          const val = parseInt(e.target.dataset.ambient, 10);
          this.sim.ambientPercent = val;
          this.sliderAmbientLight.value = val;
          this.valAmbientLight.textContent = `${val} %`;
          this.updateAmbientButtonStates(val);
        });
      });

      // Alarm Latch Toggle
      this.chkAlarmLatch.addEventListener('change', (e) => {
        this.handleUserInteraction();
        this.sim.isAlarmLatchMode = e.target.checked;
        if (!e.target.checked) {
          this.sim.resetLatch();
        }
      });

      // Dual-Beam Coverage Toggle
      this.chkDualBeam.addEventListener('change', (e) => {
        this.handleUserInteraction();
        this.sim.isDualBeam = e.target.checked;
        if (this.sim.isDualBeam) {
          this.hudDualBeamStatus.classList.remove('hidden');
        } else {
          this.hudDualBeamStatus.classList.add('hidden');
        }
      });

      // Reset Latched Alarm Button
      this.btnResetLatchBanner.addEventListener('click', () => {
        this.handleUserInteraction();
        this.sim.resetLatch();
      });

      // Oscilloscope Pause & Clear
      this.btnPauseOsc.addEventListener('click', () => {
        const isPaused = this.osc.togglePause();
        this.btnPauseOsc.textContent = isPaused ? 'Resume' : 'Pause';
      });

      this.btnClearOsc.addEventListener('click', () => {
        this.osc.clear();
      });

      // Log actions
      this.btnClearLog.addEventListener('click', () => {
        this.logger.clear();
      });

      this.btnExportCSV.addEventListener('click', () => {
        this.logger.exportCSV();
      });

      // Modal Dialogs
      this.btnTheoryModal.addEventListener('click', () => {
        this.theoryModal.classList.remove('hidden');
      });

      this.btnCloseModal.addEventListener('click', () => {
        this.theoryModal.classList.add('hidden');
      });

      this.btnDismissModal.addEventListener('click', () => {
        this.theoryModal.classList.add('hidden');
      });

      this.theoryModal.addEventListener('click', (e) => {
        if (e.target === this.theoryModal) {
          this.theoryModal.classList.add('hidden');
        }
      });

      // Audio prompt banner
      if (this.btnEnableAudioPrompt) {
        this.btnEnableAudioPrompt.addEventListener('click', () => {
          this.handleUserInteraction();
        });
      }
    }

    updateAmbientButtonStates(currentVal) {
      document.querySelectorAll('[data-ambient]').forEach((btn) => {
        const btnVal = parseInt(btn.dataset.ambient, 10);
        if (btnVal === currentVal) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    bindKeyboard() {
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
          if (e.target.tagName !== 'INPUT') {
            e.preventDefault();
            this.handleUserInteraction();
            this.bench.toggleQuickBlock();
          }
        } else if (e.key === 'r' || e.key === 'R') {
          this.handleUserInteraction();
          this.sim.resetLatch();
        } else if (e.key === 'm' || e.key === 'M') {
          this.btnAudioToggle.click();
        } else if (e.key === 'a' || e.key === 'A') {
          this.btnSystemArm.click();
        } else if (e.key === 'p' || e.key === 'P') {
          this.btnAutoPatrol.click();
        } else if (e.key === 'd' || e.key === 'D') {
          this.chkDualBeam.checked = !this.chkDualBeam.checked;
          this.chkDualBeam.dispatchEvent(new Event('change'));
        }
      });
    }

    startSimulationLoop() {
      let oscCounter = 0;

      const loop = () => {
        // 1. Step Optical Bench and Physics
        this.bench.updatePhysics();

        // 2. Render Canvas Scenes
        this.bench.render();

        // 3. Update Oscilloscope samples at ~30Hz
        oscCounter++;
        if (oscCounter % 2 === 0) {
          this.osc.pushSample();
        }
        this.osc.render();

        // 4. Update UI Dashboard Indicators & Text
        this.syncDashboardState();

        // 5. Manage Audio Buzzer & Logging
        this.manageAudioAndEvents();

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    }

    syncDashboardState() {
      const sim = this.sim;

      // HUD Beam Status
      if (sim.beam1Blocked) {
        this.hudBeamVal.textContent = 'INTERRUPTED';
        this.hudBeamVal.className = 'hud-val alarm';
      } else {
        this.hudBeamVal.textContent = 'CLEAR (ACTIVE)';
        this.hudBeamVal.className = 'hud-val normal';
      }

      if (sim.isDualBeam) {
        if (sim.beam2Blocked) {
          this.hudDualBeamVal.textContent = 'INTERRUPTED';
          this.hudDualBeamVal.className = 'hud-val alarm';
        } else {
          this.hudDualBeamVal.textContent = 'CLEAR (ACTIVE)';
          this.hudDualBeamVal.className = 'hud-val normal';
        }
      }

      // Quick Block Button label
      const isAnyBlocked = sim.beam1Blocked || (sim.isDualBeam && sim.beam2Blocked);
      this.quickBlockText.textContent = isAnyBlocked ? 'Unblock Beam (Space)' : 'Block Beam (Space)';

      // Resistance & Voltage HUD
      this.hudLdrVal.textContent = `${sim.rLdr1.toFixed(1)} k\u03A9`;
      this.hudVbeVal.textContent = `${sim.vBE.toFixed(2)} V`;

      if (sim.transistorState === 'SATURATION') {
        this.hudQ1Val.textContent = 'SATURATION (ON)';
        this.hudQ1Val.className = 'hud-val alarm';
      } else {
        this.hudQ1Val.textContent = 'CUTOFF (OFF)';
        this.hudQ1Val.className = 'hud-val normal';
      }

      if (sim.logicOutput === 1) {
        this.hudOutputVal.textContent = '1 (HIGH - 5V)';
        this.hudOutputVal.className = 'hud-val alarm';
      } else {
        this.hudOutputVal.textContent = '0 (LOW - 0V)';
        this.hudOutputVal.className = 'hud-val normal';
      }

      // Top Alert Banner
      if (!sim.isArmed) {
        this.systemAlertBanner.className = 'alert-banner disarmed';
        this.alertBannerText.textContent = 'SYSTEM DISARMED — OPTICAL BENCH IN STANDBY TEST MODE';
        this.btnResetLatchBanner.classList.add('hidden');
        this.systemHealthPill.className = 'system-health-pill';
        this.systemHealthPill.innerHTML = '<span class="health-dot"></span> SYSTEM HEALTH: STANDBY (DISARMED)';
      } else if (sim.isLatchedAlarm) {
        this.systemAlertBanner.className = 'alert-banner latched';
        this.alertBannerText.textContent = '\u26A0 INTRUSION BREACH LATCHED — ALARM LOCKED ACTIVE UNTIL RESET BUTTON CLICKED';
        this.btnResetLatchBanner.classList.remove('hidden');
        this.systemHealthPill.className = 'system-health-pill alarm';
        this.systemHealthPill.innerHTML = '<span class="health-dot"></span> SYSTEM HEALTH: LATCHED ALARM';
      } else if (sim.isAlarmActive) {
        this.systemAlertBanner.className = 'alert-banner alarm-active';
        this.alertBannerText.textContent = '\u26A1 PERIMETER BREACH DETECTED! LASER BEAM INTERRUPTED — PIEZO BUZZER ENERGIZED';
        this.btnResetLatchBanner.classList.add('hidden');
        this.systemHealthPill.className = 'system-health-pill alarm';
        this.systemHealthPill.innerHTML = '<span class="health-dot"></span> SYSTEM HEALTH: INTRUSION ACTIVE';
      } else if (sim.stateClassification === 'fault') {
        this.systemAlertBanner.className = 'alert-banner latched';
        this.alertBannerText.textContent = '\u26A0 WARNING: FALSE NEGATIVE DETECTED! AMBIENT LIGHT IS KEEPING R_LDR TOO LOW TO TRIGGER';
        this.btnResetLatchBanner.classList.add('hidden');
        this.systemHealthPill.className = 'system-health-pill alarm';
        this.systemHealthPill.innerHTML = '<span class="health-dot"></span> SYSTEM HEALTH: AMBIENT FAULT';
      } else {
        this.systemAlertBanner.className = 'alert-banner standby';
        this.alertBannerText.textContent = 'SYSTEM ARMED — LASER SURVEILLANCE PERIMETER ACTIVE (NO INTRUSION)';
        this.btnResetLatchBanner.classList.add('hidden');
        this.systemHealthPill.className = 'system-health-pill';
        this.systemHealthPill.innerHTML = '<span class="health-dot"></span> SYSTEM HEALTH: NOMINAL (ARMED)';
      }

      // Truth Table Active Row Highlighting
      this.rowNormal.classList.remove('active-row');
      this.rowAlarm.classList.remove('active-row');
      this.rowFalseNeg.classList.remove('active-row');

      if (sim.stateClassification === 'alarm') {
        this.rowAlarm.classList.add('active-row');
      } else if (sim.stateClassification === 'fault') {
        this.rowFalseNeg.classList.add('active-row');
      } else {
        this.rowNormal.classList.add('active-row');
      }

      // Calibration Advice & Margin Card
      const margin = sim.vNode - 0.70;
      this.marginValText.textContent = `${margin >= 0 ? '+' : ''}${margin.toFixed(2)} V`;
      const fillPercent = Math.min(100, Math.max(0, (sim.vNode / 5.0) * 100));
      this.vbeMarginBar.style.width = `${fillPercent}%`;

      if (sim.transistorState === 'SATURATION') {
        this.vbeMarginBar.classList.add('saturated');
      } else {
        this.vbeMarginBar.classList.remove('saturated');
      }

      if (sim.stateClassification === 'fault') {
        this.calibrationAdviceCard.className = 'control-card advice-card warning-mode';
        this.adviceDot.className = 'status-indicator-dot warning';
        this.adviceTitle.textContent = 'Miscalibrated: False Negative Risk';
        this.adviceDesc.textContent = `High ambient light (${sim.ambientPercent}%) is keeping R_LDR down to ${sim.rLdr1.toFixed(1)}k\u03A9. Increase R_PRESET potentiometer (currently ${sim.rPreset.toFixed(1)}k\u03A9) or shield LDR with an optical hood to enable switching!`;
      } else if (sim.rPreset > 70 && sim.ambientPercent > 40) {
        this.calibrationAdviceCard.className = 'control-card advice-card warning-mode';
        this.adviceDot.className = 'status-indicator-dot warning';
        this.adviceTitle.textContent = 'High Sensitivity Setting';
        this.adviceDesc.textContent = 'High preset resistance increases sensitivity but makes system prone to false triggers from slight ambient shadows.';
      } else {
        this.calibrationAdviceCard.className = 'control-card advice-card';
        this.adviceDot.className = 'status-indicator-dot normal';
        this.adviceTitle.textContent = 'Optimal Lab Calibration';
        this.adviceDesc.textContent = 'Circuit operating point is nominal. Laser cutoff drops V_B below 0.7V cleanly, and beam obstruction will trigger reliable saturation.';
      }

      // Signal Flow Architecture Block Diagram updates
      this.blockLaser.className = sim.isArmed ? 'flow-block active-glow-laser' : 'flow-block';
      this.arrowLaserToLdr.className = (!sim.beam1Blocked && sim.isArmed) ? 'flow-arrow active' : 'flow-arrow';

      this.blockLdr.className = isAnyBlocked ? 'flow-block active-glow-ldr' : 'flow-block';
      this.blockLdrSub.textContent = `R = ${sim.rLdr1.toFixed(1)} k\u03A9`;
      this.arrowLdrToQ1.className = (sim.transistorState === 'SATURATION') ? 'flow-arrow active' : 'flow-arrow';

      if (sim.transistorState === 'SATURATION') {
        this.blockTransistor.className = 'flow-block active-glow-q1-sat';
        this.blockTransistorSub.textContent = `V_BE = ${sim.vBE.toFixed(2)}V (Saturation)`;
      } else {
        this.blockTransistor.className = 'flow-block active-glow-q1-cut';
        this.blockTransistorSub.textContent = `V_BE = ${sim.vBE.toFixed(2)}V (Cutoff)`;
      }

      this.arrowQ1ToBuzzer.className = sim.isAlarmActive ? 'flow-arrow active' : 'flow-arrow';

      if (sim.isAlarmActive) {
        this.blockBuzzer.className = 'flow-block active-glow-buzzer';
        this.blockBuzzerSub.textContent = 'Output: 1 (ALARM ON)';
      } else {
        this.blockBuzzer.className = 'flow-block';
        this.blockBuzzerSub.textContent = 'Output: 0 (SILENT)';
      }
    }

    manageAudioAndEvents() {
      const sim = this.sim;

      // Audio handling
      if (sim.isAlarmActive) {
        this.audio.startBuzzer();
      } else {
        this.audio.stopBuzzer();
      }

      // Event Logging handling
      if (sim.isAlarmActive && !this.logger.currentBreach) {
        let zone = 'Zone 1 (Primary)';
        if (sim.isDualBeam) {
          if (sim.beam1Blocked && sim.beam2Blocked) zone = 'Zone 1 & 2 (Dual Breach)';
          else if (sim.beam2Blocked) zone = 'Zone 2 (Secondary)';
        }
        this.logger.startBreach(zone, sim.vBE);
      } else if (sim.isAlarmActive && this.logger.currentBreach) {
        this.logger.updateBreach(sim.vBE);
      } else if (!sim.isAlarmActive && this.logger.currentBreach) {
        this.logger.endBreach();
      }
    }

    startClock() {
      const updateClock = () => {
        const now = new Date();
        this.clockDisplay.textContent = now.toTimeString().split(' ')[0];
      };
      updateClock();
      setInterval(updateClock, 1000);
    }
  }

  // Initialize application upon DOM readiness
  window.addEventListener('DOMContentLoaded', () => {
    window.laserApp = new LaserSecurityApp();
  });
})();
