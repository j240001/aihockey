// ==========================================
// STRATEGY: THE MACHINE (BT5 v6)
// ==========================================
// - OFFENSE: Possession-based, but drives lanes.
// - DEFENSE: Zone Defense with ACTIVE PRESSURE (No more statues).
// - LOGIC: "If I am closest, I work. If not, I cover."
// ==========================================

(function() { 

    const STRATEGY_ID = "BT5_Machine";

    // --- 1. SENSES ---
    function makeBB(p) {
        const myGoalX    = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal  = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1;

        const carrier = getPlayerById(puck.ownerId);
        
        // Am I closest to the puck?
        let amIClosest = true;
        const myDist = Math.hypot(p.x - puck.x, p.y - puck.y);
        const myTeam = players.filter(m => m.team === p.team && m.id !== p.id && m.type === "skater");
        for (const m of myTeam) {
            const d = Math.hypot(m.x - puck.x, m.y - puck.y);
            if (d < myDist) { amIClosest = false; break; }
        }

        // Zone Definitions
        const blueLineX = RX + (110 * forwardDir);
        const puckInOffZone = (forwardDir === 1) ? (puck.x > blueLineX) : (puck.x < blueLineX);
        const puckInDefZone = (forwardDir === 1) ? (puck.x < RX - 110) : (puck.x > RX + 110);
        
        const isDelayedOffside = (offsideState.active && offsideState.team === p.team);

        return {
            p, role: p.role, 
            forwardDir, myGoalX, enemyGoal,
            amIClosest,
            puckInOffZone, puckInDefZone, blueLineX,
            isDelayedOffside,
            hasPuck:    (puck.ownerId === p.id),
            teamHasPuck: (carrier && carrier.team === p.team),
            oppHasPuck: (carrier && carrier.team !== p.team),
            loosePuck:  (puck.ownerId === null),
            teammates: myTeam
        };
    }

    // --- 2. ACTIONS ---

    const actTagUp = (bb) => {
        const safeX = bb.blueLineX - (bb.forwardDir * 50); 
        return { tx: safeX, ty: RY, action: "none" };
    };

    const actChase = (bb) => ({ tx: puck.x, ty: puck.y, action: "none" });
    const actDriveNet = (bb) => ({ tx: bb.enemyGoal, ty: RY, action: "none" });
    const actShoot = (bb) => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" });

    // NEW SMART PASSING
    // Only pass if we are pressured OR if the target is wide open ahead
    const actSmartPass = (bb) => {
        let bestTarget = null;
        let bestScore = -999;
        
        for (const mate of bb.teammates) {
            // Don't pass through enemies
            if (isLaneBlocked(bb.p.x, bb.p.y, mate.x, mate.y, bb.p.team)) continue;

            let score = 0;
            
            // 1. Forward Progress is good
            const distForward = (mate.x - bb.p.x) * bb.forwardDir;
            if (distForward > 0) score += 50; 
            
            // 2. Openness is CRITICAL
            if (isPressured(mate)) score -= 200; // Never pass to covered guy
            else score += 100;

            if (score > bestScore) { bestScore = score; bestTarget = mate; }
        }

        // Threshold: Only pass if the option is actually good (> 50)
        if (bestTarget && bestScore > 50) {
            return { tx: bestTarget.x, ty: bestTarget.y, action: "pass", target: bestTarget };
        }
        return null; // Keep puck
    };

    // POSITIONAL LOGIC
    function getDefensiveSpot(bb) {
        // D-Men protect the slot
        if (bb.role === "LD" || bb.role === "RD") {
            const sideY = (bb.role === "LD") ? RY - 40 : RY + 40; // Tighter slot protection
            return { x: bb.myGoalX + (bb.forwardDir * 80), y: sideY };
        }
        // Wingers cover the points/boards
        if (bb.role === "RW" || bb.role === "LW") {
            const sideY = (bb.role === "RW") ? RY + 100 : RY - 100;
            return { x: bb.myGoalX + (bb.forwardDir * 180), y: sideY };
        }
        // Center helps low
        return { x: bb.myGoalX + (bb.forwardDir * 60), y: RY };
    }


    // --- 3. THINK ---
    function think(p) {
        const bb = makeBB(p);

        // PRIORITY 1: OFFSIDE CHECK
        if (bb.isDelayedOffside) return actTagUp(bb);

        // --- A. I HAVE PUCK ---
        if (bb.hasPuck) {
            const distToNet = Math.hypot(bb.enemyGoal - p.x, RY - p.y);
            
            // 1. Shoot if close
            if (distToNet < 160) return actShoot(bb);

            // 2. If pressured, try to pass
            if (isPressured(p)) {
                const pass = actSmartPass(bb);
                if (pass) return pass;
            }

            // 3. Otherwise, DRIVE (Don't stop and look for passes)
            return actDriveNet(bb);
        }

        // --- B. TEAMMATE HAS PUCK ---
        if (bb.teamHasPuck) {
            // If puck is NOT in Off Zone yet, hold the line (Don't go offside)
            if (!bb.puckInOffZone && bb.forwardDir * (p.x - bb.blueLineX) > -20) {
                return { tx: bb.blueLineX - (bb.forwardDir * 40), ty: p.y, action: "none" };
            }
            // Go to net
            return actDriveNet(bb);
        }

        // --- C. OPPONENT HAS PUCK (THE FIX) ---
        if (bb.oppHasPuck) {
            
            // RULE 1: If I am the closest person to the puck, I MUST ATTACK.
            // (This fixes the "statue" bug where they watched the carrier skate by)
            if (bb.amIClosest) {
                return actChase(bb);
            }

            // RULE 2: If the puck carrier is deep in my zone, D-men must collapse.
            if (bb.puckInDefZone && (bb.role === "LD" || bb.role === "RD" || bb.role === "C")) {
                 // Even if not closest, pinch in if they are threatening goal
                 return { tx: puck.x, ty: puck.y, action: "none" };
            }

            // RULE 3: Otherwise, play Position (Zone Defense)
            const spot = getDefensiveSpot(bb);
            return { tx: spot.x, ty: spot.y, action: "none" };
        }

        // --- D. LOOSE PUCK ---
        if (bb.amIClosest) return actChase(bb);
        
        // Support the chaser
        if (bb.puckInOffZone) return { tx: puck.x, ty: puck.y, action: "none" };
        
        // Fallback
        return actChase(bb);
    }

    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "The Machine",
            "Canucks",
            "VAN",
            think,
            { main: "#009cc7", secondary: "#0845ff" }   // teal - blue
        );
    }

})();