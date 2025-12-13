// ==========================================
// STRATEGY: THE GRINDER (BT2)
// ==========================================
// - Aggressive Forecheck
// - Hits anything that moves
// - Shoots immediately upon touching puck
// ==========================================

(function() {

    const STRATEGY_ID   = "BT2_Grinder";
    const STRATEGY_NAME = "The Grinders"; 

    function makeBB(p) {
        // Standard Directional Setup
        const myGoalX    = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal  = (p.team === 0) ? goal2 : goal1;
        const carrier    = getPlayerById(puck.ownerId);

        return {
            p, enemyGoal, carrier,
            hasPuck: (puck.ownerId === p.id),
            oppHasPuck: (carrier && carrier.team !== p.team),
            loosePuck: (puck.ownerId === null)
        };
    }

    // --- ACTIONS ---
    const actChase = (bb) => ({ tx: puck.x, ty: puck.y, action: "none" });
    
    const actBodyCheck = (bb) => {
        if (!bb.carrier) return null;
        // Aim 20px *through* the opponent to ensure a collision
        const tx = bb.carrier.x + (bb.carrier.vx * 15); 
        const ty = bb.carrier.y + (bb.carrier.vy * 15);
        return { tx: tx, ty: ty, action: "none" };
    };

    const actShoot = (bb) => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" });


    // --- MAIN THINK FUNCTION ---
    function think(p) {
        const bb = makeBB(p);

        // 1. OFFENSE: If I have it, Shoot. (No passing ever)
        if (bb.hasPuck) {
            return actShoot(bb);
        }

        // 2. DEFENSE: If they have it, Kill.
        if (bb.oppHasPuck) {
            return actBodyCheck(bb);
        }

        // 3. NEUTRAL: Chase puck blindly.
        return actChase(bb);
    }

    // Register
    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "The Grinders", 
            "Flames",
            "CGY",
            think,
            { main: "#cc0000", secondary: "#ff4444" } // Deep Red - Bright Red             
        );
    }

})();