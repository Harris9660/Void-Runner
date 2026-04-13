class Player {
    constructor(progress = {}) {
        this.x = START_POSITION.x;
        this.y = START_POSITION.y;
        this.size = 15;
        this.maxHp = PLAYER_MAX_HP;
        this.hp = PLAYER_MAX_HP;
        this.hitInvulnerability = 0;
        this.baseSpeed = progress.baseSpeed ?? 4;
        this.speed = progress.baseSpeed ?? 4;
        this.dashCooldown = 0;
        this.shieldTime = 0;
        this.shieldCooldown = 0;
        this.flareCooldown = 0;
        this.dashTier = progress.dashTier ?? 0;
        this.shieldTier = progress.shieldTier ?? 0;
        this.flareTier = progress.flareTier ?? 0;
        this.dashCooldownMax = Infinity;
        this.dashDistance = 0;
        this.shieldCooldownMax = Infinity;
        this.shieldDurationFrames = 0;
        this.shieldMaxHp = 0;
        this.shieldHp = 0;
        this.shieldCooldownPending = false;
        this.flareCooldownMax = Infinity;
        this.flareRadialShots = 0;
    }

    getProgress() {
        return {
            baseSpeed: this.baseSpeed,
            dashTier: this.dashTier,
            shieldTier: this.shieldTier,
            flareTier: this.flareTier
        };
    }
}

class Boss {
    constructor(level, player) {
        const tier = Math.floor(level / BOSS_LEVEL_INTERVAL);
        const maxHp = (8 + tier * 4) * 2;

        this.x = player.x + 260;
        this.y = player.y - 180;
        this.size = Math.max(100, 46 + tier * 4);
        this.hp = maxHp;
        this.maxHp = maxHp;
        this.angle = Math.random() * Math.PI * 2;
        this.orbitRadius = 240 + tier * 2;
        this.orbitSpeed = 0.008 + tier * 0.0001;
        this.missileCooldown = 90;
        this.burstCooldown = 150;
        this.flashTimer = 0;
    }
}
