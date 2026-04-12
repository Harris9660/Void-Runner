class GamePersistenceClient {
    async request(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                ...(options.headers ?? {})
            },
            ...options
        });

        let payload = null;
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
            payload = await response.json();
        }

        if (!response.ok) {
            const message = payload?.error || `Request failed with status ${response.status}`;
            throw new Error(message);
        }

        return payload;
    }

    loadBootstrap() {
        return this.request(API_ENDPOINTS.BOOTSTRAP, {
            method: "GET",
            headers: {}
        });
    }

    saveHighScore(highScore) {
        return this.request(API_ENDPOINTS.HIGH_SCORE, {
            method: "POST",
            body: JSON.stringify({ highScore })
        });
    }

    loadSavedGame() {
        return this.request(API_ENDPOINTS.SAVED_GAME, {
            method: "GET",
            headers: {}
        });
    }

    saveGame(gameState) {
        return this.request(API_ENDPOINTS.SAVED_GAME, {
            method: "POST",
            body: JSON.stringify({ gameState })
        });
    }

    clearSavedGame() {
        return this.request(API_ENDPOINTS.SAVED_GAME, {
            method: "DELETE"
        });
    }
}
