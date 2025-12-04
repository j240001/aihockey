// ==========================================
// STRATEGY: THE TRAP (BT3) - Revised v3
// ==========================================
// - Defense: Still traps in Neutral Zone when opponent has control.
// - Offense: Drives deeper before shooting.
// - Forecheck: Now chases loose pucks in O-Zone instead of fleeing.
// ==========================================

(function() {

    const STRATEGY_ID   = "BT3_Trap";
    const STRATEGY_NAME = "The Trap v3"; 

    function makeBB(p) {
        // Directional Math
        const myGoalX    = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal  = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1; 

        // Zone Math
        const blueLineX     = RX + (110 * forwardDir); 
        const puckInOffZone = (forwardDir === 1) ? (puck.x > blueLineX) : (puck.x < blueLineX);

        const carrier = getPlayerById(puck.ownerId);
        
        // Distance for shooting logic
        const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);

        return {
            p, forwardDir, myGoalX, enemyGoal,
            puckInOffZone, distToNet,
            hasPuck:    (puck.ownerId === p.id),
            oppHasPuck: (carrier && carrier.team !== p.team),
            loosePuck:  (puck.ownerId === null)
        };
    }

    // --- ACTIONS ---

    // A. OFFENSE: Drive deeper!
    const actCounterAttack = (bb) => {
        // OLD LOGIC: Shot at 200px (Too far)
        // NEW LOGIC: Drive to 120px (Hash marks)
        if (bb.distToNet > 120) {
            return { tx: bb.enemyGoal, ty: RY, action: "none" };
        }
        // Once close, shoot
        return { tx: bb.enemyGoal, ty: RY, action: "shoot" };
    };

    // B. TRAP: Retreat to the Neutral Zone (The "Wall")
    const actRetreatToTrap = (bb) => {
        let yOffset = 0;
        if (bb.p.role === "C") yOffset = 0;
        else if (bb.p.role === "RW" || bb.p.role === "LW") yOffset = -60;
        else if (bb.p.role === "LD" || bb.p.role === "RD") yOffset = 60;

        const trapX = RX - (bb.forwardDir * 50); 
        return { tx: trapX, ty: RY + yOffset, action: "none" };
    };

    // C. DEFENSE: Collapse to the Net
    const actCollapse = (bb) => {
        const slotX = bb.myGoalX + (bb.forwardDir * 80); // Tight collapse
        return { tx: slotX, ty: RY, action: "none" };
    };
    
    // D. CHASE
    const actChase = (bb) => ({ tx: puck.x, ty: puck.y, action: "none" });


    // --- THE BRAIN ---
    function think(p) {
        const bb = makeBB(p);

        // 1. WE HAVE PUCK: Drive the net
        if (bb.hasPuck) {
            return actCounterAttack(bb); 
        }

        // 2. OPPONENT HAS PUCK
        if (bb.oppHasPuck) {
            // If they are deep in their zone -> TRAP (Don't chase deep)
            if (bb.puckInOffZone) {
                return actRetreatToTrap(bb);
            }
            // If they cross the blue line -> COLLAPSE
            return actCollapse(bb);
        }

        // 3. LOOSE PUCK (THE FIX)
        // OLD: If puckInOffZone -> Retreat (This is why they never scored)
        // NEW: If puckInOffZone -> CHASE IT! (Sustain pressure)
        if (bb.puckInOffZone) {
            return actChase(bb);
        }
        
        // Default: Chase loose pucks elsewhere
        return actChase(bb);
    }

    if (typeof registerStrategy === "function") {
       registerStrategy(
            STRATEGY_ID,
            "The Trap",
            "Stars",
            "DAL",    
            think,
            { main: "#006600", secondary: "#000000" }    // green - black
        );
    }

})();