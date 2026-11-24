---
name: update-readme
description: Regenerate the 10 Loop Kicker Journey application screenshots in docs/screenshots/ at 1730x1860 resolution and update README.md. ONLY invoke this skill when the user explicitly asks to run update-readme, regenerate screenshots, or update README.md—never run it automatically after code or UI changes.
model: Gemini 4 Hydrogen (copilot)
---

# Update README & Screenshots Skill (`update-readme`)

**IMPORTANT — Explicit Invocation Only**: Only run this skill when the user **explicitly** asks for it (for example, by invoking `/update-readme` or explicitly requesting to regenerate screenshots or update `README.md`). Never invoke this skill automatically after editing `index.html`, `js/`, or other project files.

## Screenshot Specifications & Requirements

All screenshots in `docs/screenshots/*.png` must adhere to the following exact specifications:

1. **Dimensions**: `1730 x 1860` pixels (`865 x 930` CSS viewport rendered at `deviceScaleFactor: 2` Retina scale).
2. **Complete State & Screen Coverage**: Capture screenshots for every application screen/state in chronological workflow order:
   - **Splashscreen (`#screenSplash`)**: `01-start.png`
   - **Step 1 — Pairing & Rules (`#screenPairing`)**: `01-pairing.png`
   - **Step 2 — Training Selection (`#screenTraining`)**: `01-training.png`
   - **Step 3 — Avatar Selection (`#screenAvatar`)**: `01-avatar.png`
   - **In-Game Active Flight (`#screenGame`)**: `02-flight.png`, `03-delorean.png`, `04-ufo.png`, `05-fuchur.png`, `05-paramotor.png`
   - **Post-Flight Workout Summary (`#summaryModal`)**: `06-summary.png`
3. **Flight & Control State for Active Flight Screenshots (`02-flight.png` through `05-paramotor.png`)**:
   - **`START FLIGHT` Active**: The workout must be actively flying (`#avatarStartFlightBtn` triggered so `state.isRunning` is `true` on `#screenGame`). Do **not** click `Finish` (`#finishWorkoutBtn`) until after all active flight screenshots have been captured.
   - **Forward Velocity Temporarily Set to Zero (Before Any Gate Is Reached)**: During active flight captures, temporarily freeze forward velocity (`dragon3D.flightZ = 0`, `dragon3D.subSec = 0`, `dragon3D.baseElapsedSec = state.elapsedSec`) while snapping vertical altitude and camera to target watts so all avatar screenshots are captured cleanly before any gate is reached (`state.gatesPassedCount === 0`, with the first gate ahead at `z = -60`). Restore normal forward velocity afterwards.
   - **`Auto-Fly Target Gate` Checked**: `#simAutoFollowCheck` must be checked (`true`) so simulated watts automatically track the current block's target power.
   - **`Steering` Turned Off**: `#steeringToggleCheck` must be unchecked (`false`, displaying `Steering: OFF (Auto-Fly Gates)`). With steering turned off, `dragonWorldX` automatically tracks the canyon gate center (`currentCourseX`), keeping every avatar aligned straight with the glowing target-watt donut rings ahead.

## The 10 Screenshots in `docs/screenshots/`

| File | Screen / State | Avatar (`#avatarSelect`) | Resistance (`#resistanceModeSelect`) | Notes |
|------|----------------|--------------------------|--------------------------------------|-------|
| `01-start.png` | Splashscreen (`splash` / `#screenSplash`) | `aero_wyvern` | `flat` | Pre-flight Dragon Splashscreen with hero artwork and **Start Setup** CTA (`#splashStartBtn`) |
| `01-pairing.png` | Step 1: Pairing & Rules (`pairing` / `#screenPairing`) | `aero_wyvern` | `flat` | Bluetooth/wireless pairing cards, `Steering: OFF (Auto-Fly Gates)`, and `Auto-Fly Target Gate` checked |
| `01-training.png` | Step 2: Training Selection (`training` / `#screenTraining`) | `aero_wyvern` | `flat` | Workout profile preview (`#trainingPreviewCanvas`), FTP, resistance/wind mode, Zwift `.zwo` upload, and preset workout cards |
| `01-avatar.png` | Step 3: Avatar Selection (`avatar` / `#screenAvatar`) | `aero_wyvern` | `flat` | Live 3D sky preview stage at target-gate altitude, 6 avatar cards, and **Start Flight** CTA (`#avatarStartFlightBtn`) |
| `02-flight.png` | Active flight (`game` / `#screenGame`) | `aero_wyvern` | `flat` | Active flight through target-watt donut gates |
| `03-delorean.png` | Active flight (`game` / `#screenGame`) | `delorean` | `hilly` | Advanced forward two segments to a higher-watt block |
| `04-ufo.png` | Active flight (`game` / `#screenGame`) | `mars_ufo` | `hilly` | Mars Attacks UFO flying through canyon gates |
| `05-fuchur.png` | Active flight (`game` / `#screenGame`) | `fuchur` | `flat` | Fuchur (Luckdragon) flying through the donut gates |
| `05-paramotor.png` | Active flight (`game` / `#screenGame`) | `paramotor` | `flat` | Paramotor pilot under the white/lilac Phi Maestro Light 3 wing |
| `06-summary.png` | Post-flight (`summary` / `#summaryModal`) | any | any | Workout Summary screen (`#finishWorkoutBtn` clicked last) with rank, metrics, and `.fit` / `.png` export |

## Step-by-Step Workflow

### 1. Regenerate All Screenshots
Run the bundled automation script from the repository root:

```bash
python3 .github/skills/update-readme/capture_screenshots.py
```

### 2. Verify Dimensions and Visual Quality
1. Check that all 10 PNG files in `docs/screenshots/` have dimensions `1730 x 1860`:
   ```bash
   file docs/screenshots/*.png
   ```
2. Visually inspect each generated PNG using `view` to confirm:
   - `01-start.png` shows the Dragon Splashscreen (`#screenSplash`) with **Start Setup**.
   - `01-pairing.png` shows **Step 1 of 3: Pair Devices & Flight Rules** (`#screenPairing`) with `Steering: OFF (Auto-Fly Gates)` and `Auto-Fly Target Gate` checked.
   - `01-training.png` shows **Step 2 of 3: Select Training Workout** (`#screenTraining`) with the rendered `#trainingPreviewCanvas` timeline and preset cards.
   - `01-avatar.png` shows **Step 3 of 3: Choose Your 3D Flying Avatar** (`#screenAvatar`) with the live 3D avatar preview in the sky window and **Start Flight** CTA.
   - `02-flight.png`, `03-delorean.png`, `04-ufo.png`, `05-fuchur.png`, and `05-paramotor.png` all show active flight (flight running, `Auto-Fly Target Gate` checked, forward velocity frozen before any gate is reached, aligned with the glowing donut gates ahead).
   - `06-summary.png` displays the post-flight Workout Summary screen (`#summaryModal`).

### 3. Sync `README.md` Documentation
Review recent changes in `index.html`, `css/`, and `js/` (e.g., via `git log -n 5` or `git diff`) and ensure `README.md` accurately documents:
- All Screenshot Gallery entries (`docs/screenshots/01-start.png`, `01-pairing.png`, `01-training.png`, `01-avatar.png`, `02-flight.png` through `05-paramotor.png`, and `06-summary.png`).
- Multi-step setup wizard screens, Bluetooth/wireless devices (FTMS Smart Trainer, Concept2 PM5, BLE Heart Rate, Cadence sensors, Elite Sterzo/Rizer & Phone QR steering, Elite Aria smart fan), avatars, resistance modes, and `.fit` / `.png` exports.
