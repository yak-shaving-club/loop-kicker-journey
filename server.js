const { createServer } = require('node:http');
const { readFile, readdir, stat, writeFile, rename } = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const APP_ORIGIN = new URL(process.env.APP_ORIGIN || `http://localhost:${PORT}`).origin;
const GHOSTRIDES_DIR = path.resolve(ROOT, process.env.GHOSTRIDES_DIR || 'data/ghostrides');

const GHOST_FILE_SUFFIX = '.loop-kicker-journey-ghost.json';
const GHOST_FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9_.-]*\.loop-kicker-journey-ghost\.json$/i;
const MAX_GHOST_FILE_BYTES = 5 * 1024 * 1024;

// Escargozzled (bonus game) highscores
const ESCARGOZZLED_SCORES_FILE = path.resolve(ROOT, process.env.ESCARGOZZLED_SCORES_FILE || 'escargozzled/scores.json');
const ESCARGOZZLED_SCORES_API = '/api/escargozzled/scores';
const ESCARGOZZLED_TOP_COUNT = 10;
const MAX_SCORE_BODY_BYTES = 4096;

function sendJson(response, status, value) {
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify(value));
}

async function readGhostRideFile(fileName) {
    if (!GHOST_FILE_NAME_PATTERN.test(fileName)) return null;
    const filePath = path.join(GHOSTRIDES_DIR, fileName);
    try {
        const info = await stat(filePath);
        if (!info.isFile() || info.size > MAX_GHOST_FILE_BYTES) return null;
        return await readFile(filePath, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

// Metadata of every ghost ride in GHOSTRIDES_DIR (without the per-second samples), newest first
async function listGhostRides() {
    let fileNames;
    try {
        fileNames = await readdir(GHOSTRIDES_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
    const rides = [];
    for (const fileName of fileNames.filter((name) => name.endsWith(GHOST_FILE_SUFFIX))) {
        const text = await readGhostRideFile(fileName);
        if (!text) continue;
        try {
            const data = JSON.parse(text);
            if (data.format !== 'loop-kicker-journey-ghost' || !Array.isArray(data.samples)) continue;
            const lastSample = data.samples[data.samples.length - 1];
            rides.push({
                file: fileName,
                workoutName: typeof data.workoutName === 'string' ? data.workoutName : 'Ghost Ride',
                recordedAt: typeof data.recordedAt === 'string' ? data.recordedAt : null,
                finalScore: Number.isFinite(data.finalScore) ? data.finalScore : null,
                durationSec: Array.isArray(lastSample) && Number.isFinite(lastSample[0]) ? lastSample[0] + 1 : null,
                ftp: Number.isFinite(data.ftp) ? data.ftp : null,
                accuracyToleranceWatts: Number.isFinite(data.accuracyToleranceWatts) ? data.accuracyToleranceWatts : null,
                resistanceMode: typeof data.resistanceMode === 'string' ? data.resistanceMode : null,
                avatarType: typeof data.avatarType === 'string' ? data.avatarType : null
            });
        } catch {
            // Skip files that are not valid JSON
        }
    }
    return rides.sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
}

async function handleGhostRidesApi(request, response, pathname) {
    if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
    }
    if (pathname === '/api/ghostrides') {
        sendJson(response, 200, { ghostRides: await listGhostRides() });
        return;
    }
    const text = await readGhostRideFile(pathname.slice('/api/ghostrides/'.length));
    if (!text) {
        sendJson(response, 404, { error: 'Ghost ride not found.' });
        return;
    }
    response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(text);
}

async function readEscargozzledScores() {
    try {
        const data = JSON.parse(await readFile(ESCARGOZZLED_SCORES_FILE, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) return [];
        throw error;
    }
}

// Higher score first; on equal scores the shorter time wins
function compareEscargozzledScores(a, b) {
    return b.score - a.score || a.durationSec - b.durationSec;
}

function readRequestBody(request, maxBytes) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new Error('Request body too large.'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}

function parseEscargozzledScoreEntry(body) {
    let data;
    try {
        data = JSON.parse(body);
    } catch {
        return null;
    }
    if (!data || !Number.isInteger(data.score) || Math.abs(data.score) > 1e6
        || !Number.isInteger(data.level) || data.level < 1 || data.level > 100
        || !Number.isInteger(data.durationSec) || data.durationSec < 0 || data.durationSec > 24 * 3600) {
        return null;
    }
    const name = (typeof data.name === 'string' ? data.name : '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 30) || 'Anonym';
    return { name, score: data.score, level: data.level, durationSec: data.durationSec, date: new Date().toISOString() };
}

// Serializes score writes so concurrent POSTs don't overwrite each other
let escargozzledScoresQueue = Promise.resolve();

async function handleEscargozzledScoresApi(request, response) {
    if (request.method === 'GET') {
        const scores = (await readEscargozzledScores()).sort(compareEscargozzledScores);
        sendJson(response, 200, { top: scores.slice(0, ESCARGOZZLED_TOP_COUNT) });
        return;
    }
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'GET, POST');
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
    }
    let entry;
    try {
        entry = parseEscargozzledScoreEntry(await readRequestBody(request, MAX_SCORE_BODY_BYTES));
    } catch {
        sendJson(response, 413, { error: 'Request body too large.' });
        return;
    }
    if (!entry) {
        sendJson(response, 400, { error: 'Invalid score.' });
        return;
    }
    const result = escargozzledScoresQueue.then(async () => {
        const scores = await readEscargozzledScores();
        scores.push(entry);
        scores.sort(compareEscargozzledScores);
        const tmpFile = `${ESCARGOZZLED_SCORES_FILE}.tmp`;
        await writeFile(tmpFile, JSON.stringify(scores, null, 2));
        await rename(tmpFile, ESCARGOZZLED_SCORES_FILE);
        return { rank: scores.indexOf(entry) + 1, total: scores.length, top: scores.slice(0, ESCARGOZZLED_TOP_COUNT), entry };
    });
    escargozzledScoresQueue = result.catch(() => {});
    sendJson(response, 200, await result);
}

function getStaticFile(pathname) {
    if (pathname === '/' || pathname === '/index.html' || pathname === '/loop-kicker-journey.html') return 'index.html';
    if (pathname === '/escargozzled/' || pathname === '/escargozzled/index.html') return 'escargozzled/index.html';
    if (/^\/escargozzled\/docs\/screenshots\/[a-z0-9-]+\.png$/i.test(pathname)) return pathname.slice(1);
    if (pathname === '/escargozzled/world3d.js') return pathname.slice(1);
    if (/^\/js\/[a-z0-9-]+\.js$/i.test(pathname) || pathname === '/css/styles.css') return pathname.slice(1);
    if (
        pathname === '/loop-kicker-journey-models.js'
        || pathname === '/sterzo-challenge-codes.js'
        || pathname === '/loop-kicker-journey.svg'
    ) {
        return pathname.slice(1);
    }
    if (/^\/docs\/screenshots\/[a-z0-9-]+\.png$/i.test(pathname)) return pathname.slice(1);
    return null;
}

function contentType(filePath) {
    if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    if (filePath.endsWith('.svg')) return 'image/svg+xml';
    if (filePath.endsWith('.png')) return 'image/png';
    return 'application/octet-stream';
}

async function handleRequest(request, response) {
    const url = new URL(request.url, APP_ORIGIN);

    if (url.pathname === '/api/ghostrides' || url.pathname.startsWith('/api/ghostrides/')) {
        await handleGhostRidesApi(request, response, decodeURIComponent(url.pathname));
        return;
    }

    if (url.pathname === ESCARGOZZLED_SCORES_API) {
        await handleEscargozzledScoresApi(request, response);
        return;
    }

    // Relative asset paths of the bonus game need the trailing slash
    if (request.method === 'GET' && url.pathname === '/escargozzled') {
        response.writeHead(301, { Location: '/escargozzled/' });
        response.end();
        return;
    }

    if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
    }

    const pathname = decodeURIComponent(url.pathname);
    const relativePath = getStaticFile(pathname);
    if (!relativePath) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
    }

    try {
        const filePath = path.resolve(ROOT, relativePath);
        if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
            sendJson(response, 404, { error: 'Not found.' });
            return;
        }
        const content = await readFile(filePath);
        response.writeHead(200, {
            'Cache-Control': 'no-cache',
            'Content-Type': contentType(filePath),
            'X-Content-Type-Options': 'nosniff'
        });
        response.end(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendJson(response, 404, { error: 'Not found.' });
            return;
        }
        sendJson(response, 500, { error: 'Could not load the requested file.' });
    }
}

const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
        if (!response.headersSent) {
            sendJson(response, 500, { error: 'The request could not be completed.' });
        } else {
            response.destroy(error);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Loop Kicker Journey listening on ${APP_ORIGIN}`);
});

module.exports = { server };
