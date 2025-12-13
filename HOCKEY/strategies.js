// =========================================================
// AI STRATEGY REGISTRY (The "Coach" System)
// =========================================================

const Strategies = {};

// Register a new Brain into the game
// id: Unique key (e.g., "BT9_Smart")
// behaviorName: Description of logic (e.g., "Smart Passing")
// teamName: Franchise Name (e.g., "The Oilers")
// code: Scoreboard Code (e.g., "EDM")
// thinkFn: The logic function
// colors: Object { main: "#hex", secondary: "#hex" }
function registerStrategy(id, behaviorName, teamName, code, thinkFn, colors) {
    
    // Default colors if not provided
    const theme = colors || { main: "#888888", secondary: "#ffffff" };

    Strategies[id] = {
        id: id,
        behaviorName: behaviorName, // "Smart Passing"
        teamName: teamName,         // "The Oilers" (Shown in Menu)
        code: code,                 // "EDM" (Shown on Scoreboard)
        think: thinkFn,
        colors: theme
    };
    console.log(`🧠 Registered: ${teamName} [${code}] using ${behaviorName}`);
}

// Global Pointers
let Team0_Strategy = null; 
let Team1_Strategy = null;