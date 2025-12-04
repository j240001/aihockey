// ==========================================
// STRATEGY: "SMART BALANCED v2" (BT1)
// ==========================================
// - North-South Passing (No endless horizontal cycling)
// - Dump & Chase Logic (If entry is blocked)
// - Patience (Skates with puck if open)
// ==========================================

(function() { 

    const STRATEGY_ID = "BT1_Smart";

    // --- 1. THE BLACKBOARD (Senses) ---
    function makeBB(p) {
        // Direction & Goals
        const myGoalX    = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal  = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1;

        // Zones
        const blueLineX     = RX + (110 * forwardDir); 
        // "Neutral Zone" relative to the team (Past red line, before blue line)
        const inNeutralZone = (forwardDir === 1) ? (p.x > RX && p.x < blueLineX) : (p.x < RX && p.x > blueLineX);
        const inOffZone     = (forwardDir === 1) ? (p.x > blueLineX) : (p.x < blueLineX);

        // Distances
        const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);
        
        // Pressure Check (Am I about to get hit?)
        let isUnderPressure = false;
        for(const o of players) {
            if(o.team !== p.team && Math.hypot(p.x - o.x, p.y - o.y) < 60) {
                isUnderPressure = true; 
                break;
            }
        }

        // Entry Blocked Check (Is there a wall at the blue line?)
        // Check a point 100px ahead
        const entryBlocked = isLaneBlocked(p.x, p.y, p.x + (forwardDir*150), p.y, p.team);

        return {
            p, role: p.role, forwardDir,
            myGoalX, enemyGoal,
            inNeutralZone, inOffZone, distToNet,
            isUnderPressure, entryBlocked,
            
            hasPuck:    (puck.ownerId === p.id),
            loosePuck:  (puck.ownerId === null),
            oppHasPuck: (getPlayerById(puck.ownerId)?.team !== p.team && puck.ownerId !== null),
            
            // Look for teammates
            teammates: players.filter(m => m.team === p.team && m.id !== p.id && m.type === "skater")
        };
    }

    // --- 2. ACTIONS ---

    const actChase = (bb) => ({ tx: puck.x, ty: puck.y, action: "none" });
    const actShoot = (bb) => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" });

    // NEW: PROGRESSIVE PASSING (North-South Only)
    const actSmartPass = (bb) => {
        // 1. Don't pass if we just got it (calms the jitter)
        if (bb.p.possessionTime < 10) return null; 

        let bestTarget = null;
        let bestScore = -999;

        for (const mate of bb.teammates) {
            // RULE: Only pass if mate is CLOSER to net than me (Forward Progress)
            // (Unless I am in deep trouble, then panic pass is ok)
            const myDist = Math.hypot(bb.p.x - bb.enemyGoal, bb.p.y - RY);
            const mateDist = Math.hypot(mate.x - bb.enemyGoal, mate.y - RY);
            
            if (!bb.isUnderPressure && mateDist >= myDist) continue; 

            // Check Lane
            if (isLaneBlocked(bb.p.x, bb.p.y, mate.x, mate.y, bb.p.team)) continue;

            let score = 1000 - mateDist;
            if (score > bestScore) {
                bestScore = score;
                bestTarget = mate;
            }
        }

        if (bestTarget) {
            return { tx: bestTarget.x, ty: bestTarget.y, action: "pass", target: bestTarget };
        }
        return null;
    };

    // NEW: DUMP IN (The Trap Buster)
    const actDumpIn = (bb) => {
        // Target the corner (deep zone)
        const cornerY = (puck.y < RY) ? RY + 200 : RY - 200; // Opposite corner
        return { tx: bb.enemyGoal, ty: cornerY, action: "shoot" }; // "Shoot" acts as a hard pass/dump
    };

    // DRIVING (With Evasion)
    const actDrive = (bb) => {
        // If entry is blocked, maybe shift lane?
        // For now, just drive net
        return { tx: bb.enemyGoal, ty: RY, action: "none" };
    };

    // DEFENSE
    const actGapControl = (bb) => {
        const carrier = getPlayerById(puck.ownerId);
        if (!carrier) return { tx: bb.myGoalX, ty: RY, action: "none" };
        const midX = (carrier.x + bb.myGoalX) / 2;
        return { tx: midX, ty: (carrier.y + RY)/2, action: "none" };
    };


    // --- 3. THE BRAIN ---
    function think(p) {
        const bb = makeBB(p);

        // --- OFFENSE ---
        if (bb.hasPuck) {
            
            // 1. SHOOT: If close and open
            if (bb.distToNet < 180) {
                return actShoot(bb); 
            }

            // 2. DUMP & CHASE: If in Neutral Zone AND Wall Ahead
            // This is the specific counter to "The Trap"
            if (bb.inNeutralZone && bb.entryBlocked) {
                // Only dump if we are actually under pressure (don't dump if we have time to think)
                if (bb.isUnderPressure || bb.p.vx < 0.5) { // or if we are stalled
                    return actDumpIn(bb);
                }
            }

            // 3. PASS: Look for a forward teammate
            const pass = actSmartPass(bb);
            if (pass) return pass;

            // 4. DRIVE: Skate it yourself
            return actDrive(bb);
        }

        // --- DEFENSE ---
        if (bb.oppHasPuck) {
            return actGapControl(bb);
        }

        // --- LOOSE PUCK ---
        return actChase(bb);
    }

    // --- 4. REGISTER ---
    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "Smart v2",
            "Maple Leafs",
            "TOR",
            think,
            { main: "#0033cc", secondary: "#6699ff" } // Deep Blue - Light Blue
        );
    }

})();