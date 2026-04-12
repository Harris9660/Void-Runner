class DodgingGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.camera = { x: 0, y: 0, shake: 0 };
        this.keys = {};
        this.mouse = { x: 0, y: 0 };

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.bindEvents();

        this.highScore = this.loadHighScore();
        this.selectedGameMode = null;
        this.modeSelectActive = true;
        this.testingSetupActive = false;
        this.checkpointData = null;
        this.testingConfig = this.createDefaultTestingConfig();
        this.testingFieldIndex = 0;
        this.testingInputQueue = [];
        this.testingFieldBuffer = "";
        this.testingFieldBufferKey = null;

        this.resetGame();
        this.loop();
    }

    bindEvents() {
        window.addEventListener("keydown", (event) => {
            if (
                this.testingSetupActive &&
                !event.repeat &&
                (/^\d$/.test(event.key) || event.key === "Backspace")
            ) {
                this.testingInputQueue.push(event.key);
                event.preventDefault();
            } else if (
                this.testingSetupActive &&
                (event.key === " " || event.key === "ArrowUp" || event.key === "ArrowDown")
            ) {
                event.preventDefault();
            }

            this.keys[event.key] = true;
        });

        window.addEventListener("keyup", (event) => {
            this.keys[event.key] = false;
        });

        window.addEventListener("mousemove", (event) => {
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        });
    }

    getCookie(name) {
        const prefix = name + "=";
        const parts = document.cookie ? document.cookie.split(";") : [];

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.startsWith(prefix)) {
                return decodeURIComponent(trimmed.slice(prefix.length));
            }
        }

        return "";
    }

    setCookie(name, value, days = 3650) {
        const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    }

    loadHighScore() {
        const savedScore = Number.parseFloat(this.getCookie(HIGH_SCORE_COOKIE_NAME));
        return Number.isFinite(savedScore) ? savedScore : 0;
    }

    getModeLabel(mode = this.selectedGameMode) {
        if (mode === GAME_MODES.TESTING) return "Testing";
        if (mode === GAME_MODES.CHECKPOINT) return "Checkpoint";
        if (mode === GAME_MODES.CLASSIC) return "Classic";
        return "Unselected";
    }

    createDefaultTestingConfig() {
        return {
            startLevel: 1,
            dashTier: 0,
            shieldTier: 0,
            flareTier: 0,
            speedUps: 0
        };
    }

    getTestingPlayerProgress(config = this.testingConfig) {
        return {
            baseSpeed: 4 + config.speedUps * SPEED_UPGRADE_AMOUNT,
            dashTier: config.dashTier,
            shieldTier: config.shieldTier,
            flareTier: config.flareTier
        };
    }

    getTestingFields() {
        return [
            { key: "startLevel", label: "Start Level", min: 1 },
            { key: "dashTier", label: "Dash Tier", min: 0 },
            { key: "shieldTier", label: "Shield Tier", min: 0 },
            { key: "flareTier", label: "Flare Tier", min: 0 },
            { key: "speedUps", label: "Speed Ups", min: 0 }
        ];
    }

    getTestingField(key) {
        return this.getTestingFields().find((field) => field.key === key) ?? null;
    }

    normalizeTestingValue(field, value, fallback = field.min) {
        const parsedValue = typeof value === "number" ? value : Number.parseInt(value, 10);
        if (!Number.isFinite(parsedValue)) return fallback;

        const integerValue = Math.trunc(parsedValue);
        if (typeof field.max === "number") {
            return Math.max(field.min, Math.min(field.max, integerValue));
        }

        return Math.max(field.min, integerValue);
    }

    getSelectedTestingField() {
        return this.getTestingFields()[this.testingFieldIndex] ?? null;
    }

    resetTestingInputState() {
        this.testingInputQueue = [];
        this.testingFieldBuffer = "";
        this.testingFieldBufferKey = null;

        const testingKeys = ["Backspace", "Enter", " ", "Escape", "m", "M", "ArrowUp", "ArrowDown", "w", "W", "s", "S"];
        for (let digit = 0; digit <= 9; digit++) {
            testingKeys.push(String(digit));
        }

        for (const key of testingKeys) {
            this.keys[key] = false;
        }
    }

    setTestingFieldBuffer(key, buffer) {
        const field = this.getTestingField(key);
        if (!field) return;

        this.testingFieldBufferKey = key;
        this.testingFieldBuffer = buffer;

        const previewValue = buffer === "" ? field.min : buffer;
        this.testingConfig[key] = this.normalizeTestingValue(field, previewValue, field.min);
    }

    appendTestingFieldDigit(digit) {
        const field = this.getSelectedTestingField();
        if (!field) return;

        const currentBuffer = this.testingFieldBufferKey === field.key ? this.testingFieldBuffer : "";
        const nextBuffer = currentBuffer === "0" ? digit : currentBuffer + digit;
        this.setTestingFieldBuffer(field.key, nextBuffer);
    }

    removeTestingFieldDigit() {
        const field = this.getSelectedTestingField();
        if (!field) return;

        const currentBuffer = this.testingFieldBufferKey === field.key
            ? this.testingFieldBuffer
            : String(this.testingConfig[field.key]);
        const nextBuffer = currentBuffer.slice(0, -1);

        this.setTestingFieldBuffer(field.key, nextBuffer);
    }

    commitTestingFieldBuffer() {
        if (!this.testingFieldBufferKey) return;

        const field = this.getTestingField(this.testingFieldBufferKey);
        if (!field) {
            this.resetTestingInputState();
            return;
        }

        const committedValue = this.testingFieldBuffer === "" ? field.min : this.testingFieldBuffer;
        this.testingConfig[field.key] = this.normalizeTestingValue(field, committedValue, field.min);
        this.testingFieldBuffer = "";
        this.testingFieldBufferKey = null;
    }

    consumeTestingInputQueue() {
        const queuedKeys = this.testingInputQueue;
        this.testingInputQueue = [];
        return queuedKeys;
    }

    getTestingFieldDisplayValue(field) {
        if (this.testingFieldBufferKey !== field.key) {
            return String(this.testingConfig[field.key]);
        }

        return this.testingFieldBuffer === "" ? "_" : this.testingFieldBuffer;
    }

    createPlayer(progress = {}) {
        this.player = new Player(progress);
    }

    resetGame(startLevel = 1, startingScore = 0, playerProgress = {}) {
        this.createPlayer(playerProgress);

        this.projectiles = [];
        this.flares = [];
        this.lasers = [];
        this.boss = null;
        this.playerHistory = [];
        this.straightSpawnTimer = 0;
        this.spiralSpawnTimer = 0;
        this.laserSpawnTimer = 0;
        this.trackingSpawnTimer = 0;
        this.trackingBarrageSpawnTimer = 0;
        this.laserBarrageSpawnTimer = 0;
        this.predictiveLaserSpawnTimer = 0;
        this.levelFrameCounter = 0;
        this.currentLevel = startLevel;
        this.levelTransitionTimer = LEVEL_TRANSITION_FRAMES;
        this.shopActive = false;
        this.shopTimer = 0;
        this.scoreMultiplierTimer = 0;
        this.gameOver = false;
        this.score = startingScore;
        this.updateAbilityStats();
        this.camera.x = this.player.x - this.getViewWidth() / 2;
        this.camera.y = this.player.y - this.getViewHeight() / 2;
        this.camera.shake = 0;
        this.syncBossForLevel();
    }

    shouldSaveCheckpoint(level) {
        return level === 1 || (level - 1) % CHECKPOINT_INTERVAL === 0;
    }

    saveCheckpoint() {
        if (this.selectedGameMode !== GAME_MODES.CHECKPOINT) return;

        this.checkpointData = {
            level: this.currentLevel,
            score: this.score,
            playerProgress: this.player.getProgress()
        };
    }

    startNewRun(mode) {
        this.selectedGameMode = mode;
        this.modeSelectActive = false;
        this.testingSetupActive = false;
        this.checkpointData = null;
        this.resetTestingInputState();
        this.resetGame();

        if (this.selectedGameMode === GAME_MODES.CHECKPOINT) {
            this.saveCheckpoint();
        }
    }

    openTestingSetup() {
        this.selectedGameMode = GAME_MODES.TESTING;
        this.modeSelectActive = false;
        this.testingSetupActive = true;
        this.checkpointData = null;
        this.testingConfig = this.createDefaultTestingConfig();
        this.testingFieldIndex = 0;
        this.resetTestingInputState();
    }

    startTestingRun() {
        this.commitTestingFieldBuffer();
        this.selectedGameMode = GAME_MODES.TESTING;
        this.modeSelectActive = false;
        this.testingSetupActive = false;
        this.checkpointData = null;
        this.resetTestingInputState();
        this.resetGame(this.testingConfig.startLevel, 0, this.getTestingPlayerProgress());
    }

    restartRun() {
        if (this.selectedGameMode === GAME_MODES.TESTING) {
            this.resetGame(this.testingConfig.startLevel, 0, this.getTestingPlayerProgress());
            return;
        }

        if (this.selectedGameMode === GAME_MODES.CHECKPOINT && this.checkpointData) {
            this.resetGame(this.checkpointData.level, this.checkpointData.score, this.checkpointData.playerProgress);
            return;
        }

        this.resetGame();
    }

    returnToModeSelect() {
        this.selectedGameMode = null;
        this.modeSelectActive = true;
        this.testingSetupActive = false;
        this.checkpointData = null;
        this.resetTestingInputState();
        this.resetGame();
    }

    aim(x, y, tx, ty, speed) {
        const dx = tx - x;
        const dy = ty - y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return { vx: 0, vy: 0 };
        return { vx: (dx / len) * speed, vy: (dy / len) * speed };
    }

    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);

        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        return Math.hypot(px - closestX, py - closestY);
    }

    getScoreMultiplier() {
        return this.scoreMultiplierTimer > 0 ? SCORE_MULTIPLIER_VALUE : 1;
    }

    getViewScale() {
        const extraSpeed = Math.max(0, this.player.baseSpeed - 4);
        return Math.max(MIN_VIEW_SCALE, 1 - extraSpeed * VIEW_SCALE_PER_SPEED);
    }

    getViewWidth() {
        return this.canvas.width / this.getViewScale();
    }

    getViewHeight() {
        return this.canvas.height / this.getViewScale();
    }

    getViewBounds() {
        return {
            left: this.camera.x,
            right: this.camera.x + this.getViewWidth(),
            top: this.camera.y,
            bottom: this.camera.y + this.getViewHeight()
        };
    }

    screenToWorld(screenX, screenY) {
        const viewScale = this.getViewScale();
        return {
            x: this.camera.x + screenX / viewScale,
            y: this.camera.y + screenY / viewScale
        };
    }

    formatHp(value) {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    addScore(basePoints) {
        this.score += basePoints * this.getScoreMultiplier();
        if (this.selectedGameMode !== GAME_MODES.TESTING && this.score > this.highScore) {
            this.highScore = this.score;
            this.setCookie(HIGH_SCORE_COOKIE_NAME, this.highScore.toFixed(2));
        }
    }

    triggerCloseDodge() {
        this.scoreMultiplierTimer = SCORE_MULTIPLIER_DURATION_FRAMES;
        this.addScore(CLOSE_DODGE_BONUS);
    }

    damagePlayer(amount = 1) {
        if (this.gameOver || this.player.hitInvulnerability > 0) return false;

        this.player.hp = Math.max(0, this.player.hp - amount);
        this.player.hitInvulnerability = PLAYER_HIT_INVULNERABILITY_FRAMES;
        this.camera.shake = Math.max(this.camera.shake, 20);
        if (this.player.hp <= 0) {
            this.gameOver = true;
        }
        return true;
    }

    isBossLevel(level = this.currentLevel) {
        return level > 0 && level % BOSS_LEVEL_INTERVAL === 0;
    }

    createBossForLevel(level) {
        return new Boss(level, this.player);
    }

    syncBossForLevel() {
        this.boss = this.isBossLevel(this.currentLevel) ? this.createBossForLevel(this.currentLevel) : null;
    }

    spawnProjectile(x, y, type = "basic") {
        const speed = type === "fast" ? 4 : 2;
        const { vx, vy } = this.aim(x, y, this.player.x, this.player.y, speed);

        this.projectiles.push({
            x,
            y,
            vx,
            vy,
            size: type === "fast" ? 8 : 10,
            type,
            trail: [],
            life: BULLET_LIFETIME,
            dodgeTriggered: false
        });
    }

    spawnRing(cx, cy) {
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 / 12) * i;
            this.projectiles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2,
                size: 10,
                type: "ring",
                trail: [],
                life: BULLET_LIFETIME,
                dodgeTriggered: false
            });
        }
    }

    spawnSpiral(cx, cy) {
        for (let i = 0; i < 8; i++) {
            const angle = (Date.now() / 200 + i) % (Math.PI * 2);
            this.projectiles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2,
                size: 10,
                type: "spiral",
                trail: [],
                life: BULLET_LIFETIME,
                dodgeTriggered: false
            });
        }
    }

    spawnTrackingProjectile(x, y) {
        return this.spawnTrackingProjectileWithStats(x, y, {
            speed: 2.4,
            size: 11,
            turnRate: 0.055,
            type: "tracking"
        });
    }

    spawnTrackingProjectileWithStats(x, y, stats) {
        const speed = stats.speed;
        const { vx, vy } = this.aim(x, y, this.player.x, this.player.y, speed);
        const projectile = {
            x,
            y,
            vx,
            vy,
            size: stats.size,
            type: stats.type,
            trail: [],
            life: BULLET_LIFETIME,
            speed,
            turnRate: stats.turnRate,
            dodgeTriggered: false,
            screenLifeBonusPending: true
        };

        this.projectiles.push(projectile);
        return projectile;
    }

    isTrackingProjectile(projectile) {
        return projectile.type === "tracking" || projectile.type === "tracking-fast" || projectile.type === "boss-tracking";
    }

    isCircleOnScreen(x, y, size) {
        const { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom } = this.getViewBounds();

        return (
            x + size >= viewLeft &&
            x - size <= viewRight &&
            y + size >= viewTop &&
            y - size <= viewBottom
        );
    }

    spawnTrackingBarrage() {
        const count = 5;
        for (let i = 0; i < count; i++) {
            const origin = this.getSpawnOutsideView();
            this.spawnTrackingProjectileWithStats(origin.x, origin.y, {
                speed: 3.6,
                size: 9,
                turnRate: 0.02,
                type: "tracking-fast"
            });
        }
    }

    getSpawnOutsideView() {
        const margin = 50;
        const { left, right, top, bottom } = this.getViewBounds();
        const viewWidth = right - left;
        const viewHeight = bottom - top;
        const side = Math.floor(Math.random() * 4);

        let x;
        let y;

        if (side === 0) {
            x = left - margin;
            y = top + Math.random() * viewHeight;
        } else if (side === 1) {
            x = right + margin;
            y = top + Math.random() * viewHeight;
        } else if (side === 2) {
            x = left + Math.random() * viewWidth;
            y = top - margin;
        } else {
            x = left + Math.random() * viewWidth;
            y = bottom + margin;
        }

        return { x, y };
    }

    spawnLaserWarning() {
        const origin = this.getSpawnOutsideView();
        const jitter = 180;
        const targetX = this.player.x + (Math.random() - 0.5) * jitter;
        const targetY = this.player.y + (Math.random() - 0.5) * jitter;
        const dx = targetX - origin.x;
        const dy = targetY - origin.y;
        const len = Math.hypot(dx, dy) || 1;
        const dirX = dx / len;
        const dirY = dy / len;
        const beamLength = Math.hypot(this.getViewWidth(), this.getViewHeight()) * 2;

        this.lasers.push({
            x1: origin.x,
            y1: origin.y,
            x2: origin.x + dirX * beamLength,
            y2: origin.y + dirY * beamLength,
            width: 28,
            warning: LASER_WARNING_TIME,
            flash: 0,
            fired: false
        });
    }

    spawnLaserBarrage() {
        const laserCount = 3 + Math.floor(Math.random() * 3);
        const distance = Math.max(this.getViewWidth(), this.getViewHeight()) * 0.9;
        const beamLength = Math.hypot(this.getViewWidth(), this.getViewHeight()) * 2;
        const baseAngle = Math.random() * Math.PI * 2;

        for (let i = 0; i < laserCount; i++) {
            const angle = baseAngle + (Math.PI * 2 * i) / laserCount;
            const originX = this.player.x + Math.cos(angle) * distance;
            const originY = this.player.y + Math.sin(angle) * distance;
            const targetX = this.player.x + (Math.random() - 0.5) * 80;
            const targetY = this.player.y + (Math.random() - 0.5) * 80;
            const dx = targetX - originX;
            const dy = targetY - originY;
            const len = Math.hypot(dx, dy) || 1;

            this.lasers.push({
                x1: originX,
                y1: originY,
                x2: originX + (dx / len) * beamLength,
                y2: originY + (dy / len) * beamLength,
                width: 24,
                warning: LASER_WARNING_TIME,
                flash: 0,
                fired: false
            });
        }
    }

    recordPlayerHistory() {
        this.playerHistory.push({ x: this.player.x, y: this.player.y });
        if (this.playerHistory.length > PLAYER_HISTORY_FRAMES) {
            this.playerHistory.shift();
        }
    }

    getPredictedPlayerPosition(framesAhead) {
        if (this.playerHistory.length < 2) {
            return { x: this.player.x, y: this.player.y };
        }

        const oldest = this.playerHistory[0];
        const newest = this.playerHistory[this.playerHistory.length - 1];
        const samples = Math.max(1, this.playerHistory.length - 1);
        const vxPerFrame = (newest.x - oldest.x) / samples;
        const vyPerFrame = (newest.y - oldest.y) / samples;

        return {
            x: this.player.x + vxPerFrame * framesAhead,
            y: this.player.y + vyPerFrame * framesAhead
        };
    }

    spawnPredictiveLaserBurst() {
        const distance = Math.max(this.getViewWidth(), this.getViewHeight()) * 1.05;
        const beamLength = Math.hypot(this.getViewWidth(), this.getViewHeight()) * 2;
        const baseAngle = Math.random() * Math.PI * 2;

        for (let i = 0; i < PREDICTIVE_LASER_BURST_COUNT; i++) {
            const shotDelay = LASER_WARNING_TIME + i * PREDICTIVE_LASER_GAP_FRAMES;
            const predicted = this.getPredictedPlayerPosition(shotDelay);
            const angle = baseAngle + i * (Math.PI / 7);
            const originX = predicted.x + Math.cos(angle) * distance;
            const originY = predicted.y + Math.sin(angle) * distance;
            const targetX = predicted.x;
            const targetY = predicted.y;
            const dx = targetX - originX;
            const dy = targetY - originY;
            const len = Math.hypot(dx, dy) || 1;

            this.lasers.push({
                x1: originX,
                y1: originY,
                x2: originX + (dx / len) * beamLength,
                y2: originY + (dy / len) * beamLength,
                width: 22,
                warning: shotDelay,
                flash: 0,
                fired: false,
                type: "predictive"
            });
        }
    }

    spawnBossMissileVolley() {
        if (!this.boss) return;

        const missileCount = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < missileCount; i++) {
            const angle = this.boss.angle + ((i - (missileCount - 1) / 2) * 0.4);
            const originX = this.boss.x + Math.cos(angle) * (this.boss.size + 10);
            const originY = this.boss.y + Math.sin(angle) * (this.boss.size + 10);
            const missile = this.spawnTrackingProjectileWithStats(originX, originY, {
                speed: 3.2,
                size: 10,
                turnRate: 0.028,
                type: "boss-tracking"
            });

            missile.owner = "boss";
            missile.bossDamage = 1;
            missile.bossSafeFrames = 42;
        }
    }

    spawnBossBurst() {
        if (!this.boss) return;

        const count = 12;
        for (let i = 0; i < count; i++) {
            const angle = this.boss.angle + (Math.PI * 2 * i) / count;
            this.projectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * 2.8,
                vy: Math.sin(angle) * 2.8,
                size: 8,
                type: "boss-burst",
                trail: [],
                life: Math.floor(BULLET_LIFETIME * 0.7),
                dodgeTriggered: false
            });
        }
    }

    fireFlares() {
        const { x: worldMouseX, y: worldMouseY } = this.screenToWorld(this.mouse.x, this.mouse.y);
        const baseAngle = Math.atan2(worldMouseY - this.player.y, worldMouseX - this.player.x);
        const spread = [-0.22, 0, 0.22];

        for (const offset of spread) {
            const angle = baseAngle + offset;
            this.flares.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * 10,
                vy: Math.sin(angle) * 10,
                size: 6,
                life: FLARE_LIFE
            });
        }

        for (let i = 0; i < this.player.flareRadialShots; i++) {
            const angle = (Math.PI * 2 * i) / this.player.flareRadialShots;
            this.flares.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * 10,
                vy: Math.sin(angle) * 10,
                size: 6,
                life: FLARE_LIFE
            });
        }
    }

    getCurrentLevel() {
        return this.currentLevel;
    }

    getSecondsToNextLevel() {
        const framesIntoLevel = this.levelFrameCounter % LEVEL_DURATION_FRAMES;
        const framesRemaining = LEVEL_DURATION_FRAMES - framesIntoLevel;
        return Math.max(1, Math.ceil(framesRemaining / ASSUMED_FPS));
    }

    getAttackIntervals(level) {
        const intervals = {
            straight: Math.max(14, 55 - (level - 1) * 4),
            spiral: Math.max(40, 180 - (level - 2) * 14),
            laser: Math.max(90, 210 - (level - 3) * 12),
            tracking: Math.max(45, 230 - (level - 5) * 14),
            trackingBarrage: Math.max(130, 430 - (level - 10) * 10),
            laserBarrage: Math.max(200, 520 - (level - 20) * 10),
            predictiveLaserBurst: Math.max(260, 760 - (level - 30) * 10)
        };

        if (this.isBossLevel(level)) {
            for (const key of Object.keys(intervals)) {
                intervals[key] = Math.floor(intervals[key] * BOSS_BACKGROUND_SPAWN_FACTOR);
            }
        }

        return intervals;
    }

    cooldownFromTier(tier, start, step, min) {
        return Math.max(min, start - (Math.max(0, tier - 1) * step));
    }

    getCooldownCapTier(start, step, min) {
        return 1 + Math.ceil((start - min) / step);
    }

    getOverflowUpgradeTiers(tier, start, step, min) {
        return Math.max(0, tier - this.getCooldownCapTier(start, step, min));
    }

    formatCooldown(frames) {
        return (frames / ASSUMED_FPS).toFixed(1) + "s";
    }

    updateAbilityStats() {
        const dashOverflow = this.getOverflowUpgradeTiers(this.player.dashTier, DASH_COOLDOWN_START, DASH_COOLDOWN_STEP, DASH_COOLDOWN_MIN);
        const flareOverflow = this.getOverflowUpgradeTiers(this.player.flareTier, FLARE_COOLDOWN_START, FLARE_COOLDOWN_STEP, FLARE_COOLDOWN_MIN);

        this.player.speed = this.player.baseSpeed;
        this.player.dashCooldownMax = this.player.dashTier > 0
            ? this.cooldownFromTier(this.player.dashTier, DASH_COOLDOWN_START, DASH_COOLDOWN_STEP, DASH_COOLDOWN_MIN)
            : Infinity;
        this.player.dashDistance = this.player.dashTier > 0
            ? DASH_DISTANCE_START + dashOverflow * DASH_DISTANCE_STEP
            : 0;
        this.player.shieldCooldownMax = this.player.shieldTier > 0
            ? this.cooldownFromTier(this.player.shieldTier, SHIELD_COOLDOWN_START, SHIELD_COOLDOWN_STEP, SHIELD_COOLDOWN_MIN)
            : Infinity;
        this.player.shieldDurationFrames = this.player.shieldTier > 0
            ? Math.min(SHIELD_DURATION_MAX, SHIELD_DURATION_START + (this.player.shieldTier - 1) * SHIELD_DURATION_STEP)
            : 0;
        this.player.shieldMaxHp = this.player.shieldTier > 0
            ? 1 + Math.floor(Math.max(0, this.player.shieldTier - 1) / 2)
            : 0;
        this.player.flareCooldownMax = this.player.flareTier > 0
            ? this.cooldownFromTier(this.player.flareTier, FLARE_COOLDOWN_START, FLARE_COOLDOWN_STEP, FLARE_COOLDOWN_MIN)
            : Infinity;
        this.player.flareRadialShots = this.player.flareTier > 0
            ? flareOverflow * FLARE_RADIAL_SHOTS_STEP
            : 0;
    }

    resolveShieldExpiration() {
        if (this.player.shieldTime > 0) return;

        this.player.shieldHp = 0;
        if (this.player.shieldCooldownPending) {
            this.player.shieldCooldownPending = false;
            this.player.shieldCooldown = this.player.shieldCooldownMax;
        }
    }

    beginShopPhase() {
        this.shopActive = true;
        this.shopTimer = SHOP_DURATION_FRAMES;
        this.boss = null;
        this.projectiles = [];
        this.lasers = [];
        this.flares = [];
        this.scoreMultiplierTimer = 0;
        this.player.shieldTime = 0;
        this.player.shieldHp = 0;
    }

    beginNextLevel() {
        this.shopActive = false;
        this.currentLevel++;
        this.levelFrameCounter = 0;
        this.levelTransitionTimer = LEVEL_TRANSITION_FRAMES;
        this.projectiles = [];
        this.lasers = [];
        this.flares = [];
        this.scoreMultiplierTimer = 0;
        this.player.shieldTime = 0;
        this.player.shieldHp = 0;
        this.straightSpawnTimer = 0;
        this.spiralSpawnTimer = 0;
        this.laserSpawnTimer = 0;
        this.trackingSpawnTimer = 0;
        this.trackingBarrageSpawnTimer = 0;
        this.laserBarrageSpawnTimer = 0;
        this.predictiveLaserSpawnTimer = 0;
        this.syncBossForLevel();

        if (this.shouldSaveCheckpoint(this.currentLevel)) {
            this.saveCheckpoint();
        }
    }

    updateBoss(level) {
        if (!this.boss) return false;

        const tier = Math.floor(level / BOSS_LEVEL_INTERVAL);
        this.boss.angle += this.boss.orbitSpeed;
        const wobbleRadius = this.boss.orbitRadius + Math.sin(this.levelFrameCounter * 0.03) * 28;
        const targetX = this.player.x + Math.cos(this.boss.angle) * wobbleRadius;
        const targetY = this.player.y + Math.sin(this.boss.angle * 1.1) * (wobbleRadius * 0.72);

        this.boss.x += (targetX - this.boss.x) * 0.03;
        this.boss.y += (targetY - this.boss.y) * 0.03;

        if (this.boss.flashTimer > 0) this.boss.flashTimer--;

        this.boss.missileCooldown--;
        if (this.boss.missileCooldown <= 0) {
            this.spawnBossMissileVolley();
            this.boss.missileCooldown = Math.max(80, 160 - tier * 10);
        }

        this.boss.burstCooldown--;
        if (this.boss.burstCooldown <= 0) {
            this.spawnBossBurst();
            this.boss.burstCooldown = Math.max(105, 240 - tier * 12);
        }

        const bossTouchDistance = this.boss.size + this.player.size - 6;
        if (Math.hypot(this.player.x - this.boss.x, this.player.y - this.boss.y) < bossTouchDistance && this.player.shieldTime <= 0) {
            return this.damagePlayer(1);
        }

        return false;
    }

    applyShopChoice(choice) {
        if (choice === 1) {
            this.player.dashTier++;
        } else if (choice === 2) {
            this.player.shieldTier++;
        } else if (choice === 3) {
            this.player.flareTier++;
        } else if (choice === 4) {
            this.player.baseSpeed += SPEED_UPGRADE_AMOUNT;
        } else if (choice === 5 && this.player.hp < this.player.maxHp) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + SHOP_HEAL_AMOUNT);
        }

        this.updateAbilityStats();
        this.beginNextLevel();
    }

    tryHandleShopInput() {
        const choices = this.player.hp < this.player.maxHp
            ? ["1", "2", "3", "4", "5"]
            : ["1", "2", "3", "4"];

        for (let i = 0; i < choices.length; i++) {
            const key = choices[i];
            if (this.keys[key]) {
                this.keys[key] = false;
                this.applyShopChoice(i + 1);
                return true;
            }
        }

        return false;
    }

    tryHandleModeSelection() {
        if (this.keys["1"]) {
            this.keys["1"] = false;
            this.startNewRun(GAME_MODES.CLASSIC);
            return true;
        }

        if (this.keys["2"]) {
            this.keys["2"] = false;
            this.startNewRun(GAME_MODES.CHECKPOINT);
            return true;
        }

        if (this.keys["3"]) {
            this.keys["3"] = false;
            this.openTestingSetup();
            return true;
        }

        return false;
    }

    tryHandleTestingSetup() {
        let handled = false;

        for (const key of this.consumeTestingInputQueue()) {
            if (/^\d$/.test(key)) {
                this.appendTestingFieldDigit(key);
                handled = true;
            } else if (key === "Backspace") {
                this.removeTestingFieldDigit();
                handled = true;
            }
        }

        if (this.keys.Escape || this.keys.m || this.keys.M) {
            this.keys.Escape = false;
            this.keys.m = false;
            this.keys.M = false;
            this.commitTestingFieldBuffer();
            this.returnToModeSelect();
            return true;
        }

        if (this.keys.ArrowUp || this.keys.w || this.keys.W) {
            this.keys.ArrowUp = false;
            this.keys.w = false;
            this.keys.W = false;
            this.commitTestingFieldBuffer();
            this.testingFieldIndex = (this.testingFieldIndex + this.getTestingFields().length - 1) % this.getTestingFields().length;
            return true;
        }

        if (this.keys.ArrowDown || this.keys.s || this.keys.S) {
            this.keys.ArrowDown = false;
            this.keys.s = false;
            this.keys.S = false;
            this.commitTestingFieldBuffer();
            this.testingFieldIndex = (this.testingFieldIndex + 1) % this.getTestingFields().length;
            return true;
        }

        if (this.keys.Enter || this.keys[" "]) {
            this.keys.Enter = false;
            this.keys[" "] = false;
            this.commitTestingFieldBuffer();
            this.startTestingRun();
            return true;
        }

        return handled;
    }

    update() {
        if (this.modeSelectActive) {
            this.tryHandleModeSelection();
            return;
        }

        if (this.testingSetupActive) {
            this.tryHandleTestingSetup();
            return;
        }

        if (this.gameOver && (this.keys.m || this.keys.M)) {
            this.keys.m = false;
            this.keys.M = false;
            this.returnToModeSelect();
            return;
        }

        if (this.gameOver && this.keys.r) {
            this.keys.r = false;
            this.restartRun();
        }

        if (this.gameOver) return;

        if (this.shopActive) {
            if (!this.tryHandleShopInput()) {
                this.shopTimer--;
                if (this.shopTimer <= 0) this.beginNextLevel();
            }
            return;
        }

        if (this.levelTransitionTimer > 0) {
            this.levelTransitionTimer--;
            return;
        }

        if (this.keys.w || this.keys.ArrowUp) this.player.y -= this.player.speed;
        if (this.keys.s || this.keys.ArrowDown) this.player.y += this.player.speed;
        if (this.keys.a || this.keys.ArrowLeft) this.player.x -= this.player.speed;
        if (this.keys.d || this.keys.ArrowRight) this.player.x += this.player.speed;

        if (this.player.dashTier > 0 && this.keys[" "] && this.player.dashCooldown <= 0) {
            const { x: worldMouseX, y: worldMouseY } = this.screenToWorld(this.mouse.x, this.mouse.y);
            const { vx, vy } = this.aim(this.player.x, this.player.y, worldMouseX, worldMouseY, this.player.dashDistance);

            this.player.x += vx;
            this.player.y += vy;
            this.player.dashCooldown = this.player.dashCooldownMax;
        }

        this.recordPlayerHistory();

        if (this.player.shieldTier > 0 && this.keys.Shift && this.player.shieldTime <= 0 && this.player.shieldCooldown <= 0) {
            this.player.shieldTime = this.player.shieldDurationFrames;
            this.player.shieldHp = this.player.shieldMaxHp;
            this.player.shieldCooldownPending = true;
        }

        if (this.player.flareTier > 0 && (this.keys.f || this.keys.F) && this.player.flareCooldown <= 0) {
            this.fireFlares();
            this.player.flareCooldown = this.player.flareCooldownMax;
        }

        if (this.player.dashCooldown > 0) this.player.dashCooldown--;
        if (this.player.shieldTime > 0) this.player.shieldTime--;
        if (this.player.shieldCooldown > 0) this.player.shieldCooldown--;
        if (this.player.hitInvulnerability > 0) this.player.hitInvulnerability--;
        this.resolveShieldExpiration();
        if (this.player.flareCooldown > 0) this.player.flareCooldown--;
        if (this.scoreMultiplierTimer > 0) this.scoreMultiplierTimer--;

        this.levelFrameCounter++;
        const level = this.getCurrentLevel();
        if (!this.isBossLevel(level) && this.levelFrameCounter >= LEVEL_DURATION_FRAMES) {
            this.beginShopPhase();
            return;
        }

        const intervals = this.getAttackIntervals(level);

        if (this.isBossLevel(level) && this.updateBoss(level)) {
            return;
        }

        this.straightSpawnTimer++;
        if (this.straightSpawnTimer > intervals.straight) {
            const { x, y } = this.getSpawnOutsideView();
            this.spawnProjectile(x, y);
            this.straightSpawnTimer = 0;
        }

        if (level >= 2) {
            this.spiralSpawnTimer++;
            if (this.spiralSpawnTimer > intervals.spiral) {
                const { x, y } = this.getSpawnOutsideView();
                this.spawnSpiral(x, y);
                this.spiralSpawnTimer = 0;
            }
        } else {
            this.spiralSpawnTimer = 0;
        }

        if (level >= 3) {
            this.laserSpawnTimer++;
            if (this.laserSpawnTimer > intervals.laser) {
                this.spawnLaserWarning();
                this.laserSpawnTimer = 0;
            }
        } else {
            this.laserSpawnTimer = 0;
        }

        if (level >= 5) {
            this.trackingSpawnTimer++;
            if (this.trackingSpawnTimer > intervals.tracking) {
                const { x, y } = this.getSpawnOutsideView();
                this.spawnTrackingProjectile(x, y);
                this.trackingSpawnTimer = 0;
            }
        } else {
            this.trackingSpawnTimer = 0;
        }

        if (level >= 10) {
            this.trackingBarrageSpawnTimer++;
            if (this.trackingBarrageSpawnTimer > intervals.trackingBarrage) {
                this.spawnTrackingBarrage();
                this.trackingBarrageSpawnTimer = 0;
            }
        } else {
            this.trackingBarrageSpawnTimer = 0;
        }

        if (level >= 20) {
            this.laserBarrageSpawnTimer++;
            if (this.laserBarrageSpawnTimer > intervals.laserBarrage) {
                this.spawnLaserBarrage();
                this.laserBarrageSpawnTimer = 0;
            }
        } else {
            this.laserBarrageSpawnTimer = 0;
        }

        if (level >= 30) {
            this.predictiveLaserSpawnTimer++;
            if (this.predictiveLaserSpawnTimer > intervals.predictiveLaserBurst) {
                this.spawnPredictiveLaserBurst();
                this.predictiveLaserSpawnTimer = 0;
            }
        } else {
            this.predictiveLaserSpawnTimer = 0;
        }

        for (const projectile of this.projectiles) {
            if (this.isTrackingProjectile(projectile)) {
                const target = this.aim(projectile.x, projectile.y, this.player.x, this.player.y, projectile.speed || 2.4);
                projectile.vx += (target.vx - projectile.vx) * (projectile.turnRate || 0.05);
                projectile.vy += (target.vy - projectile.vy) * (projectile.turnRate || 0.05);
            }

            projectile.x += projectile.vx;
            projectile.y += projectile.vy;

            if (
                this.isTrackingProjectile(projectile) &&
                projectile.screenLifeBonusPending &&
                this.isCircleOnScreen(projectile.x, projectile.y, projectile.size)
            ) {
                projectile.life += TRACKING_ONSCREEN_LIFETIME_BONUS;
                projectile.screenLifeBonusPending = false;
            }

            projectile.life--;
            if (projectile.bossSafeFrames > 0) projectile.bossSafeFrames--;

            projectile.trail.push({ x: projectile.x, y: projectile.y });
            if (projectile.trail.length > 10) projectile.trail.shift();
        }

        for (const flare of this.flares) {
            flare.x += flare.vx;
            flare.y += flare.vy;
            flare.life--;
        }

        const removedProjectiles = new Set();
        const removedFlares = new Set();
        for (let i = 0; i < this.flares.length; i++) {
            if (removedFlares.has(i)) continue;

            for (let j = 0; j < this.projectiles.length; j++) {
                if (removedProjectiles.has(j)) continue;

                const flare = this.flares[i];
                const projectile = this.projectiles[j];
                const dist = Math.hypot(flare.x - projectile.x, flare.y - projectile.y);
                if (dist < flare.size + projectile.size) {
                    removedFlares.add(i);
                    removedProjectiles.add(j);
                    this.addScore(0.2);
                    break;
                }
            }
        }

        this.projectiles = this.projectiles.filter((projectile, index) => projectile.life > 0 && !removedProjectiles.has(index));
        this.flares = this.flares.filter((flare, index) => flare.life > 0 && !removedFlares.has(index));

        if (this.boss) {
            const bossRemovedProjectiles = new Set();
            for (let i = 0; i < this.projectiles.length; i++) {
                const projectile = this.projectiles[i];
                if (projectile.owner !== "boss" || !projectile.bossDamage || projectile.bossSafeFrames > 0) continue;

                const dist = Math.hypot(projectile.x - this.boss.x, projectile.y - this.boss.y);
                if (dist < this.boss.size + projectile.size) {
                    bossRemovedProjectiles.add(i);
                    this.boss.hp -= projectile.bossDamage;
                    this.boss.flashTimer = 8;
                    this.camera.shake = Math.max(this.camera.shake, 10);
                    this.addScore(0.8);
                }
            }

            if (bossRemovedProjectiles.size > 0) {
                this.projectiles = this.projectiles.filter((projectile, index) => !bossRemovedProjectiles.has(index));
            }

            if (this.boss.hp <= 0) {
                this.addScore(8 + level);
                this.beginShopPhase();
                return;
            }
        }

        if (this.player.shieldTime > 0 && this.player.shieldHp > 0) {
            const shieldRadius = this.player.size + 20;
            const removedByShield = new Set();
            for (let i = 0; i < this.projectiles.length; i++) {
                if (this.player.shieldHp <= 0) break;

                const projectile = this.projectiles[i];
                const dist = Math.hypot(projectile.x - this.player.x, projectile.y - this.player.y);
                if (dist < shieldRadius + projectile.size) {
                    removedByShield.add(i);
                    this.player.shieldHp--;
                    this.addScore(0.15);
                    if (this.player.shieldHp <= 0) {
                        this.player.shieldTime = 0;
                        this.resolveShieldExpiration();
                        break;
                    }
                }
            }

            if (removedByShield.size > 0) {
                this.projectiles = this.projectiles.filter((projectile, index) => !removedByShield.has(index));
            }
        }

        const playerHitProjectiles = new Set();
        for (let i = 0; i < this.projectiles.length; i++) {
            const projectile = this.projectiles[i];
            const dist = Math.hypot(projectile.x - this.player.x, projectile.y - this.player.y);
            const closeDodgeDistance = this.player.size + CLOSE_DODGE_RADIUS;

            if (!projectile.dodgeTriggered && dist < closeDodgeDistance && dist > this.player.size) {
                projectile.dodgeTriggered = true;
                this.triggerCloseDodge();
            }

            if (dist < this.player.size) {
                if (this.player.shieldTime <= 0) {
                    playerHitProjectiles.add(i);
                    this.damagePlayer(1);
                }
            }
        }

        if (playerHitProjectiles.size > 0) {
            this.projectiles = this.projectiles.filter((projectile, index) => !playerHitProjectiles.has(index));
        }

        for (const laser of this.lasers) {
            if (!laser.fired) {
                laser.warning--;

                if (laser.warning <= 0) {
                    laser.fired = true;
                    laser.flash = LASER_FLASH_TIME;

                    const dist = this.pointToSegmentDistance(
                        this.player.x,
                        this.player.y,
                        laser.x1,
                        laser.y1,
                        laser.x2,
                        laser.y2
                    );

                    if (dist < this.player.size + laser.width / 2) {
                        if (this.player.shieldTime > 0) {
                            if (laser.type === "predictive") {
                                this.player.shieldHp = 0;
                                this.player.shieldTime = 0;
                                this.resolveShieldExpiration();
                            } else {
                                this.player.shieldHp = Math.max(0, this.player.shieldHp - LASER_SHIELD_DAMAGE);
                                if (this.player.shieldHp <= 0) {
                                    this.player.shieldTime = 0;
                                    this.resolveShieldExpiration();
                                }
                            }
                        } else {
                            this.damagePlayer(1);
                        }
                    }
                }
            } else {
                laser.flash--;
            }
        }

        this.lasers = this.lasers.filter((laser) => !laser.fired || laser.flash > 0);

        this.camera.x += (this.player.x - this.getViewWidth() / 2 - this.camera.x) * 0.1;
        this.camera.y += (this.player.y - this.getViewHeight() / 2 - this.camera.y) * 0.1;

        if (this.camera.shake > 0) this.camera.shake *= 0.9;

        this.addScore(0.02);
    }

    draw() {
        const ctx = this.ctx;
        const viewScale = this.getViewScale();
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const shakeX = (Math.random() - 0.5) * this.camera.shake;
        const shakeY = (Math.random() - 0.5) * this.camera.shake;

        ctx.save();
        ctx.setTransform(
            viewScale,
            0,
            0,
            viewScale,
            -this.camera.x * viewScale + shakeX,
            -this.camera.y * viewScale + shakeY
        );

        if (this.player.hitInvulnerability > 0 && Math.floor(this.player.hitInvulnerability / 3) % 2 === 0) {
            ctx.globalAlpha = 0.45;
        }
        ctx.fillStyle = this.player.shieldTime > 0 ? "cyan" : "white";
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, this.player.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        const closeDodgeDistance = this.player.size + CLOSE_DODGE_RADIUS;
        ctx.strokeStyle = this.scoreMultiplierTimer > 0 ? "rgba(255, 220, 80, 0.95)" : "rgba(255, 220, 80, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, closeDodgeDistance, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        if (this.player.shieldTime > 0) {
            ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.player.x, this.player.y, this.player.size + 10, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (this.boss) {
            ctx.fillStyle = this.boss.flashTimer > 0 ? "#fff3a6" : "#ff8c5a";
            ctx.beginPath();
            ctx.arc(this.boss.x, this.boss.y, this.boss.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "rgba(255, 220, 120, 0.9)";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.boss.x, this.boss.y, this.boss.size + 12, 0, Math.PI * 2);
            ctx.stroke();

            const bossHealthWidth = this.boss.size * 2.2;
            const healthRatio = Math.max(0, this.boss.hp / this.boss.maxHp);
            const healthX = this.boss.x - bossHealthWidth / 2;
            const healthY = this.boss.y - this.boss.size - 26;

            ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
            ctx.fillRect(healthX, healthY, bossHealthWidth, 8);
            ctx.fillStyle = "#ff6767";
            ctx.fillRect(healthX, healthY, bossHealthWidth * healthRatio, 8);
        }

        for (const flare of this.flares) {
            ctx.fillStyle = "deepskyblue";
            ctx.beginPath();
            ctx.arc(flare.x, flare.y, flare.size, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const laser of this.lasers) {
            ctx.beginPath();
            ctx.moveTo(laser.x1, laser.y1);
            ctx.lineTo(laser.x2, laser.y2);
            const isPredictiveLaser = laser.type === "predictive";

            if (!laser.fired) {
                const pulse = 0.2 + (Math.sin(Date.now() * 0.02) + 1) * 0.15;
                ctx.setLineDash([16, 12]);
                ctx.strokeStyle = isPredictiveLaser
                    ? `rgba(255, 170, 60, ${0.28 + pulse * 0.9})`
                    : `rgba(255, 80, 80, ${pulse})`;
                ctx.lineWidth = laser.width;
            } else {
                ctx.setLineDash([]);
                ctx.strokeStyle = isPredictiveLaser
                    ? "rgba(255, 140, 30, 0.98)"
                    : "rgba(255, 40, 40, 0.95)";
                ctx.lineWidth = laser.width + 12;
            }

            ctx.lineCap = "round";
            ctx.stroke();
        }
        ctx.setLineDash([]);

        for (const projectile of this.projectiles) {
            const isTracking = this.isTrackingProjectile(projectile);

            ctx.strokeStyle = isTracking ? "rgba(181,107,255,0.35)" : "rgba(255,0,0,0.3)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            projectile.trail.forEach((trailPoint, index) => {
                if (index === 0) ctx.moveTo(trailPoint.x, trailPoint.y);
                else ctx.lineTo(trailPoint.x, trailPoint.y);
            });
            ctx.stroke();

            ctx.fillStyle = isTracking ? "#b56bff" : "red";
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, projectile.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        ctx.fillStyle = "white";
        ctx.font = "20px Arial";
        ctx.fillText("Score: " + this.score.toFixed(0), 20, 30);
        ctx.fillText(
            this.selectedGameMode === GAME_MODES.TESTING ? "High Score: Disabled" : "High Score: " + this.highScore.toFixed(0),
            20,
            56
        );
        ctx.fillText("HP: " + this.formatHp(this.player.hp) + " / " + this.formatHp(this.player.maxHp), 20, 82);

        const multiplierTimeLeft = Math.ceil(this.scoreMultiplierTimer / ASSUMED_FPS);
        const multiplierLabel = this.getScoreMultiplier().toFixed(1).replace(".0", "");
        ctx.fillStyle = this.scoreMultiplierTimer > 0 ? "#ffe46e" : "rgba(255,255,255,0.7)";
        ctx.fillText(
            "Multiplier: x" + multiplierLabel + (this.scoreMultiplierTimer > 0 ? " (" + multiplierTimeLeft + "s)" : ""),
            20,
            108
        );
        ctx.fillStyle = "white";

        const level = this.getCurrentLevel();
        const bossFightActive = this.isBossLevel(level);
        const secondsToNextLevel = bossFightActive ? null : this.getSecondsToNextLevel();
        ctx.fillText("Mode: " + this.getModeLabel(), 20, 134);
        ctx.fillText("Level: " + level, 20, 160);
        ctx.fillText(bossFightActive ? "Boss Fight: Defeat the core" : "Next Level: " + secondsToNextLevel + "s", 20, 186);

        let infoY = 212;
        if (this.selectedGameMode === GAME_MODES.CHECKPOINT && this.checkpointData) {
            ctx.fillText("Respawn Level: " + this.checkpointData.level, 20, infoY);
            infoY += 26;
        } else if (this.selectedGameMode === GAME_MODES.TESTING) {
            ctx.fillText("Test Respawn: Level " + this.testingConfig.startLevel, 20, infoY);
            infoY += 26;
        }

        if (bossFightActive && this.boss) {
            ctx.fillText("Boss HP: " + this.boss.hp + " / " + this.boss.maxHp, 20, infoY);
            infoY += 26;
        }

        const dashStatus = this.player.dashTier === 0
            ? "Locked"
            : (this.player.dashCooldown > 0 ? Math.ceil(this.player.dashCooldown / ASSUMED_FPS) + "s" : "Ready") +
            (this.player.dashDistance > DASH_DISTANCE_START ? " | " + this.player.dashDistance + " range" : "");
        const shieldStatus = this.player.shieldTier === 0
            ? "Locked"
            : (this.player.shieldTime > 0
                ? "Active (" + this.player.shieldHp + " HP)"
                : (this.player.shieldCooldown > 0 ? Math.ceil(this.player.shieldCooldown / ASSUMED_FPS) + "s" : "Ready"));
        const flareStatus = this.player.flareTier === 0
            ? "Locked"
            : (this.player.flareCooldown > 0 ? Math.ceil(this.player.flareCooldown / ASSUMED_FPS) + "s" : "Ready") +
            (this.player.flareRadialShots > 0 ? " | +" + this.player.flareRadialShots + " radial" : "");
        const abilityStartY = infoY;
        ctx.fillText("Dash [Space]: " + dashStatus, 20, abilityStartY);
        ctx.fillText("Shield [Shift]: " + shieldStatus, 20, abilityStartY + 26);
        ctx.fillText("Flares [F]: " + flareStatus, 20, abilityStartY + 52);

        if (this.modeSelectActive) {
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.84)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.font = "bold 56px Arial";
            ctx.fillText("SELECT MODE", this.canvas.width / 2, 120);
            ctx.font = "24px Arial";
            ctx.fillText("1. Classic  -  Death restarts from Level 1", this.canvas.width / 2, 240);
            ctx.fillText("2. Checkpoint  -  Saves after Levels 5, 10, 15...", this.canvas.width / 2, 290);
            ctx.fillText("      You restart from the next level after that checkpoint", this.canvas.width / 2, 324);
            ctx.fillText("3. Testing  -  Pick your level and upgrades", this.canvas.width / 2, 374);
            ctx.fillText("      High score is disabled and deaths restart at that setup", this.canvas.width / 2, 408);
            ctx.fillStyle = "rgba(255,255,255,0.82)";
            ctx.font = "20px Arial";
            ctx.fillText("High Score: " + this.highScore.toFixed(0), this.canvas.width / 2, 480);
            ctx.fillText("Press 1, 2, or 3 to begin", this.canvas.width / 2, 530);
            ctx.restore();
        } else if (this.testingSetupActive) {
            const fields = this.getTestingFields();
            const previewSpeed = 4 + this.testingConfig.speedUps * SPEED_UPGRADE_AMOUNT;

            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.font = "bold 52px Arial";
            ctx.fillText("TESTING SETUP", this.canvas.width / 2, 100);
            ctx.font = "21px Arial";
            ctx.fillText("High scores are disabled in Testing mode", this.canvas.width / 2, 145);
            ctx.fillText("Up/Down: select  |  Type numbers: set value  |  Enter: start  |  Esc: back", this.canvas.width / 2, 178);

            ctx.font = "24px Arial";
            fields.forEach((field, index) => {
                const y = 260 + index * 54;
                const displayValue = this.getTestingFieldDisplayValue(field) + (this.testingFieldBufferKey === field.key ? "|" : "");
                ctx.fillStyle = index === this.testingFieldIndex ? "#ffe46e" : "white";
                ctx.fillText(field.label + ": " + displayValue, this.canvas.width / 2, y);
            });

            ctx.fillStyle = "rgba(255,255,255,0.82)";
            ctx.font = "20px Arial";
            ctx.fillText("Preview Base Speed: " + previewSpeed.toFixed(1), this.canvas.width / 2, 620);
            ctx.fillText("Backspace removes digits from the selected field", this.canvas.width / 2, 655);
            ctx.fillText("Deaths restart from the selected level and loadout", this.canvas.width / 2, 690);
            ctx.restore();
        } else if (this.shopActive) {
            const timeLeft = Math.max(0, Math.ceil(this.shopTimer / ASSUMED_FPS));
            const nextDash = this.cooldownFromTier(this.player.dashTier + 1, DASH_COOLDOWN_START, DASH_COOLDOWN_STEP, DASH_COOLDOWN_MIN);
            const nextShield = this.cooldownFromTier(this.player.shieldTier + 1, SHIELD_COOLDOWN_START, SHIELD_COOLDOWN_STEP, SHIELD_COOLDOWN_MIN);
            const nextShieldDuration = Math.min(SHIELD_DURATION_MAX, SHIELD_DURATION_START + this.player.shieldTier * SHIELD_DURATION_STEP);
            const nextShieldHp = 1 + Math.floor(this.player.shieldTier / 2);
            const nextFlare = this.cooldownFromTier(this.player.flareTier + 1, FLARE_COOLDOWN_START, FLARE_COOLDOWN_STEP, FLARE_COOLDOWN_MIN);
            const currentDashOverflow = this.getOverflowUpgradeTiers(this.player.dashTier, DASH_COOLDOWN_START, DASH_COOLDOWN_STEP, DASH_COOLDOWN_MIN);
            const nextDashOverflow = this.getOverflowUpgradeTiers(this.player.dashTier + 1, DASH_COOLDOWN_START, DASH_COOLDOWN_STEP, DASH_COOLDOWN_MIN);
            const nextDashDistance = DASH_DISTANCE_START + nextDashOverflow * DASH_DISTANCE_STEP;
            const currentFlareOverflow = this.getOverflowUpgradeTiers(this.player.flareTier, FLARE_COOLDOWN_START, FLARE_COOLDOWN_STEP, FLARE_COOLDOWN_MIN);
            const nextFlareOverflow = this.getOverflowUpgradeTiers(this.player.flareTier + 1, FLARE_COOLDOWN_START, FLARE_COOLDOWN_STEP, FLARE_COOLDOWN_MIN);
            const nextFlareRadialShots = nextFlareOverflow * FLARE_RADIAL_SHOTS_STEP;
            const canBuyHeal = this.player.hp < this.player.maxHp;

            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.font = "bold 56px Arial";
            ctx.fillText("SHOP", this.canvas.width / 2, 90);
            ctx.font = "22px Arial";
            ctx.fillText("Choose one upgrade for Level " + (this.currentLevel + 1) + "  |  " + timeLeft + "s", this.canvas.width / 2, 130);

            ctx.font = "24px Arial";
            ctx.fillText("1. Dash  -> " + (nextDashOverflow > currentDashOverflow
                ? "+" + (nextDashDistance - this.player.dashDistance) + " range (" + nextDashDistance + " total)"
                : this.formatCooldown(nextDash) + " cooldown"), this.canvas.width / 2, 210);
            ctx.fillText(
                "2. Shield -> " + this.formatCooldown(nextShield) + ", " + this.formatCooldown(nextShieldDuration) + ", " + nextShieldHp + " HP",
                this.canvas.width / 2,
                250
            );
            ctx.fillText("3. Flares -> " + (nextFlareOverflow > currentFlareOverflow
                ? "+" + (nextFlareRadialShots - this.player.flareRadialShots) + " radial flares"
                : this.formatCooldown(nextFlare) + " cooldown"), this.canvas.width / 2, 290);
            ctx.fillText("4. Base Speed + " + SPEED_UPGRADE_AMOUNT.toFixed(1), this.canvas.width / 2, 330);
            if (canBuyHeal) {
                ctx.fillText(
                    "5. Repair + " + SHOP_HEAL_AMOUNT + " HP (" + this.formatHp(this.player.hp) + " -> " +
                    this.formatHp(Math.min(this.player.maxHp, this.player.hp + SHOP_HEAL_AMOUNT)) + ")",
                    this.canvas.width / 2,
                    370
                );
            }

            ctx.font = "19px Arial";
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fillText(
                "Shield cooldown now begins when the shield ends. Normal lasers deal " + LASER_SHIELD_DAMAGE + " shield damage.",
                this.canvas.width / 2,
                canBuyHeal ? 458 : 418
            );
            ctx.fillText(
                "Press " + (canBuyHeal ? "1-5" : "1-4") + " to buy. If time runs out, no upgrade is selected.",
                this.canvas.width / 2,
                canBuyHeal ? 488 : 448
            );
            ctx.restore();
        } else if (!this.gameOver && this.levelTransitionTimer > 0) {
            const progress = this.levelTransitionTimer / LEVEL_TRANSITION_FRAMES;
            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + progress * 0.4})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + progress * 0.5})`;
            ctx.textAlign = "center";
            ctx.font = "bold 62px Arial";
            ctx.fillText((this.isBossLevel(level) ? "BOSS LEVEL " : "LEVEL ") + level, this.canvas.width / 2, this.canvas.height / 2 - 10);
            ctx.font = "24px Arial";
            ctx.fillText(this.isBossLevel(level) ? "Turn its missiles back on it" : "Get Ready", this.canvas.width / 2, this.canvas.height / 2 + 34);
            ctx.restore();
        }

        if (this.gameOver) {
            const restartTarget = this.selectedGameMode === GAME_MODES.TESTING
                ? "Level " + this.testingConfig.startLevel
                : (this.selectedGameMode === GAME_MODES.CHECKPOINT && this.checkpointData
                    ? "Level " + this.checkpointData.level
                    : "Level 1");

            ctx.save();
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.font = "bold 44px Arial";
            ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 2 - 30);
            ctx.font = "24px Arial";
            ctx.fillText("Press R to restart from " + restartTarget, this.canvas.width / 2, this.canvas.height / 2 + 12);
            ctx.fillText("Press M to return to mode select", this.canvas.width / 2, this.canvas.height / 2 + 48);
            ctx.restore();
        }
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}
