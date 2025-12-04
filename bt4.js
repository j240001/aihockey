// ==========================================
// STRATEGY: "THE FINISHER" (BT4 v4)
// ==========================================
// - Identity: Cycle & Walk-Out
// - FIX: SHOOTING PRIORITY #1. (No more waiting for "Behind Net" state)
// - LOGIC: If I am in the slot/circles, I shoot. Period.
// - TACTIC: If not in shooting range, *then* I cycle.
// ==========================================

(function() { 

    const STRATEGY_ID = "BT4_Cycle";

    // --- 1. SENSES ---
    function makeBB(p) {
        const myGoalX    = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal  = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1;

        // Distances
        const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);
        
        // "Good Ice" (The Slot + Circles)
        // If we are within 140px of net, we are dangerous.
        const inShootingRange = (distToNet < 140);

        // Check if I am literally behind the goal line
        const isBehindNet = (forwardDir === 1) ? (p.x > enemyGoal) : (p.x < enemyGoal);

        const carrier = getPlayerById(puck.ownerId);

        return {
            p, forwardDir, myGoalX, enemyGoal,
            distToNet, inShootingRange, isBehindNet,
            hasPuck:    (puck.ownerId === p.id),
            teamHasPuck: (carrier && carrier.team === p.team),
            oppHasPuck: (carrier && carrier.team !== p.team),
            loosePuck:  (puck.ownerId === null),
            
            teammates: players.filter(m => m.team === p.team && m.id !== p.id && m.type === "skater")
        };
    }

    // --- 2. ACTIONS ---

    const actShoot = (bb) => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" });
    
    // Cycle Logic
    const actGoBehindNet = (bb) => {
        const targetX = bb.enemyGoal + (bb.forwardDir * 40);
        return { tx: targetX, ty: RY, action: "none" };
    };

    // The Walk-Out (Drive to the "Dot")
    const actWalkOut = (bb) => {
        const sideY = (bb.p.y < RY) ? RY - 100 : RY + 100;
        const targetX = bb.enemyGoal - (bb.forwardDir * 50); 
        return { tx: targetX, ty: sideY, action: "none" };
    };

    // Off-Ball Support
    const actCrashNet = (bb) => {
        const targetX = bb.enemyGoal - (bb.forwardDir * 50); 
        // Variance to avoid stacking
        const offset = (bb.p.id % 2 === 0) ? 30 : -30;
        return { tx: targetX, ty: RY + offset, action: "none" };
    }

    const actDefend = (bb) => {
        const midX = (puck.x + bb.myGoalX) / 2;
        return { tx: midX, ty: RY, action: "none" };
    };
    const actChase = (bb) => ({ tx: puck.x, ty: puck.y, action: "none" });


    // --- 3. THINK ---
    function think(p) {
        const bb = makeBB(p);

        // --- OFFENSE (CARRIER) ---
        if (bb.hasPuck) {
            
            // PRIORITY 1: THE "JUST SHOOT IT" OVERRIDE
            // If we are in range and NOT behind the net... Fire.
            if (bb.inShootingRange && !bb.isBehindNet) {
                return actShoot(bb);
            }

            // PRIORITY 2: THE WALK-OUT
            // If we are behind the net, try to walk out to the dot.
            if (bb.isBehindNet) {
                // Check if we walked out far enough to see the goal
                const inFront = (bb.forwardDir === 1) ? (p.x < bb.enemyGoal) : (p.x > bb.enemyGoal);
                if (inFront) return actShoot(bb);
                
                return actWalkOut(bb);
            }

            // PRIORITY 3: SETUP THE CYCLE
            // If we are deep but not in shooting range, go behind or curl
            if (bb.distToNet < 220) {
                // If we are central, go behind to start the chaos
                if (Math.abs(p.y - RY) < 40) return actGoBehindNet(bb);
                
                // If wide, drive to the Walk-Out point (The Dot)
                return actWalkOut(bb);
            }

            // PRIORITY 4: ENTRY
            // Drive Wide to set up the deep game
            const entryY = (p.id % 2 === 0) ? RY + 110 : RY - 110;
            return { tx: bb.enemyGoal, ty: entryY, action: "none" };
        }

        // --- OFFENSE (OFF-BALL) ---
        if (bb.teamHasPuck) {
            // Everyone crashes the net to pick up rebounds from the shooter
            return actCrashNet(bb);
        }

        // --- DEFENSE ---
        if (bb.oppHasPuck) return actDefend(bb);

        // --- LOOSE ---
        return actChase(bb);
    }

    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "The Finisher",
            "Predators",
            "NSH",
            think,
            { main: "#e8b610", secondary: "#001d75" }
        );
    }

})();