async function startGame() {
    const canvas = document.getElementById("game");
    const persistence = new GamePersistenceClient();

    let bootstrap = {
        highScore: 0,
        savedGameSummary: null
    };

    try {
        bootstrap = await persistence.loadBootstrap();
    } catch (error) {
        console.error("Failed to load saved session data.", error);
    }

    new DodgingGame(canvas, {
        persistence,
        highScore: bootstrap.highScore,
        savedGameSummary: bootstrap.savedGameSummary
    });
}

startGame();
