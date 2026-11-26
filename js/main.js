// =========================================================================
// 10. EVENT LISTENERS, SPACEBAR OBSTACLE DEFENSE & INITIALIZATION
// =========================================================================
async function loadAppVersion() {
    const versionBadge = document.getElementById('appVersionBadge');
    if (!versionBadge) return;

    try {
        const response = await fetch('/version.txt', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Version request failed with HTTP ${response.status}`);
        const version = (await response.text()).trim();
        if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid version format');
        versionBadge.textContent = `Version ${version}`;
    } catch (error) {
        versionBadge.textContent = 'Version unavailable';
        console.error('Could not load application version:', error);
    }
}

loadAppVersion();

function applyFtpWatts(rawValue, persist = true) {
    const val = parseInt(rawValue, 10);
    if (!isNaN(val) && val >= 50 && val <= 600) {
        state.ftp = val;
        if (persist) localStorage.setItem('loop_kicker_journey_ftp', String(val));
        if (state.simMode && state.simAutoJitter) {
            const targetW = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
            state.actualWatts = targetW;
            document.getElementById('simWattSlider').value = targetW;
            document.getElementById('simWattReadout').textContent = `${targetW} W`;
        }
        if (dragon3D) {
            dragon3D.gates.forEach(g => dragon3D.syncGateToDesiredWatts(g));
        }
        updateExpectedWorkoutMetricsUI();
        renderPresetWorkoutCards();
        updateAvatarReadySummaryUI();
        updateLiveHud();
    }
}

document.getElementById('ftpInput').addEventListener('change', (e) => {
    applyFtpWatts(e.target.value);
});

document.getElementById('ftpInput').addEventListener('input', (e) => {
    applyFtpWatts(e.target.value);
});

document.getElementById('obstaclesToggleCheck').addEventListener('change', (e) => {
    state.renderObstacles = e.target.checked;
    if (areObstaclesEnabled() && dragon3D) {
        dragon3D.seedInitialGatesAndObstacles();
    }
    updateHeaderAndSetupVisibility();
});

const fireBreathBtnEl = document.getElementById('fireBreathBtn');
if (fireBreathBtnEl) {
    fireBreathBtnEl.addEventListener('click', () => {
        if (dragon3D) dragon3D.triggerDragonFireBreath();
    });
}

function syncAvatarCardsUI() {
    document.querySelectorAll('[data-avatar-card]').forEach((card) => {
        const active = card.getAttribute('data-avatar-card') === state.avatarType;
        card.className = active
            ? 'text-left rounded-2xl p-3 border-2 transition cursor-pointer flex flex-col justify-between gap-1 bg-blue-500/20 border-blue-400 shadow-lg shadow-blue-500/20'
            : 'text-left rounded-2xl p-3 border transition cursor-pointer flex flex-col justify-between gap-1 bg-gray-900/80 hover:bg-gray-800 border-gray-800 hover:border-gray-700';
    });
}

function setAvatarType(avatarType) {
    const validAvatars = ['aero_wyvern', 'fuchur', 'et_bike', 'delorean', 'mars_ufo', 'paramotor'];
    // Legacy saved value 'dragon' (removed avatar) and unknown values fall back to the Aero Wyvern
    const chosen = validAvatars.includes(avatarType) ? avatarType : 'aero_wyvern';
    state.avatarType = chosen;
    localStorage.setItem('loop_kicker_journey_avatar_type', chosen);

    const mainSel = document.getElementById('avatarSelect');
    if (mainSel) mainSel.value = chosen;
    syncAvatarCardsUI();

    if (dragon3D) {
        dragon3D.buildActiveAvatar(chosen);
        dragon3D.rebuildGhostModel();
    }
    updateLiveHud();
}

document.querySelectorAll('[data-avatar-card]').forEach((card) => {
    card.addEventListener('click', () => {
        setAvatarType(card.getAttribute('data-avatar-card'));
    });
});

const avatarSelectEl = document.getElementById('avatarSelect');
if (avatarSelectEl) {
    avatarSelectEl.addEventListener('change', (e) => {
        setAvatarType(e.target.value);
    });
}

function setSimAutoFollow(checked) {
    state.simAutoJitter = Boolean(checked);
    ['simAutoFollowCheck', 'gameSimAutoFollowCheck'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = state.simAutoJitter;
    });
    if (state.simAutoJitter && state.workout) {
        const targetW = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
        state.actualWatts = targetW;
        const slider = document.getElementById('simWattSlider');
        const readout = document.getElementById('simWattReadout');
        if (slider) slider.value = targetW;
        if (readout) readout.textContent = `${targetW} W`;
        syncZeroWattPauseState();
        updateLiveHud();
    }
}

function setSteeringEnabled(enabled) {
    state.steeringEnabled = Boolean(enabled);
    localStorage.setItem('loop_kicker_journey_steering_enabled', state.steeringEnabled ? 'true' : 'false');
    state.steerLeftPressed = false;
    state.steerRightPressed = false;
    state.mouseSteerInput = 0;

    const mainCheck = document.getElementById('steeringToggleCheck');
    const compactCheck = document.getElementById('compactSteeringToggleCheck');
    const mainLabel = document.getElementById('steeringToggleLabel');
    const compactLabel = document.getElementById('compactSteeringToggleLabel');
    if (mainCheck) mainCheck.checked = state.steeringEnabled;
    if (compactCheck) compactCheck.checked = state.steeringEnabled;
    if (mainLabel) mainLabel.textContent = state.steeringEnabled ? 'Steering: ON' : 'Steering: OFF (Auto-Fly Gates)';
    if (compactLabel) compactLabel.textContent = state.steeringEnabled ? 'Steering: ON' : 'Steering: OFF';

    if (!state.steeringEnabled) {
        state.dragonSteerOffsetX = 0;
        if (dragon3D) {
            const centerZ = dragon3D.flightZ || 0;
            dragon3D.dragonSteerOffsetX = 0;
            dragon3D.dragonHeadingVelocity = 0;
            dragon3D.dragonLateralVelocityX = 0;
            dragon3D.wallContactSide = 0;
            dragon3D.dragonWorldX = getSimulatedTurnOffsetX(centerZ);
            dragon3D.dragonHeadingAngle = Math.atan(-getSimulatedTurnDerivativeX(centerZ));
            state.dragonWorldX = dragon3D.dragonWorldX;
            state.dragonHeadingAngle = dragon3D.dragonHeadingAngle;
        }
    }
    updateLiveHud();
}

document.getElementById('steeringToggleCheck').addEventListener('change', (e) => {
    setSteeringEnabled(e.target.checked);
});

const compactSteeringToggleCheck = document.getElementById('compactSteeringToggleCheck');
if (compactSteeringToggleCheck) {
    compactSteeringToggleCheck.addEventListener('change', (e) => {
        setSteeringEnabled(e.target.checked);
    });
}

// Chrome keeps focus on clicked sliders/checkboxes (e.g. Dragon Power); only text fields should swallow game keys
const NON_TEXT_INPUT_TYPES = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file']);
function isTextEntryTarget(target) {
    if (!target || !target.tagName) return false;
    if (target.tagName === 'INPUT') return !NON_TEXT_INPUT_TYPES.has(target.type);
    return target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

// Spacebar handler to destroy incoming 3D obstacles with Dragon Fire & Left/Right keyboard bindings to steer the dragon
window.addEventListener('keydown', (e) => {
    if (isTextEntryTarget(e.target)) return;
    if (state.currentScreen === 'splash' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        soundEngine.init();
        setScreen('pairing');
        return;
    }
    if (state.currentScreen !== 'game') return;
    if (e.code === 'Space') {
        e.preventDefault();
        if (dragon3D) {
            dragon3D.triggerDragonFireBreath();
        }
    } else if (state.steeringEnabled && (e.code === 'ArrowLeft' || e.code === 'KeyA')) {
        e.preventDefault();
        state.steerLeftPressed = true;
    } else if (state.steeringEnabled && (e.code === 'ArrowRight' || e.code === 'KeyD')) {
        e.preventDefault();
        state.steerRightPressed = true;
    } else if (state.simMode && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        e.preventDefault();
        const slider = document.getElementById('simWattSlider');
        const step = (e.shiftKey ? 25 : 10) * (e.code === 'ArrowUp' ? 1 : -1);
        const min = parseInt(slider.min, 10) || 0;
        const max = parseInt(slider.max, 10) || 600;
        const newWatts = Math.max(min, Math.min(max, (state.actualWatts || 0) + step));
        setSimAutoFollow(false);
        state.actualWatts = newWatts;
        slider.value = newWatts;
        document.getElementById('simWattReadout').textContent = `${newWatts} W`;
        syncZeroWattPauseState();
        updateLiveHud();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        state.steerLeftPressed = false;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        state.steerRightPressed = false;
    }
});

window.addEventListener('blur', () => {
    state.steerLeftPressed = false;
    state.steerRightPressed = false;
    state.mouseSteerInput = 0;
});

// Mouse drag controls on the 3D arena:
// - Drag up/down adjusts simulated watts when Sim Mode is ON
// - Drag left/right steers when Steering is ON
(function initCanvasMouseDragControls() {
    const canvasContainer = document.getElementById('threeCanvasContainer');
    if (!canvasContainer) return;

    const WATTS_PER_PIXEL = 1.0;
    const WATT_DRAG_THRESHOLD_PX = 2;
    const STEER_DEADZONE_PX = 4;
    const STEER_FULL_RANGE_PX = 120;

    let activePointerId = null;
    let lastClientY = 0;
    let startClientY = 0;
    let wattsDragEngaged = false;
    let pendingWattsFloat = 0;
    let steerAnchorX = 0;

    function endDrag() {
        if (activePointerId === null) return;
        if (canvasContainer.hasPointerCapture && canvasContainer.hasPointerCapture(activePointerId)) {
            try {
                canvasContainer.releasePointerCapture(activePointerId);
            } catch (_) {}
        }
        activePointerId = null;
        wattsDragEngaged = false;
        state.mouseSteerInput = 0;
        canvasContainer.style.cursor = '';
    }

    canvasContainer.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (state.currentScreen !== 'game') return;
        if (!state.simMode && !state.steeringEnabled) return;

        activePointerId = e.pointerId;
        startClientY = e.clientY;
        lastClientY = e.clientY;
        wattsDragEngaged = false;
        pendingWattsFloat = Number(state.actualWatts) || 0;
        steerAnchorX = e.clientX;
        state.mouseSteerInput = 0;

        if (canvasContainer.setPointerCapture) {
            try {
                canvasContainer.setPointerCapture(activePointerId);
            } catch (_) {}
        }
        canvasContainer.style.cursor = 'grabbing';
        e.preventDefault();
    });

    window.addEventListener('pointermove', (e) => {
        if (activePointerId === null || e.pointerId !== activePointerId) return;
        if (state.currentScreen !== 'game') {
            endDrag();
            return;
        }

        if (state.simMode) {
            const dy = e.clientY - lastClientY;
            lastClientY = e.clientY;
            if (!wattsDragEngaged && Math.abs(e.clientY - startClientY) >= WATT_DRAG_THRESHOLD_PX) {
                wattsDragEngaged = true;
                pendingWattsFloat = Number(state.actualWatts) || 0;
                setSimAutoFollow(false);
            }
            if (wattsDragEngaged && dy !== 0) {
                const slider = document.getElementById('simWattSlider');
                const minW = slider ? (parseInt(slider.min, 10) || 0) : 0;
                const maxW = slider ? (parseInt(slider.max, 10) || 650) : 650;
                pendingWattsFloat = Math.max(minW, Math.min(maxW, pendingWattsFloat - dy * WATTS_PER_PIXEL));
                const nextWatts = Math.round(pendingWattsFloat);
                if (nextWatts !== state.actualWatts) {
                    state.actualWatts = nextWatts;
                    if (slider) slider.value = nextWatts;
                    const readout = document.getElementById('simWattReadout');
                    if (readout) readout.textContent = `${nextWatts} W`;
                    syncZeroWattPauseState();
                    updateLiveHud();
                }
            }
        }

        if (state.steeringEnabled) {
            let dx = e.clientX - steerAnchorX;
            if (Math.abs(dx) > STEER_FULL_RANGE_PX) {
                steerAnchorX = e.clientX - Math.sign(dx) * STEER_FULL_RANGE_PX;
                dx = e.clientX - steerAnchorX;
            }
            if (Math.abs(dx) <= STEER_DEADZONE_PX) {
                state.mouseSteerInput = 0;
            } else {
                const effectiveDx = Math.sign(dx) * (Math.abs(dx) - STEER_DEADZONE_PX);
                state.mouseSteerInput = Math.max(-1, Math.min(1, effectiveDx / (STEER_FULL_RANGE_PX - STEER_DEADZONE_PX)));
            }
        } else {
            state.mouseSteerInput = 0;
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (activePointerId !== null && e.pointerId === activePointerId) {
            endDrag();
        }
    });

    window.addEventListener('pointercancel', (e) => {
        if (activePointerId !== null && e.pointerId === activePointerId) {
            endDrag();
        }
    });

    window.addEventListener('blur', endDrag);
})();

function isBlePairingCancelledError(err) {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    return err.name === 'NotFoundError' ||
        err.name === 'AbortError' ||
        msg.includes('user cancelled') ||
        msg.includes('user canceled') ||
        msg.includes('requestdevice() chooser');
}

const BLE_KNOWN_DEVICES_STORAGE_KEY = 'loop_kicker_journey_ble_known_devices';
const bleRoles = {
    trainer: {
        sensor: bleTrainer, buttonId: 'connectBleBtn', idleLabel: 'Connect device',
        errorMsg: 'Could not connect to Wahoo KICKR via Bluetooth.',
        afterConnect: () => { if (state.simMode) toggleSimMode(false); }
    },
    rower: {
        sensor: bleRower, buttonId: 'connectRowerBleBtn', idleLabel: 'Connect Concept2',
        errorMsg: 'Could not connect to Concept2 PM5 via Bluetooth.',
        afterConnect: () => { if (state.simMode) toggleSimMode(false); }
    },
    hrm: {
        sensor: bleHrmSensor, buttonId: 'connectHrmBleBtn', idleLabel: 'Pair',
        errorMsg: 'Could not connect to BLE Heart Rate Monitor.'
    },
    aria: {
        sensor: bleEliteAriaFan, buttonId: 'connectAriaBleBtn', idleLabel: 'Pair',
        errorMsg: 'Could not connect to Elite Aria via Bluetooth.',
        afterConnect: () => bleEliteAriaFan.setHeartRate(bleHrmSensor.connected ? state.heartRate : null)
    },
    cadence: {
        sensor: bleCadenceSensor, buttonId: 'connectCadenceBleBtn', idleLabel: 'Pair',
        errorMsg: 'Could not connect to BLE Cadence Sensor.'
    },
    steer: {
        sensor: bleSteeringSensor, buttonId: 'connectSteerBleBtn', idleLabel: 'Pair',
        errorMsg: 'Could not connect to Elite Sterzo / Rizer steering device.',
        afterConnect: () => { if (!state.steeringEnabled) setSteeringEnabled(true); }
    }
};

function loadKnownBleDeviceIds() {
    try {
        return JSON.parse(localStorage.getItem(BLE_KNOWN_DEVICES_STORAGE_KEY)) || {};
    } catch (_) {
        return {};
    }
}

function saveKnownBleDevice(role, device) {
    const known = loadKnownBleDeviceIds();
    known[role] = { id: device.id, name: device.name || null };
    localStorage.setItem(BLE_KNOWN_DEVICES_STORAGE_KEY, JSON.stringify(known));
}

const bleRolesConnecting = new Set();
const bleAutoReconnectDevices = new Map();
const BLE_AUTO_RECONNECT_INTERVAL_MS = 8000;

async function connectBleRole(role, knownDevice = null) {
    const cfg = bleRoles[role];
    if (knownDevice && (cfg.sensor.connected || bleRolesConnecting.has(role))) return;
    bleRolesConnecting.add(role);
    try {
        if (knownDevice && !knownDevice.gatt.connected) {
            cfg.sensor.onStatus('connecting', `Connecting ${knownDevice.name || cfg.idleLabel}...`);
            try {
                await knownDevice.gatt.connect();
            } catch (err) {
                console.debug(`[BLE auto-connect] ${role}: ${knownDevice.name || knownDevice.id} not reachable yet`, err);
                cfg.sensor.onStatus('disconnected', cfg.idleLabel);
                return;
            }
        }
        await cfg.sensor.connect(knownDevice);
        if (cfg.sensor.device) {
            saveKnownBleDevice(role, cfg.sensor.device);
            enableBleAutoReconnect(role, cfg.sensor.device);
        }
        if (cfg.afterConnect) await cfg.afterConnect();
        if (knownDevice) console.info(`[BLE auto-connect] ${role}: connected to ${knownDevice.name || knownDevice.id}`);
    } catch (err) {
        if (!knownDevice && !isBlePairingCancelledError(err)) {
            alert(err.message || cfg.errorMsg);
        }
        if (knownDevice) console.warn(`[BLE auto-connect] ${role}: setup of ${knownDevice.name || knownDevice.id} failed`, err);
        cfg.sensor.onStatus('disconnected', cfg.idleLabel);
    } finally {
        bleRolesConnecting.delete(role);
    }
}

// Retries a permitted device whenever it advertises, and on a timer in case advertisement events never fire
function enableBleAutoReconnect(role, device) {
    const previous = bleAutoReconnectDevices.get(role);
    bleAutoReconnectDevices.set(role, device);
    if (previous === device) return;

    const tryConnect = () => {
        if (bleAutoReconnectDevices.get(role) !== device) return;
        if (!bleRoles[role].sensor.connected) connectBleRole(role, device);
    };
    device.addEventListener('advertisementreceived', tryConnect);
    if (typeof device.watchAdvertisements === 'function' && !device.watchingAdvertisements) {
        device.watchAdvertisements().catch((err) => {
            console.debug(`[BLE auto-connect] ${role}: watchAdvertisements unavailable, using retry timer`, err);
        });
    }
    const timerId = setInterval(() => {
        if (bleAutoReconnectDevices.get(role) !== device) {
            clearInterval(timerId);
            return;
        }
        tryConnect();
    }, BLE_AUTO_RECONNECT_INTERVAL_MS);
    if (!device.gatt.connected) tryConnect();
}

async function autoConnectKnownBleDevices() {
    if (!navigator.bluetooth) return;
    if (typeof navigator.bluetooth.getDevices !== 'function') {
        console.info('[BLE auto-connect] navigator.bluetooth.getDevices() is not available. Enable chrome://flags/#enable-web-bluetooth-new-permissions-backend (on by default from Chrome 169).');
        return;
    }
    const known = loadKnownBleDeviceIds();
    let devices = [];
    try {
        devices = await navigator.bluetooth.getDevices();
    } catch (err) {
        console.warn('[BLE auto-connect] getDevices() failed', err);
        return;
    }
    console.info(`[BLE auto-connect] ${devices.length} permitted device(s):`, devices.map((d) => d.name || d.id));
    const claimed = new Set();
    for (const [role, saved] of Object.entries(known)) {
        if (!bleRoles[role] || !saved) continue;
        const savedId = typeof saved === 'string' ? saved : saved.id;
        const savedName = typeof saved === 'string' ? null : saved.name;
        // Device IDs can change across sessions, so fall back to matching by advertised name
        const device = devices.find((d) => d.id === savedId)
            || (savedName ? devices.find((d) => d.name === savedName && !claimed.has(d)) : null);
        if (!device) continue;
        claimed.add(device);
        enableBleAutoReconnect(role, device);
    }
}

Object.entries(bleRoles).forEach(([role, cfg]) => {
    document.getElementById(cfg.buttonId).addEventListener('click', () => connectBleRole(role));
});

autoConnectKnownBleDevices();

function getDefaultPhoneControllerBaseUrl() {
    const saved = localStorage.getItem('loop_kicker_journey_phone_base_url');
    if (saved) return saved;
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
}

function renderPhoneSteerQrCode(peerId) {
    const qrContainer = document.getElementById('phoneSteerQrContainer');
    const baseInput = document.getElementById('phoneSteerBaseUrlInput');
    const warningEl = document.getElementById('phoneSteerLocalWarning');
    if (!qrContainer || !peerId) return;

    const rawBase = (baseInput && baseInput.value.trim()) ? baseInput.value.trim() : getDefaultPhoneControllerBaseUrl();
    let targetUrlStr = rawBase;
    try {
        const u = new URL(rawBase);
        u.searchParams.set('phone-steer', peerId);
        targetUrlStr = u.toString();
        const isLocal = u.protocol === 'file:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        if (warningEl) warningEl.classList.toggle('hidden', !isLocal);
    } catch (_) {
        const sep = rawBase.includes('?') ? '&' : '?';
        targetUrlStr = `${rawBase}${sep}phone-steer=${encodeURIComponent(peerId)}`;
        if (warningEl) warningEl.classList.remove('hidden');
    }

    if (typeof qrcode === 'function') {
        const qr = qrcode(0, 'M');
        qr.addData(targetUrlStr);
        qr.make();
        qrContainer.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
        const svgEl = qrContainer.querySelector('svg');
        if (svgEl) {
            svgEl.setAttribute('width', '196');
            svgEl.setAttribute('height', '196');
        }
    } else {
        qrContainer.innerHTML = `<a href="${targetUrlStr}" target="_blank" class="text-xs text-blue-600 underline break-all p-2">${targetUrlStr}</a>`;
    }
}

function closePhoneSteerModal() {
    const modal = document.getElementById('phoneSteerModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

document.getElementById('connectPhoneSteerBtn').addEventListener('click', async () => {
    const modal = document.getElementById('phoneSteerModal');
    const baseInput = document.getElementById('phoneSteerBaseUrlInput');
    if (baseInput && !baseInput.value) {
        baseInput.value = getDefaultPhoneControllerBaseUrl();
    }
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    try {
        const peerId = await phoneSteeringSensor.ensureHostPeer();
        renderPhoneSteerQrCode(peerId);
    } catch (err) {
        phoneSteeringSensor.onStatus('error', 'Phone steering unavailable');
        const qrContainer = document.getElementById('phoneSteerQrContainer');
        if (qrContainer) {
            qrContainer.innerHTML = `<span class="text-xs text-blue-500 font-bold p-2">${err.message || 'Could not start WebRTC peer.'}</span>`;
        }
    }
});

document.getElementById('phoneSteerBaseUrlInput').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
        localStorage.setItem('loop_kicker_journey_phone_base_url', val);
    }
    if (phoneSteeringSensor.peerId) {
        renderPhoneSteerQrCode(phoneSteeringSensor.peerId);
    }
});

document.getElementById('closePhoneSteerModalBtn').addEventListener('click', closePhoneSteerModal);
document.getElementById('phoneSteerDoneBtn').addEventListener('click', closePhoneSteerModal);
document.getElementById('phoneSteerModal').addEventListener('click', (e) => {
    if (e.target.id === 'phoneSteerModal') closePhoneSteerModal();
});

document.getElementById('phoneSteerRecenterDesktopBtn').addEventListener('click', () => {
    phoneSteeringSensor.recenter();
});

document.getElementById('phoneSteerDisconnectBtn').addEventListener('click', () => {
    phoneSteeringSensor.disconnect();
    const qrContainer = document.getElementById('phoneSteerQrContainer');
    if (qrContainer) {
        qrContainer.innerHTML = '<span class="text-xs text-gray-500 font-semibold p-4">Disconnected. Re-open Phone Steer (QR) to generate a new pairing code.</span>';
    }
});

function regenerateSessionWindProfile() {
    if (state.workout) {
        state.gradientProfile = buildSessionGradientProfile();
    }
    syncGradientAtSecond(state.elapsedSec);
    if (state.simMode && state.simAutoJitter) {
        const targetW = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
        state.actualWatts = targetW;
        document.getElementById('simWattSlider').value = targetW;
        document.getElementById('simWattReadout').textContent = `${targetW} W`;
    }
    if (dragon3D) {
        dragon3D.refreshCanyonElevationProfile();
    }
    if (bleTrainer.connected) {
        if (state.resistanceMode === 'erg') {
            const targetW = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
            bleTrainer.setErgTargetWatts(targetW);
        } else {
            bleTrainer.setSimulationGrade(state.currentGradientPct);
        }
    }
    updateLiveHud();
}

const ergLockCheckEl = document.getElementById('ergLockCheck');
if (ergLockCheckEl) {
    ergLockCheckEl.checked = state.resistanceMode === 'erg';
    ergLockCheckEl.addEventListener('change', (e) => {
        if (state.ghost && state.ghost.resistanceMode !== null) {
            e.target.checked = state.ghost.resistanceMode === 'erg';
            return;
        }
        state.resistanceMode = e.target.checked ? 'erg' : 'hilly';
        regenerateSessionWindProfile();
    });
}

document.getElementById('simToggleBtn').addEventListener('click', () => toggleSimMode());

document.getElementById('simWattSlider').addEventListener('input', (e) => {
    setSimAutoFollow(false);
    state.actualWatts = parseInt(e.target.value, 10) || 0;
    document.getElementById('simWattReadout').textContent = `${state.actualWatts} W`;
    syncZeroWattPauseState();
    updateLiveHud();
});

document.getElementById('simSnapTargetBtn').addEventListener('click', () => {
    const targetW = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
    state.actualWatts = targetW;
    document.getElementById('simWattSlider').value = targetW;
    document.getElementById('simWattReadout').textContent = `${targetW} W`;
    syncZeroWattPauseState();
    updateLiveHud();
});

['simAutoFollowCheck', 'gameSimAutoFollowCheck'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', (e) => {
            setSimAutoFollow(e.target.checked);
        });
    }
});

function syncSoundButtonsUI() {
    ['soundOnIcon', 'wizardSoundOnIcon'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !soundEngine.enabled);
    });
    ['soundOffIcon', 'wizardSoundOffIcon'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', soundEngine.enabled);
    });
    ['musicToggleBtn', 'wizardMusicToggleBtn'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = !soundEngine.enabled;
    });
}

function handleSoundToggle() {
    soundEngine.enabled = !soundEngine.enabled;
    syncSoundButtonsUI();
    if (soundEngine.enabled) soundEngine.init();
    // Muting sound also silences music; the saved music preference is restored on unmute.
    applyMusicEnabled(localStorage.getItem('loop_kicker_journey_music_enabled') !== 'false', false);
}

['soundToggleBtn', 'wizardSoundToggleBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handleSoundToggle);
});

function applyMusicEnabled(enabled, persist = true) {
    if (persist) localStorage.setItem('loop_kicker_journey_music_enabled', String(enabled));
    const active = enabled && soundEngine.enabled;
    musicEngine.setEnabled(active);
    ['musicOnIcon', 'wizardMusicOnIcon'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !active);
    });
    ['musicOffIcon', 'wizardMusicOffIcon'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', active);
    });
}

function handleMusicToggle() {
    if (!soundEngine.enabled) return;
    soundEngine.init();
    applyMusicEnabled(!musicEngine.enabled);
}

['musicToggleBtn', 'wizardMusicToggleBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handleMusicToggle);
});

document.querySelectorAll('[data-duration-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
        state.durationFilter = btn.getAttribute('data-duration-filter') || 'all';
        renderPresetWorkoutCards();
    });
});

document.querySelectorAll('[data-intensity-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
        state.intensityFilter = btn.getAttribute('data-intensity-filter') || 'all';
        renderPresetWorkoutCards();
    });
});

document.getElementById('zwoFileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            loadWorkoutFromXml(ev.target.result, null);
        } catch (err) {
            alert('Failed to parse Zwift workout file: ' + err.message);
        }
    };
    reader.readAsText(file);
});

document.getElementById('clearGhostBtn').addEventListener('click', clearGhostRide);
document.getElementById('summaryRideSaveSection').addEventListener('submit', (e) => {
    e.preventDefault();
    saveRideToServer();
});

function updateScreenshotButtonsUI(justCaptured = false) {
    const hasScreenshot = Boolean(state.preparedScreenshotDataUrl);
    const mainText = document.getElementById('screenshotBtnText');
    const compactText = document.getElementById('compactScreenshotBtnText');
    const label = justCaptured ? 'Saved!' : (hasScreenshot ? 'Screenshot Ready' : 'Screenshot');
    if (mainText) mainText.textContent = label;
    if (compactText) compactText.textContent = label;
}

function syncSummaryScreenshotDialogUI() {
    const sectionEl = document.getElementById('summaryScreenshotSection');
    const previewEl = document.getElementById('summaryScreenshotPreview');
    const timestampEl = document.getElementById('summaryScreenshotTimestamp');
    const downloadBtnEl = document.getElementById('downloadScreenshotBtn');
    const hasScreenshot = Boolean(state.preparedScreenshotDataUrl);

    if (sectionEl) sectionEl.classList.toggle('hidden', !hasScreenshot);
    if (downloadBtnEl) downloadBtnEl.classList.toggle('hidden', !hasScreenshot);
    if (hasScreenshot) {
        if (previewEl) previewEl.src = state.preparedScreenshotDataUrl;
        if (timestampEl) timestampEl.textContent = state.preparedScreenshotTimestamp || '';
    } else {
        if (previewEl) previewEl.removeAttribute('src');
        if (timestampEl) timestampEl.textContent = '';
    }
}

function drawBottomTimelineOverlayOnScreenshot(ctx, width, height, pxRatio) {
    if (!state.workout) return;
    const s = Math.max(0.75, pxRatio || 1);
    const outerMargin = Math.round(14 * s);
    const panelW = Math.min(Math.round(1600 * s), Math.max(Math.round(280 * s), width - outerMargin * 2));
    const panelX = Math.round((width - panelW) / 2);
    const padX = Math.round(14 * s);
    const padY = Math.round(8 * s);
    const headerH = Math.round(20 * s);
    const headerGap = Math.round(6 * s);
    const chartCssH = Math.min(92, Math.max(68, Math.round((height / s) * 0.10)));
    const chartH = Math.round(chartCssH * s);
    const panelH = padY * 2 + headerH + headerGap + chartH;
    const panelY = height - outerMargin - panelH;
    if (panelY < Math.round(90 * s)) return;

    ctx.save();
    // Outer translucent rounded panel (matches bg-gray-950/70 border-gray-800/80 rounded-2xl)
    ctx.fillStyle = 'rgba(3, 7, 18, 0.74)';
    ctx.strokeStyle = 'rgba(31, 41, 55, 0.85)';
    ctx.lineWidth = Math.max(1, 1 * s);
    drawRoundedRectPath(ctx, panelX, panelY, panelW, panelH, Math.round(16 * s));
    ctx.fill();
    ctx.stroke();

    // Header bar: Workout Title + Resistance Pill + Legend
    const headerCenterY = panelY + padY + headerH / 2;
    let curX = panelX + padX;
    const titleText = ((state.workout && state.workout.name) ? state.workout.name : 'Loop Kicker Journey Flight').toUpperCase();
    ctx.font = `800 ${Math.round(12 * s)}px sans-serif`;
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const maxTitleW = Math.max(Math.round(90 * s), panelW * 0.34);
    let displayTitle = titleText;
    if (ctx.measureText(displayTitle).width > maxTitleW) {
        const ellipsis = '…';
        const chars = Array.from(displayTitle);
        while (chars.length > 0 && ctx.measureText(chars.join('') + ellipsis).width > maxTitleW) {
            chars.pop();
        }
        displayTitle = chars.join('').trimEnd() + ellipsis;
    }
    ctx.fillText(displayTitle, curX, headerCenterY);
    curX += Math.ceil(ctx.measureText(displayTitle).width) + Math.round(10 * s);

    // Resistance Mode & Slope / ERG Pill
    const shortModeLabels = {
        hilly: 'Hilly',
        erg: 'ERG Lock'
    };
    const modeLabel = shortModeLabels[state.resistanceMode] || 'Hilly';
    const targetWatts = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
    const gradSign = state.currentGradientPct > 0 ? '+' : '';
    const targetGradSign = state.targetGradientPct > 0 ? '+' : '';
    const valLabel = state.resistanceMode === 'erg'
        ? `${targetWatts}W`
        : `${gradSign}${state.currentGradientPct.toFixed(1)}%`;
    const targetLabel = state.resistanceMode === 'erg'
        ? `ERG Lock: ${targetWatts}W`
        : `Target Slope: ${targetGradSign}${state.targetGradientPct.toFixed(1)}%`;

    const showTargetText = panelW >= Math.round(560 * s);
    const pillPadX = Math.round(9 * s);
    const pillGap = Math.round(7 * s);
    const pillH = Math.round(20 * s);

    ctx.font = `900 ${Math.round(10 * s)}px sans-serif`;
    const modeW = Math.ceil(ctx.measureText(modeLabel).width);
    ctx.font = `900 ${Math.round(11 * s)}px monospace`;
    const valW = Math.ceil(ctx.measureText(valLabel).width);
    ctx.font = `500 ${Math.round(10 * s)}px monospace`;
    const targetW = showTargetText ? Math.ceil(ctx.measureText(targetLabel).width) : 0;

    const pillW = pillPadX * 2 + modeW + pillGap + valW + (showTargetText ? pillGap + targetW : 0);
    if (curX + pillW <= panelX + panelW - padX) {
        const pillY = headerCenterY - pillH / 2;
        ctx.fillStyle = 'rgba(17, 24, 39, 0.90)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
        ctx.lineWidth = Math.max(1, 1 * s);
        drawRoundedRectPath(ctx, curX, pillY, pillW, pillH, Math.round(8 * s));
        ctx.fill();
        ctx.stroke();

        let px = curX + pillPadX;
        ctx.font = `900 ${Math.round(10 * s)}px sans-serif`;
        ctx.fillStyle = '#fcd34d';
        ctx.fillText(modeLabel, px, headerCenterY);
        px += modeW + pillGap;

        ctx.font = `900 ${Math.round(11 * s)}px monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(valLabel, px, headerCenterY);
        px += valW + pillGap;

        if (showTargetText) {
            ctx.font = `500 ${Math.round(10 * s)}px monospace`;
            ctx.fillStyle = '#9ca3af';
            ctx.fillText(targetLabel, px, headerCenterY);
        }
        curX += pillW + Math.round(12 * s);
    }

    // Right-side Zone & Trace Legend (on medium/wide viewports)
    if (panelW >= Math.round(760 * s)) {
        const zones = [
            { label: 'Z1', color: '#9ca3af' },
            { label: 'Z2', color: '#3b82f6' },
            { label: 'Z3', color: '#10b981' },
            { label: 'Z4', color: '#fbbf24' },
            { label: 'Z5', color: '#f97316' },
            { label: 'Z6', color: '#ef4444' }
        ];
        const dotSize = Math.round(7 * s);
        const itemGap = Math.round(9 * s);
        const lineSampleW = Math.round(11 * s);
        ctx.font = `600 ${Math.round(10 * s)}px sans-serif`;
        let legendW = 0;
        zones.forEach((z) => {
            legendW += dotSize + Math.round(4 * s) + Math.ceil(ctx.measureText(z.label).width) + itemGap;
        });
        ctx.font = `700 ${Math.round(10 * s)}px sans-serif`;
        const windText = 'Canyon Elevation';
        const wattsText = 'Dragon Watts';
        const windW = lineSampleW + Math.round(4 * s) + Math.ceil(ctx.measureText(windText).width);
        const dragonW = lineSampleW + Math.round(4 * s) + Math.ceil(ctx.measureText(wattsText).width);
        legendW += Math.round(4 * s) + windW + itemGap + dragonW;

        const legendStartX = panelX + panelW - padX - legendW;
        if (legendStartX > curX) {
            let lx = legendStartX;
            ctx.font = `600 ${Math.round(10 * s)}px sans-serif`;
            zones.forEach((z) => {
                ctx.fillStyle = z.color;
                drawRoundedRectPath(ctx, lx, headerCenterY - dotSize / 2, dotSize, dotSize, Math.round(2 * s));
                ctx.fill();
                lx += dotSize + Math.round(4 * s);
                ctx.fillStyle = z.color;
                ctx.fillText(z.label, lx, headerCenterY);
                lx += Math.ceil(ctx.measureText(z.label).width) + itemGap;
            });

            lx += Math.round(4 * s);
            ctx.font = `700 ${Math.round(10 * s)}px sans-serif`;
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(lx, headerCenterY - Math.max(1, Math.round(1 * s)), lineSampleW, Math.max(2, Math.round(2 * s)));
            lx += lineSampleW + Math.round(4 * s);
            ctx.fillStyle = '#fcd34d';
            ctx.fillText(windText, lx, headerCenterY);
            lx += Math.ceil(ctx.measureText(windText).width) + itemGap;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(lx, headerCenterY - Math.max(1, Math.round(1 * s)), lineSampleW, Math.max(2, Math.round(2 * s)));
            lx += lineSampleW + Math.round(4 * s);
            ctx.fillText(wattsText, lx, headerCenterY);
        }
    }

    // Inner Timeline Plot Container (matches bg-gray-950/85 border-gray-800/90 rounded-xl)
    const chartX = panelX + padX;
    const chartY = panelY + padY + headerH + headerGap;
    const chartW = panelW - padX * 2;
    const chartRadius = Math.round(12 * s);

    ctx.save();
    drawRoundedRectPath(ctx, chartX, chartY, chartW, chartH, chartRadius);
    ctx.fillStyle = 'rgba(3, 7, 18, 0.86)';
    ctx.fill();
    ctx.clip();
    renderWorkoutTimelinePlot(ctx, chartX, chartY, chartW, chartH, s);
    ctx.restore();

    ctx.strokeStyle = 'rgba(31, 41, 55, 0.92)';
    ctx.lineWidth = Math.max(1, 1 * s);
    drawRoundedRectPath(ctx, chartX, chartY, chartW, chartH, chartRadius);
    ctx.stroke();

    ctx.restore();
}

function prepareWorkoutScreenshot() {
    const outCanvas = document.createElement('canvas');
    const webglCanvas = dragon3D && dragon3D.renderer && dragon3D.renderer.domElement
        ? dragon3D.renderer.domElement
        : null;

    if (dragon3D && dragon3D.initialized && dragon3D.renderer && dragon3D.scene && dragon3D.camera) {
        dragon3D.renderer.render(dragon3D.scene, dragon3D.camera);
    }

    const width = webglCanvas ? (webglCanvas.width || window.innerWidth || 1280) : (window.innerWidth || 1280);
    const height = webglCanvas ? (webglCanvas.height || window.innerHeight || 720) : (window.innerHeight || 720);
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext('2d');

    if (webglCanvas) {
        ctx.drawImage(webglCanvas, 0, 0, width, height);
    } else {
        ctx.fillStyle = '#091526';
        ctx.fillRect(0, 0, width, height);
    }

    const fxCanvas = document.getElementById('fxCanvas');
    if (fxCanvas && fxCanvas.width > 0 && fxCanvas.height > 0) {
        ctx.drawImage(fxCanvas, 0, 0, width, height);
    }

    // Draw HUD overlay badge onto the screenshot
    const workoutName = (state.workout && state.workout.name) ? state.workout.name : 'Loop Kicker Journey Flight';
    const scoreStr = formatSwissNumber(state.totalScore);
    const wattsStr = `${formatSwissNumber(state.actualWatts)} W`;

    const scale = Math.max(1, width / 1280);
    const pad = Math.round(20 * scale);
    const boxW = Math.round(290 * scale);
    const boxH = Math.round(68 * scale);
    const boxX = width - boxW - pad;
    const boxY = pad;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 7, 18, 0.86)';
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    drawRoundedRectPath(ctx, boxX, boxY, boxW, boxH, Math.round(14 * scale));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#93c5fd';
    ctx.font = `900 ${Math.round(13 * scale)}px sans-serif`;
    const textPadX = Math.round(14 * scale);
    const maxTitleWidth = boxW - textPadX * 2;
    let croppedWorkoutName = workoutName;
    if (ctx.measureText(croppedWorkoutName).width > maxTitleWidth) {
        const ellipsis = '…';
        let chars = Array.from(croppedWorkoutName);
        while (chars.length > 0 && ctx.measureText(chars.join('') + ellipsis).width > maxTitleWidth) {
            chars.pop();
        }
        croppedWorkoutName = chars.join('').trimEnd() + ellipsis;
    }
    ctx.fillText(croppedWorkoutName, boxX + textPadX, boxY + Math.round(24 * scale));

    ctx.fillStyle = '#60a5fa';
    ctx.font = `900 ${Math.round(22 * scale)}px monospace`;
    ctx.fillText(`POINTS: ${scoreStr}`, boxX + Math.round(14 * scale), boxY + Math.round(52 * scale));
    ctx.restore();

    // Draw the Compact Translucent Bottom Timeline Overlay onto the screenshot
    const pxRatio = (webglCanvas && window.innerWidth > 0)
        ? (width / window.innerWidth)
        : Math.max(1, width / 1280);
    drawBottomTimelineOverlayOnScreenshot(ctx, width, height, pxRatio);

    state.preparedScreenshotDataUrl = outCanvas.toDataURL('image/png');
    state.preparedScreenshotTimestamp = `Captured at ${formatDuration(state.elapsedSec)} • ${wattsStr} • ${scoreStr} pts`;
    updateScreenshotButtonsUI(true);
    syncSummaryScreenshotDialogUI();
    setTimeout(() => updateScreenshotButtonsUI(false), 1800);
}

document.getElementById('screenshotBtn').addEventListener('click', prepareWorkoutScreenshot);
const compactScreenshotBtnEl = document.getElementById('compactScreenshotBtn');
if (compactScreenshotBtnEl) {
    compactScreenshotBtnEl.addEventListener('click', prepareWorkoutScreenshot);
}

document.getElementById('downloadScreenshotBtn').addEventListener('click', () => {
    if (!state.preparedScreenshotDataUrl) return;
    const workoutTitle = (state.lastSummary && state.lastSummary.workoutName)
        || (state.workout && state.workout.name)
        || 'loop_kicker_journey_training';
    const safeName = workoutTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = state.preparedScreenshotDataUrl;
    a.download = `${safeName}_screenshot_${dateStr}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
});

document.getElementById('finishWorkoutBtn').addEventListener('click', () => {
    if (!state.preparedScreenshotDataUrl) {
        prepareWorkoutScreenshot();
    }
    finishWorkoutAndShowSummary();
});
const compactFinishWorkoutBtnEl = document.getElementById('compactFinishWorkoutBtn');
if (compactFinishWorkoutBtnEl) {
    compactFinishWorkoutBtnEl.addEventListener('click', () => {
        if (!state.preparedScreenshotDataUrl) {
            prepareWorkoutScreenshot();
        }
        finishWorkoutAndShowSummary();
    });
}

document.getElementById('compactShowSettingsBtn').addEventListener('click', () => {
    pauseFlight();
    setScreen('pairing');
});

// Screen Wizard Navigation Event Listeners
document.getElementById('splashStartBtn').addEventListener('click', () => {
    soundEngine.init();
    setScreen('pairing');
});
document.getElementById('wizardReturnToGameBtn').addEventListener('click', () => {
    setScreen('game');
});
document.querySelectorAll('[data-step-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
        setScreen(btn.getAttribute('data-step-nav'));
    });
});
document.getElementById('toTrainingScreenBtn').addEventListener('click', () => {
    setScreen('training');
});
document.getElementById('backToPairingBtn').addEventListener('click', () => {
    setScreen('pairing');
});
document.getElementById('toAvatarScreenBtn').addEventListener('click', () => {
    setScreen('avatar');
});
document.getElementById('backToTrainingBtn').addEventListener('click', () => {
    setScreen('training');
});
document.getElementById('avatarStartFlightBtn').addEventListener('click', () => {
    setScreen('game');
});

document.getElementById('timelineCanvas').addEventListener('click', (e) => {
    if (!state.workout) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const padLeft = 44;
    const padRight = 40;
    const plotW = rect.width - padLeft - padRight;
    const clickX = e.clientX - rect.left - padLeft;
    if (clickX >= 0 && clickX <= plotW) {
        const targetSec = Math.floor((clickX / plotW) * state.workout.totalDuration);
        state.elapsedSec = Math.max(0, Math.min(state.workout.totalDuration - 1, targetSec));
        syncGradientAtSecond(state.elapsedSec);
        if (state.simMode && state.simAutoJitter) {
            const targetW = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
            state.actualWatts = targetW;
            document.getElementById('simWattSlider').value = targetW;
            document.getElementById('simWattReadout').textContent = `${targetW} W`;
        }
        if (dragon3D) {
            dragon3D.seedInitialGatesAndObstacles(true);
        }
        updateLiveHud();
    }
});

document.getElementById('downloadFitBtn').addEventListener('click', () => {
    if (!state.lastSummary) return;
    const fitBytes = buildTrainingFitFile(state.lastSummary, state.samples);
    const blob = new Blob([fitBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (state.lastSummary.workoutName || 'loop_kicker_journey_training')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${safeName}_${dateStr}.fit`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
});

function closeSummaryAndGoTo(targetScreen) {
    resetWorkoutSession();
    setScreen(targetScreen);
}

document.getElementById('summaryPairingBtn').addEventListener('click', () => {
    closeSummaryAndGoTo('pairing');
});
document.getElementById('summaryChangeTrainingBtn').addEventListener('click', () => {
    closeSummaryAndGoTo('training');
});
document.getElementById('summaryFlyAgainBtn').addEventListener('click', () => {
    resetWorkoutSession();
    setScreen('game');
});

// Initialize stored FTP, default workout, Three.js 3D Dragon Engine, 1Hz game loop & 60fps render loop
(function initLoopKickerJourneyApp() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('phone-steer') || urlParams.has('steer')) {
        return;
    }
    if (localStorage.getItem('loop_kicker_journey_phone_host_peer_id')) {
        phoneSteeringSensor.ensureHostPeer().catch(() => {});
    }
    const savedAvatar = localStorage.getItem('loop_kicker_journey_avatar_type');
    if (savedAvatar) {
        setAvatarType(savedAvatar);
    } else {
        setAvatarType('aero_wyvern');
    }
    const savedFtp = parseInt(localStorage.getItem('loop_kicker_journey_ftp'), 10);
    if (!isNaN(savedFtp) && savedFtp >= 50 && savedFtp <= 600) {
        state.ftp = savedFtp;
        document.getElementById('ftpInput').value = savedFtp;
    }
    const savedSteering = localStorage.getItem('loop_kicker_journey_steering_enabled');
    syncSoundButtonsUI();
    applyMusicEnabled(localStorage.getItem('loop_kicker_journey_music_enabled') !== 'false');
    if (savedSteering === 'false') {
        setSteeringEnabled(false);
    } else {
        setSteeringEnabled(true);
    }
    loadWorkoutFromXml(PRESET_WORKOUTS.kickr_arcade, 'kickr_arcade');
    toggleSimMode(true);
    setScreen('splash');

    dragon3D = new DragonSky3DEngine(document.getElementById('threeCanvasContainer'));

    restartWorkoutTickInterval();

    let lastFrameTime = performance.now();
    function renderLoop(now) {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
        lastFrameTime = now;
        if (dragon3D) {
            dragon3D.update(dt);
        }
        fxEngine.updateAndDraw();
        const ringWatts = (dragon3D && dragon3D.getUpcomingGateTargetWatts())
            ?? getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
        musicEngine.update(ringWatts, state.ftp, state.isRunning);
        requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
    window.addEventListener('resize', () => updateLiveHud());
})();
