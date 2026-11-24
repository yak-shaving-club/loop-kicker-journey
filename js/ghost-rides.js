// =========================================================================
// GHOST RIDES: save a finished ride and race against it later
// =========================================================================
const GHOST_FILE_FORMAT = 'loop-kicker-journey-ghost';
const GHOST_FILE_VERSION = 2;
// Version 1 samples also stored cumulative distance: [workoutSecond, watts, distanceMeters, score]
const GHOST_LEGACY_FILE_VERSION = 1;
const GHOST_MAX_SECONDS = 6 * 3600;
const GHOST_RESISTANCE_MODES = new Set(['easy', 'medium', 'difficult', 'erg']);
// Only these modes generate a random wind course; easy/erg are always flat
const GHOST_WIND_COURSE_MODES = new Set(['medium', 'difficult']);

// Identifies the selected workout for highscores: the preset key, or a hash of a custom .zwo workout
function getWorkoutKey() {
    if (state.selectedPresetKey && PRESET_WORKOUTS[state.selectedPresetKey] === state.workoutXml) {
        return state.selectedPresetKey;
    }
    let hash = 0x811c9dc5;
    for (let i = 0; i < state.workoutXml.length; i++) {
        hash = Math.imul(hash ^ state.workoutXml.charCodeAt(i), 0x01000193);
    }
    return `zwo-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildGhostRideFile() {
    return {
        format: GHOST_FILE_FORMAT,
        version: GHOST_FILE_VERSION,
        recordedAt: new Date(state.lastSummary.startTimeMs || Date.now()).toISOString(),
        workoutKey: getWorkoutKey(),
        workoutName: state.workout.name,
        workoutXml: state.workoutXml,
        ftp: state.ftp,
        resistanceMode: state.resistanceMode,
        avatarType: state.avatarType,
        finalScore: Math.round(state.totalScore),
        // Per recorded second: [workoutSecond, watts, cumulativeScore]
        samples: state.samples.map((s) => [
            s.elapsedSec,
            Math.round(s.actualWatts),
            Math.round(s.totalScore || 0)
        ]),
        // Per workout second: [currentGradePct, targetGradePct] of the random downwind/upwind course
        ...(GHOST_WIND_COURSE_MODES.has(state.resistanceMode) && state.gradientProfile.length > 0
            ? { windProfile: state.gradientProfile.map((p) => [p.current, p.target]) }
            : {})
    };
}

function parseGhostWindProfile(rows) {
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > GHOST_MAX_SECONDS + 1) return null;
    const valid = rows.every((row) => Array.isArray(row) && row.length >= 2
        && row.slice(0, 2).every((v) => Number.isFinite(v) && Math.abs(v) <= 30));
    return valid ? buildGradientProfileFromGrades(rows.map((row) => [row[0], row[1]])) : null;
}

function parseGhostRideFile(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        throw new Error('The file is not valid JSON.');
    }
    const isLegacyVersion = Boolean(data) && data.version === GHOST_LEGACY_FILE_VERSION;
    if (!data || data.format !== GHOST_FILE_FORMAT || (data.version !== GHOST_FILE_VERSION && !isLegacyVersion)) {
        throw new Error('This is not a Loop Kicker Journey ghost ride file.');
    }
    if (typeof data.workoutXml !== 'string' || !data.workoutXml.trim()) {
        throw new Error('The ghost ride does not contain its workout.');
    }
    if (!Array.isArray(data.samples) || data.samples.length > GHOST_MAX_SECONDS) {
        throw new Error('The ghost ride has no valid samples.');
    }
    const rowLength = isLegacyVersion ? 4 : 3;
    const rows = data.samples
        .filter((row) => Array.isArray(row) && row.length >= rowLength && row.slice(0, rowLength).every(Number.isFinite)
            && Number.isInteger(row[0]) && row[0] >= 0 && row[0] < GHOST_MAX_SECONDS)
        .map((row) => (isLegacyVersion ? [row[0], row[1], row[3]] : row))
        .sort((a, b) => a[0] - b[0]);
    if (rows.length === 0) {
        throw new Error('The ghost ride has no valid samples.');
    }

    const lastSec = rows[rows.length - 1][0];
    const watts = new Float32Array(lastSec + 1);
    const score = new Float32Array(lastSec + 1);
    let rowIdx = 0;
    let current = [0, 0, 0];
    for (let sec = 0; sec <= lastSec; sec++) {
        let hasSample = false;
        while (rowIdx < rows.length && rows[rowIdx][0] === sec) {
            current = rows[rowIdx];
            rowIdx += 1;
            hasSample = true;
        }
        // Seconds without a sample (paused or skipped) carry the score forward at zero watts
        watts[sec] = hasSample ? Math.max(0, current[1]) : 0;
        score[sec] = current[2];
    }

    const resistanceMode = GHOST_RESISTANCE_MODES.has(data.resistanceMode) ? data.resistanceMode : null;
    const gradientProfile = GHOST_WIND_COURSE_MODES.has(resistanceMode) ? parseGhostWindProfile(data.windProfile) : null;
    const ftp = Number.isInteger(data.ftp) && data.ftp >= 50 && data.ftp <= 600 ? data.ftp : null;
    const avatarType = typeof data.avatarType === 'string' ? data.avatarType : null;

    return {
        name: String(data.workoutName || 'Ghost Ride').slice(0, 80),
        resistanceMode,
        gradientProfile,
        ftp,
        avatarType,
        recordedAt: typeof data.recordedAt === 'string' ? data.recordedAt : null,
        workoutXml: data.workoutXml,
        watts,
        score,
        lastSec,
        finalScore: score[lastSec]
    };
}

// Ghost totals after the given workout second has been completed
function getGhostRideTotalsAfterSecond(sec) {
    const ghost = state.ghost;
    if (!ghost || sec < 0) return { score: 0, finished: false };
    const idx = Math.min(sec, ghost.lastSec);
    return { score: ghost.score[idx], finished: sec >= ghost.lastSec };
}

function getGhostRideWattsAtSecond(sec) {
    const ghost = state.ghost;
    if (!ghost || sec < 0 || sec > ghost.lastSec) return 0;
    return ghost.watts[sec];
}

// The ghost flies GHOST_LEAD_SECONDS ahead, so it collects the points of that later second now
function spawnGhostCollectedPoints() {
    if (!state.ghost) return;
    const sec = state.elapsedSec + GHOST_LEAD_SECONDS;
    if (sec > state.ghost.lastSec) return;
    const gained = Math.round(getGhostRideTotalsAfterSecond(sec).score - getGhostRideTotalsAfterSecond(sec - 1).score);
    if (gained <= 0) return;
    spawnGhostScorePopup(gained, dragon3D ? dragon3D.getGhostScreenPosition() : null);
}

function updateGhostUI() {
    const chip = document.getElementById('ghostStatusChip');
    const label = document.getElementById('ghostStatusLabel');
    const hudRow = document.getElementById('ghostHudRow');
    const hasGhost = Boolean(state.ghost);
    chip.classList.toggle('hidden', !hasGhost);
    chip.classList.toggle('flex', hasGhost);
    hudRow.classList.toggle('hidden', !hasGhost);
    hudRow.classList.toggle('flex', hasGhost);
    if (hasGhost) {
        const recorded = state.ghost.recordedAt ? new Date(state.ghost.recordedAt) : null;
        const dateText = recorded && !isNaN(recorded) ? ` · ${recorded.toLocaleDateString()}` : '';
        label.textContent = `Ghost: ${formatSwissNumber(state.ghost.finalScore)} pts${dateText}`;
        chip.title = `Racing against a ghost ride of "${state.ghost.name}"${dateText}`;
    }
    updateAvatarReadySummaryUI();
    updateGhostHud();
    syncRerollWindProfileButton();
}

// While the ghost's recorded wind course is in use, rerolling would break the comparison
function syncRerollWindProfileButton() {
    const btn = document.getElementById('rerollWindProfileBtn');
    if (!btn) return;
    if (!btn.dataset.defaultTitle) btn.dataset.defaultTitle = btn.title;
    const locked = isGhostWindCourseActive();
    btn.disabled = locked;
    btn.classList.toggle('opacity-40', locked);
    btn.classList.toggle('cursor-not-allowed', locked);
    btn.title = locked ? 'Wind course is fixed by the loaded ghost ride' : btn.dataset.defaultTitle;
}

function updateGhostHud() {
    if (!state.ghost) return;
    const totals = getGhostRideTotalsAfterSecond(state.elapsedSec - 1);
    const scoreDelta = Math.round(state.totalScore - totals.score);
    const scoreEl = document.getElementById('ghostScoreDeltaDisplay');
    const baseClass = 'px-2 py-0.5 rounded-lg border text-xs sm:text-sm font-black tabular-nums whitespace-nowrap';
    if (scoreDelta > 0) {
        scoreEl.textContent = `▲ ${formatSwissNumber(scoreDelta)} pts ahead`;
        scoreEl.className = `${baseClass} bg-emerald-500/15 border-emerald-400/50 text-emerald-300`;
    } else if (scoreDelta < 0) {
        scoreEl.textContent = `▼ ${formatSwissNumber(-scoreDelta)} pts behind`;
        scoreEl.className = `${baseClass} bg-rose-500/15 border-rose-400/50 text-rose-300`;
    } else {
        scoreEl.textContent = 'Tied';
        scoreEl.className = `${baseClass} bg-gray-500/15 border-gray-400/40 text-gray-200`;
    }
    const ghostWatts = (!state.hasStartedSession || state.isCountdownActive)
        ? 0
        : Math.round(getGhostRideWattsAtSecond(state.elapsedSec));
    document.getElementById('ghostWattsDisplay').textContent = ghostWatts;
}

function getGhostRaceResultText() {
    if (!state.ghost) return '';
    const totals = getGhostRideTotalsAfterSecond(state.elapsedSec - 1);
    const scoreDelta = Math.round(state.totalScore - totals.score);
    if (scoreDelta > 0) return `Ghost race: you beat the ghost by ${formatSwissNumber(scoreDelta)} pts.`;
    if (scoreDelta < 0) return `Ghost race: the ghost won by ${formatSwissNumber(-scoreDelta)} pts.`;
    return 'Ghost race: tied with the ghost.';
}

function setGhostRide(ghost) {
    state.ghost = ghost;
    if (dragon3D) dragon3D.rebuildGhostModel();
    updateGhostUI();
    updateLiveHud();
}

function clearGhostRide() {
    setGhostRide(null);
}

function selectPresetMatchingXml(xmlString) {
    return Object.keys(PRESET_WORKOUTS).find((key) => PRESET_WORKOUTS[key] === xmlString) || null;
}

function loadGhostRideFromText(text) {
    const ghost = parseGhostRideFile(text);
    const presetKey = selectPresetMatchingXml(ghost.workoutXml);
    if (ghost.resistanceMode !== null) {
        state.resistanceMode = ghost.resistanceMode;
        document.getElementById('resistanceModeSelect').value = ghost.resistanceMode;
    }
    loadWorkoutFromXml(ghost.workoutXml, presetKey);
    setGhostRide(ghost);
    // Picks up the ghost's wind course now that the ghost is set
    regenerateSessionWindProfile();
}

// -------------------------------------------------------------------------
// Ghost Battle (splash screen): ghost rides served by server.js from data/ghostrides
// -------------------------------------------------------------------------
const GHOST_RIDES_API_URL = 'api/ghostrides';
const GHOST_MODE_LABELS = { easy: 'Easy', medium: 'Medium', difficult: 'Difficult', erg: 'ERG Lock' };

async function fetchGhostRideList() {
    const res = await fetch(GHOST_RIDES_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.ghostRides) ? data.ghostRides : [];
}

// The button only makes sense when server.js is running (not for file:// or plain static hosting)
async function initGhostBattleButton() {
    const btn = document.getElementById('splashGhostBattleBtn');
    if (!btn || !/^https?:$/.test(window.location.protocol)) return;
    try {
        await fetchGhostRideList();
        btn.classList.remove('hidden');
        btn.classList.add('flex');
    } catch {
        // No ghost ride API available — keep the button hidden
    }
}

function isGhostBattlePanelOpen() {
    const panel = document.getElementById('ghostBattlePanel');
    return Boolean(panel) && !panel.classList.contains('hidden');
}

function closeGhostBattlePanel() {
    const panel = document.getElementById('ghostBattlePanel');
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    document.getElementById('splashGhostBattleBtn').focus();
}

function setGhostBattleStatus(text, isError = false) {
    const statusEl = document.getElementById('ghostBattleStatus');
    statusEl.textContent = text;
    statusEl.className = `text-xs mt-3 ${isError ? 'text-rose-300' : 'text-gray-400'}`;
}

const GHOST_LEADERBOARD_SIZE = 3;
const GHOST_RANK_MEDALS = ['🥇', '🥈', '🥉'];

// Best GHOST_LEADERBOARD_SIZE ghost rides per workout + terrain, groups ordered by workout name
function buildGhostLeaderboards(rides) {
    const groups = new Map();
    rides.forEach((ride) => {
        const key = `${ride.workoutKey || ride.workoutName}|${ride.resistanceMode || ''}`;
        if (!groups.has(key)) groups.set(key, { workoutName: ride.workoutName, resistanceMode: ride.resistanceMode, rides: [] });
        groups.get(key).rides.push(ride);
    });
    return [...groups.values()]
        .map((group) => ({
            ...group,
            rides: group.rides
                .sort((a, b) => (b.finalScore ?? -Infinity) - (a.finalScore ?? -Infinity))
                .slice(0, GHOST_LEADERBOARD_SIZE)
        }))
        .sort((a, b) => a.workoutName.localeCompare(b.workoutName)
            || String(a.resistanceMode).localeCompare(String(b.resistanceMode)));
}

function describeGhostRide(ride) {
    const parts = [];
    const recorded = ride.recordedAt ? new Date(ride.recordedAt) : null;
    if (recorded && !isNaN(recorded)) parts.push(recorded.toLocaleDateString());
    if (ride.durationSec) parts.push(`${Math.max(1, Math.round(ride.durationSec / 60))} min`);
    if (ride.ftp) parts.push(`FTP ${ride.ftp}W`);
    const avatarOption = ride.avatarType && document.querySelector(`#avatarSelect option[value="${CSS.escape(ride.avatarType)}"]`);
    if (avatarOption) parts.push(avatarOption.textContent);
    return parts.join(' · ');
}

function renderGhostBattleList(rides) {
    const listEl = document.getElementById('ghostBattleList');
    listEl.replaceChildren();
    buildGhostLeaderboards(rides).forEach((group) => {
        const groupEl = document.createElement('li');
        groupEl.className = 'rounded-2xl bg-gray-900/60 border border-gray-800 p-2.5';

        const headerEl = document.createElement('div');
        headerEl.className = 'flex items-center justify-between gap-2 px-1 pb-1.5';
        const nameEl = document.createElement('div');
        nameEl.className = 'text-sm font-black text-white truncate';
        nameEl.textContent = group.workoutName;
        const modeEl = document.createElement('span');
        modeEl.className = 'shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300';
        modeEl.textContent = GHOST_MODE_LABELS[group.resistanceMode] || group.resistanceMode || 'Unknown Mode';
        headerEl.append(nameEl, modeEl);

        const ranksEl = document.createElement('ol');
        ranksEl.className = 'flex flex-col gap-1';
        group.rides.forEach((ride, idx) => {
            const itemEl = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'w-full text-left rounded-xl px-3 py-2 bg-gray-950/80 hover:bg-cyan-500/10 border border-gray-800 hover:border-cyan-400/50 transition cursor-pointer flex items-center gap-3';

            const medalEl = document.createElement('span');
            medalEl.className = 'shrink-0 text-lg leading-none';
            medalEl.textContent = GHOST_RANK_MEDALS[idx];
            medalEl.setAttribute('aria-label', `Rank ${idx + 1}`);

            const textEl = document.createElement('div');
            textEl.className = 'min-w-0 flex-1';
            const riderEl = document.createElement('div');
            riderEl.className = 'text-sm font-bold text-white truncate';
            riderEl.textContent = ride.riderName || 'Unknown rider';
            const detailEl = document.createElement('div');
            detailEl.className = 'text-[11px] text-gray-400 truncate';
            detailEl.textContent = describeGhostRide(ride);
            textEl.append(riderEl, detailEl);

            const scoreEl = document.createElement('div');
            scoreEl.className = 'shrink-0 text-right font-mono font-black text-cyan-200 text-sm';
            scoreEl.textContent = ride.finalScore !== null ? `${formatSwissNumber(ride.finalScore)} pts` : '';

            btn.append(medalEl, textEl, scoreEl);
            btn.addEventListener('click', () => startGhostBattleFromFile(ride.file, btn));
            itemEl.appendChild(btn);
            ranksEl.appendChild(itemEl);
        });

        groupEl.append(headerEl, ranksEl);
        listEl.appendChild(groupEl);
    });
}

async function openGhostBattlePanel() {
    const panel = document.getElementById('ghostBattlePanel');
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    document.getElementById('ghostBattleList').replaceChildren();
    setGhostBattleStatus('Loading ghost rides…');
    try {
        const rides = await fetchGhostRideList();
        renderGhostBattleList(rides);
        setGhostBattleStatus(rides.length
            ? `Top ${GHOST_LEADERBOARD_SIZE} per workout & mode — pick a ghost to start the battle.`
            : 'No ghost rides yet. Finish a workout and save your score & ghost in the summary.');
        const firstBtn = document.querySelector('#ghostBattleList button');
        (firstBtn || document.getElementById('ghostBattleCloseBtn')).focus();
    } catch (err) {
        setGhostBattleStatus(`Could not load the ghost rides: ${err.message}`, true);
    }
}

async function startGhostBattleFromFile(fileName, btn) {
    document.querySelectorAll('#ghostBattleList button').forEach((b) => { b.disabled = true; });
    setGhostBattleStatus('Loading ghost ride…');
    try {
        const res = await fetch(`${GHOST_RIDES_API_URL}/${encodeURIComponent(fileName)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        startGhostBattle(await res.text());
    } catch (err) {
        document.querySelectorAll('#ghostBattleList button').forEach((b) => { b.disabled = false; });
        setGhostBattleStatus(`Could not start the ghost battle: ${err.message}`, true);
        if (btn) btn.focus();
    }
}

// Loads the ghost with its recorded settings and opens the avatar selection before the flight
function startGhostBattle(text) {
    if (state.hasStartedSession) resetWorkoutSession();
    // Workout, Mode & wind course
    loadGhostRideFromText(text);
    const ghost = state.ghost;
    if (ghost.ftp !== null) {
        // Only for this session: the rider's own saved FTP stays untouched
        document.getElementById('ftpInput').value = ghost.ftp;
        applyFtpWatts(ghost.ftp, false);
    }

    const panel = document.getElementById('ghostBattlePanel');
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    soundEngine.init();
    setScreen('avatar');
}

const RIDER_NAME_STORAGE_KEY = 'loop_kicker_journey_rider_name';

function setRideSaveStatus(text, tone = 'info') {
    const el = document.getElementById('summaryRideSaveStatus');
    const toneClass = { info: 'text-gray-400', success: 'text-amber-300', error: 'text-rose-300' }[tone];
    el.textContent = text;
    el.className = `text-xs font-bold ${toneClass}${text ? '' : ' hidden'}`;
}

const RIDE_SCORES_API_URL = 'api/loop-kicker-journey/scores';
// Ignores leaderboard responses of an earlier summary or one that arrives after saving
let rideLeaderboardToken = 0;

// Score & ghost saving needs server.js and a completely flown workout
function prepareRideSaveForm(isRankedRide) {
    const form = document.getElementById('summaryRideSaveSection');
    const canSave = isRankedRide && /^https?:$/.test(window.location.protocol);
    form.classList.toggle('hidden', !canSave);
    form.classList.toggle('flex', canSave);
    rideLeaderboardToken += 1;
    if (!canSave) return;
    const input = document.getElementById('summaryRiderNameInput');
    input.value = localStorage.getItem(RIDER_NAME_STORAGE_KEY) || '';
    input.disabled = false;
    document.getElementById('summarySaveRideBtn').disabled = false;
    ['summaryRiderNameInput', 'summarySaveRideBtn'].forEach((id) => document.getElementById(id).classList.remove('hidden'));
    document.querySelector('label[for="summaryRiderNameInput"]').classList.remove('hidden');
    setRideSaveStatus('');
    loadProvisionalLeaderboardRank();
}

// Shows the rank this ride would get and the current top 3, before it is saved
async function loadProvisionalLeaderboardRank() {
    const token = rideLeaderboardToken;
    const score = Math.round(state.totalScore);
    renderLeaderboardRank({ rank: null, total: null, top: [], saved: false });
    const params = new URLSearchParams({ workoutKey: getWorkoutKey(), resistanceMode: state.resistanceMode, score: String(score) });
    try {
        const res = await fetch(`${RIDE_SCORES_API_URL}?${params}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (token !== rideLeaderboardToken) return;
        renderLeaderboardRank({ rank: data.rank, total: data.total + 1, top: data.top, saved: false });
    } catch {
        if (token === rideLeaderboardToken) document.getElementById('summaryLeaderboardTop').textContent = 'Leaderboard not available';
    }
}

function renderLeaderboardRank({ rank, total, top, saved, ownEntry = null }) {
    const modeLabel = GHOST_MODE_LABELS[state.resistanceMode] || state.resistanceMode;
    document.getElementById('summaryLeaderboardLabel').textContent = saved ? 'Saved · Your Rank' : 'Your Rank · not saved yet';
    document.getElementById('summaryLeaderboardMedal').textContent = (rank && GHOST_RANK_MEDALS[rank - 1]) || '🏁';
    document.getElementById('summaryLeaderboardRankValue').textContent = rank ? `Rank #${rank} of ${total}` : 'Rank #–';
    document.getElementById('summaryLeaderboardRankDetail').textContent =
        `${ownEntry ? `${ownEntry.riderName} · ` : ''}${state.workout.name} · ${modeLabel}`;

    const listEl = document.getElementById('summaryLeaderboardTop');
    listEl.replaceChildren();
    top.slice(0, GHOST_LEADERBOARD_SIZE).forEach((entry, idx) => {
        const isOwn = ownEntry && entry.ghostFile === ownEntry.ghostFile;
        const itemEl = document.createElement('li');
        itemEl.className = `flex items-center gap-1.5 ${isOwn ? 'text-amber-300 font-black' : 'text-gray-200'}`;
        const medalEl = document.createElement('span');
        medalEl.textContent = GHOST_RANK_MEDALS[idx];
        const nameEl = document.createElement('span');
        nameEl.className = 'flex-1 min-w-0 truncate';
        nameEl.textContent = entry.riderName || 'Unknown rider';
        const scoreEl = document.createElement('span');
        scoreEl.className = 'font-mono font-bold';
        scoreEl.textContent = formatSwissNumber(entry.score);
        itemEl.append(medalEl, nameEl, scoreEl);
        listEl.appendChild(itemEl);
    });
    if (top.length === 0 && rank) listEl.textContent = 'No rides yet — be the first!';
}

// Stores the finished ride on server.js: as ghost file (selectable in Ghost Battle) and as highscore
// ranked per workout + terrain
async function saveRideToServer() {
    const input = document.getElementById('summaryRiderNameInput');
    const btn = document.getElementById('summarySaveRideBtn');
    const riderName = input.value.trim().slice(0, 30);
    if (!riderName) {
        input.focus();
        return;
    }
    localStorage.setItem(RIDER_NAME_STORAGE_KEY, riderName);
    const ghostFile = { ...buildGhostRideFile(), riderName };
    input.disabled = true;
    btn.disabled = true;
    setRideSaveStatus('Saving…');
    try {
        const res = await fetch(GHOST_RIDES_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ghostFile)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        rideLeaderboardToken += 1;
        ['summaryRiderNameInput', 'summarySaveRideBtn'].forEach((id) => document.getElementById(id).classList.add('hidden'));
        document.querySelector('label[for="summaryRiderNameInput"]').classList.add('hidden');
        renderLeaderboardRank({ rank: result.rank, total: result.total, top: result.top, saved: true, ownEntry: result.entry });
        setRideSaveStatus('');
    } catch (err) {
        input.disabled = false;
        btn.disabled = false;
        setRideSaveStatus(`Not saved: ${err.message}`, 'error');
    }
}

function toggleSimMode(forceState) {
    state.simMode = typeof forceState === 'boolean' ? forceState : !state.simMode;
    const bar = document.getElementById('simControlBar');
    const text = document.getElementById('simToggleText');
    const btn = document.getElementById('simToggleBtn');
    if (state.simMode) {
        bar.classList.remove('hidden');
        text.textContent = 'Sim Mode: ON';
        btn.className = 'px-2.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 transition cursor-pointer';
        if (state.simAutoJitter && state.workout) {
            const targetW = getTargetWattsAtSecond(state.workout, state.elapsedSec, state.ftp);
            state.actualWatts = targetW;
        } else {
            const sliderVal = parseInt(document.getElementById('simWattSlider').value, 10);
            state.actualWatts = !isNaN(sliderVal) ? Math.max(0, sliderVal) : 0;
        }
        document.getElementById('simWattSlider').value = state.actualWatts;
        document.getElementById('simWattReadout').textContent = `${state.actualWatts} W`;
    } else {
        bar.classList.add('hidden');
        text.textContent = 'Sim Mode: OFF';
        btn.className = 'px-2.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 bg-gray-800/90 hover:bg-gray-700 text-gray-300 border border-gray-700 transition cursor-pointer';
        if (!bleTrainer.connected && !bleRower.connected) {
            state.actualWatts = 0;
            if (!bleCadenceSensor.connected) state.cadence = 0;
        }
    }
    if (typeof syncZeroWattPauseState === 'function') syncZeroWattPauseState();
    updateHeaderAndSetupVisibility();
    updateLiveHud();
}
