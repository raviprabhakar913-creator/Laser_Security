# Laser Security Alarm System — Digital Electronics Simulator & Monitoring Dashboard

**Academic Mini-Project for Digital Electronics**  
**Authors:** Shahid Ali &amp; Ravi Shankar  
**Institution:** Shri Ramswaroop Memorial University (SRMU)  
**Department:** Faculty of Electrical &amp; Electronics Engineering  

---

## 🌟 Overview & Highlights

The **Laser Security Alarm System Simulator & Monitoring Dashboard** is a high-fidelity single-page engineering web application built in pure vanilla HTML5, CSS3, and modern JavaScript using the **HTML5 Canvas API** and **Web Audio API**.

It simulates the exact electrical physics, optical interactions, and digital logic transitions of an active laser perimeter security system utilizing a Cadmium Sulfide (CdS) **Light Dependent Resistor (LDR)**, a **preset potentiometer sensitivity divider**, an **NPN Bipolar Junction Transistor (BC547)** configured as a saturated digital switch, and a **2.4 kHz piezoelectric resonant buzzer**.

---

## 🔬 Core System Architecture & Modules

### 1. Header & Project Metadata Bar
- **Academic Citation & Affiliation:** Shri Ramswaroop Memorial University (SRMU), Shahid Ali & Ravi Shankar.
- **Master Audio Buzzer (Web Audio API):** Synthesizes authentic 2.4 kHz piezoelectric square-wave alarm beeps with a 6Hz pulse envelope when breached. Supports instant mute/unmute.
- **Master System Arm / Disarm Switch:** Toggle between active surveillance mode and standby testing mode.
- **Circuit Theory Dialog:** Modal popup with full mathematical derivations, transistor state formulas, and complete Bill of Materials (BOM).

### 2. Interactive Optical Bench & Circuit Canvas
- **Collimated Laser Diode (650nm Red Beam):** Emits intense glowing laser beams with core filament and soft radiant blooms.
- **Dual-Beam Coverage Mode:** Toggles a secondary parallel laser path (Zone 1 + Zone 2) with digital OR-logic combining for fail-safe perimeter enclosure.
- **Draggable Intruder Block:** Fully interactive mouse and touch-drag obstruction block with collision detection, laser impact glow, and realistic shadow rendering.
- **Quick Block & Auto-Patrol:** Quick button (or **Spacebar**) to snap obstruction into the beam path, plus an automated patrol sweep mode (**P**) that moves the intruder back and forth.
- **LDR Sensor & Live Readout:** Displays live dynamic resistance $R_{LDR}$ calculated from incident laser lux and ambient illumination.
- **Schematic Circuitry on Bench:** Live PCB copper traces, potentiometer dial, NPN transistor symbol (Base, Collector, Emitter), animated electron flow, vibrating buzzer diaphragm, and status LEDs.

### 3. Hardware Calibration & Real-World Parameter Controls
- **Preset Potentiometer ($R_{PRESET}$):** $1\text{ k}\Omega$ to $100\text{ k}\Omega$ sensitivity slider adjusting voltage divider ratio.
- **Ambient Room Light Exposure:** $0\%$ to $100\%$ slider demonstrating real-world false negatives where bright ambient light prevents $V_{BE}$ from crossing $0.7\text{V}$. Quick presets include *Darkroom (0%)*, *Indoor Lab (15%)*, *Bright Office (50%)*, and *Direct Sunlight (90%)*.
- **Alarm Latch Mode (SR Latch Simulation):** Locks alarm output at Logic 1 upon breach even after intruder vacates until the manual *Reset Latched Alarm* button (or **R** key) is pressed.
- **Sensitivity Margin Meter:** Live visual bar showing base voltage margin relative to the $0.7\text{V}$ silicon conduction threshold.

### 4. Digital Electronics Logic & Live Truth Table
- **Dynamic State Tracking:** Automatically highlights the active state row:
  - **S0 (NORMAL):** Laser unblocked $\rightarrow R_{LDR} < 2\text{ k}\Omega \rightarrow V_{BE} < 0.7\text{V} \rightarrow$ Transistor Cutoff (OFF) $\rightarrow$ Logic $0$ (Silent).
  - **S1 (INTRUSION):** Laser blocked $\rightarrow R_{LDR} > 50\text{ k}\Omega \rightarrow V_{BE} \ge 0.7\text{V} \rightarrow$ Transistor Saturation (ON) $\rightarrow$ Logic $1$ (Alarm).
  - **S2 (FAULT / AMBIENT):** Laser blocked in bright room $\rightarrow R_{LDR}$ stays low $\rightarrow V_{BE} < 0.7\text{V} \rightarrow$ False Negative (Missed intrusion).
- **Animated Architecture Block Diagram:** Visual signal propagation through `[Laser Source] -> [LDR Sensor] -> [NPN Transistor Switch] -> [Piezo Buzzer & LED]`.

### 5. Real-Time Oscilloscope & Intrusion Event Audit Log
- **Dual-Trace Oscilloscope:** Phosphor CRT grid plotting:
  - **CH1 (Cyan):** Analog Base Voltage $V_{BE}(t)$ ($0\text{V}$ to $5\text{V}$).
  - **CH2 (Red/Green):** Digital Logic Output $Y(t)$ square wave ($0\text{V} / 5\text{V}$).
  - Reference dotted line at the critical $0.7\text{V}$ cutoff/saturation transition threshold.
  - Pause / Resume and Clear controls.
- **Timestamped Intrusion Event Log:**
  - Records Event ID, Timestamp (HH:MM:SS.mmm), Triggered Zone, Peak $V_{BE}$, Transition ($0 \rightarrow 1$), Duration, and Status.
  - Live duration timer for active breaches.
  - **Export CSV:** Exports audit records in standard RFC 4180 CSV format for lab report data logging.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|:---|:---|
| **Spacebar** | Quick Block / Unblock Laser Beam |
| **R** | Reset Latched Alarm |
| **M** | Toggle Audio Buzzer Mute / Active (2.4 kHz) |
| **A** | Toggle System Armed / Disarmed |
| **P** | Toggle Auto-Patrol Intruder Mode |
| **D** | Toggle Dual-Beam Coverage Mode |

---

## 🚀 How to Run

1. Open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari).
2. No build step, Node.js server, or external libraries required. The application runs entirely client-side using pure Web APIs.
3. Click anywhere on the interface or press **Spacebar** to initialize the Web Audio 2.4 kHz piezo buzzer tone.
