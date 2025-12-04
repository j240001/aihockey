// ==========================================
// STRATEGY: BT6 ELITE v6 (Fortress Defense)
// ==========================================
// - DEFENSE: TIGHT BOX + SHOT BLOCKS + AGGRO HITS
// - GAP: getAggressiveGapTarget (Helpers)
// - D-ZONE: Closest Chase + Others Seal Net
// - BACKCHECK: Hit Rushes Hard
// - OFFENSE: UNCHANGED (Shoot/Pass Elite)
// ==========================================

(function() { 

    const STRATEGY_ID = "BT6_Elite";
    const STRATEGY_NAME = "Elite Swarm v6 (Fortress)";

    // --- 1. BLACKBOARD (Added shotBlockRange) ---
    function makeBB(p) {
        const myGoalX   = (p.team === 0) ? goal1 : goal2;
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1;
        const blueLineX = RX + (110 * forwardDir);
        const defBlueX  = RX - (110 * forwardDir);

        const carrier = getPlayerById(puck.ownerId);
        
        const puckInDefZone  = (forwardDir === 1) ? (puck.x < defBlueX)  : (puck.x > defBlueX);
        const puckInOffZone  = (forwardDir === 1) ? (puck.x > blueLineX) : (puck.x < blueLineX);
        const playerInOffZone = (forwardDir === 1) ? (p.x > blueLineX)   : (p.x < blueLineX);
        
        const isDelayedOffside = (offsideState.active && offsideState.team === p.team);
        let mustStayOnside = !offensiveZoneAllowed(p);
        mustStayOnside = mustStayOnside && !puckInDefZone;

        const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);
        const distToPuck = Math.hypot(puck.x - p.x, puck.y - p.y);
        const carrierDistToNet = carrier ? Math.hypot(carrier.x - myGoalX, carrier.y - RY) : 999;
        
        let amIClosest = true;
        for (const m of players) {
            if (m.team === p.team && m.id !== p.id && m.type === "skater" && 
                Math.hypot(puck.x - m.x, puck.y - m.y) < distToPuck) {
                amIClosest = false; break;
            }
        }

        const underPressure = isPressured(p);
        
        const fwds = players.filter(m => m.team === p.team && m.id !== p.id && 
                                        (m.role === "LW" || m.role === "C" || m.role === "RW"));
        const defs = players.filter(m => m.team === p.team && m.id !== p.id && 
                                        (m.role === "LD" || m.role === "RD"));

        let myOpenness = 100;
        for (const o of players) if (o.team !== p.team) myOpenness = Math.min(myOpenness, 100 - Math.hypot(o.x - p.x, o.y - p.y) * 0.5);

        return {
            p, role: p.role, forwardDir, myGoalX, enemyGoal, puckInDefZone,
            blueLineX, puckInOffZone, playerInOffZone,
            isDelayedOffside, mustStayOnside,
            distToNet, distToPuck, carrierDistToNet, amIClosest, underPressure, myOpenness,
            carrier, hasPuck: (puck.ownerId === p.id),
            teamHasPuck: (carrier && carrier.team === p.team),
            oppHasPuck: (carrier && carrier.team !== p.team),
            loosePuck: (puck.ownerId === null),
            fwds, defs
        };
    }

    // --- 2. ACTIONS (Defense Boost) ---

    const actTagUp = (bb) => {
        const safeX = bb.blueLineX - (bb.forwardDir * 40);
        return { tx: safeX, ty: RY, action: "none" };
    };

    const actHoverBlue = (bb) => {
        const holdX = bb.blueLineX - (bb.forwardDir * 25);
        let holdY = clamp(puck.y, RY - 100, RY + 100);
        if (bb.role === "LW") holdY = Math.min(holdY, RY - 40);
        if (bb.role === "RW") holdY = Math.max(holdY, RY + 40);
        return { tx: holdX, ty: holdY, action: "none" };
    };

    const actChase = (bb) => {
        const intercept = getPuckIntercept(bb.p);
        return { tx: intercept.x, ty: intercept.y, action: "none" };
    };

    // *** AGGRO HIT: Wider + Lead ***
    const actHit = (bb) => {
        if (!bb.carrier) return { tx: RX, ty: RY, action: "none" };
        const lead = 35;  // More aggressive
        return { tx: bb.carrier.x + bb.carrier.vx * lead, ty: bb.carrier.y + bb.carrier.vy * lead, action: "none" };
    };

    const actShoot = (bb) => {
        const spread = (Math.random() - 0.5) * 15;
        return { tx: bb.enemyGoal, ty: RY + spread, action: "shoot" };
    };

    const actSmartPass = (bb) => {
        let best = null, bestScore = -Infinity;
        for (const mate of bb.fwds.concat(bb.defs)) {
            if (isLaneBlocked(bb.p.x, bb.p.y, mate.x, mate.y, bb.p.team)) continue;
            
            if (bb.forwardDir * (mate.x - bb.p.x) <= 0) continue;
            
            let openness = 100;
            for (const o of players) if (o.team !== bb.p.team) openness = Math.min(openness, 100 - Math.hypot(o.x - mate.x, o.y - mate.y) * 0.6);
            
            const myDist = Math.hypot(bb.p.x - bb.enemyGoal, bb.p.y - RY);
            const mateDist = Math.hypot(mate.x - bb.enemyGoal, mate.y - RY);
            if (mateDist >= myDist - 30) continue;
            
            const laneToNet = isLaneBlocked(mate.x, mate.y, bb.enemyGoal, RY, bb.p.team) ? -60 : 70;
            
            const score = openness + (myDist - mateDist) * 0.15 + laneToNet;
            if (score > bestScore) { bestScore = score; best = mate; }
        }
        if (best && bestScore > 80) {
            const dx = best.x - bb.p.x;
            const dy = best.y - bb.p.y;
            const dist = Math.hypot(dx, dy);
            const leadTime = dist / 15;
            const tx = best.x + best.vx * leadTime;
            const ty = best.y + best.vy * leadTime;
            return { tx, ty, action: "pass", target: best };
        }
        return null;
    };

    const actDump = (bb) => {
        const cornerY = puck.y > RY ? RY - 160 : RY + 160;
        return { tx: bb.enemyGoal, ty: cornerY, action: "shoot" };
    };

    // *** ENHANCED GAP: Helpers + Tight D-Zone ***
    const actGap = (bb) => {
        if (!bb.carrier) return { tx: RX, ty: RY, action: "none" };
        // Use helper for aggressive positioning
        const gapTarget = getAggressiveGapTarget(bb.p, bb.carrier, bb.myGoalX);
        if (gapTarget && gapTarget.tx) {
            return { tx: gapTarget.tx, ty: gapTarget.ty, action: "none" };
        }
        // Fallback tight gap
        const distNetCarrier = bb.carrierDistToNet;
        let gapDist = Math.max(25, Math.min(70, distNetCarrier * 0.45));
        if (bb.puckInDefZone) gapDist *= 0.7;  // Tighter
        const angle = Math.atan2(bb.carrier.y - RY, bb.carrier.x - bb.myGoalX);
        const gx = bb.myGoalX + Math.cos(angle) * gapDist;
        const gy = RY + Math.sin(angle) * gapDist;
        return { tx: gx, ty: gy, action: "none" };
    };

    // *** TIGHTER BOX: Seal Net (LD/RD low, C slot, F crease wings) ***
    const getBoxSpot = (bb) => {
        const dir = bb.forwardDir;
        if (bb.role === "LD") return { x: bb.myGoalX + dir * 20, y: RY - 45 };  // Low left
        if (bb.role === "RD") return { x: bb.myGoalX + dir * 20, y: RY + 45 };  // Low right
        if (bb.role === "C")  return { x: bb.myGoalX + dir * 40, y: RY };       // High slot
        if (bb.role === "LW") return { x: bb.myGoalX + dir * 35, y: RY - 75 };  // Crease left
        if (bb.role === "RW") return { x: bb.myGoalX + dir * 35, y: RY + 75 };  // Crease right
        return { x: bb.myGoalX + dir * 30, y: RY };
    };

    const getSupportSpot = (bb) => {
        const dir = bb.forwardDir;
        const biasX = dir * 20;
        if (bb.puckInDefZone) {
            if (bb.role === "C") return { x: RX + biasX, y: RY };
            if (bb.role === "LW") return { x: RX + biasX, y: RY - 120 };
            if (bb.role === "RW") return { x: RX + biasX, y: RY + 120 };
            return { x: bb.myGoalX + dir * 60, y: RY + (Math.random() > 0.5 ? 60 : -60) };
        }
        const openY = bb.carrier ? clamp(bb.carrier.y + (bb.role === "LW" ? -60 : bb.role === "RW" ? 60 : 0), RY-100, RY+100) : RY;
        if (bb.role === "C") return { x: RX + dir * 30 + biasX, y: openY };
        if (bb.role === "LW") return { x: RX + dir * 20 + biasX, y: RY - 100 };
        if (bb.role === "RW") return { x: RX + dir * 20 + biasX, y: RY + 100 };
        return { x: bb.blueLineX - dir * 15, y: openY };
    };

    const getOffSpot = (bb) => {
        const dir = bb.forwardDir;
        if (bb.puckInOffZone) {
            const openY = RY + (bb.role === "LW" ? -70 : bb.role === "RW" ? 70 : 0) + (Math.random() - 0.5) * 25;
            if (bb.role === "C") return { x: bb.enemyGoal - dir * 60, y: openY };
            if (bb.role === "LW") return { x: bb.enemyGoal - dir * 80, y: RY - 80 };
            if (bb.role === "RW") return { x: bb.enemyGoal - dir * 80, y: RY + 80 };
            return { x: bb.enemyGoal - dir * 100, y: openY };
        }
        return getSupportSpot(bb);
    };

    // --- 3. FORTRESS THINK (Defense Priority) ---
    function think(p) {
        const bb = makeBB(p);

        if (bb.isDelayedOffside) return actTagUp(bb);

        if (bb.mustStayOnside && !bb.hasPuck) return actHoverBlue(bb);

        // OFFENSE UNCHANGED
        if (bb.hasPuck) {
            const shotLane = !isLaneBlocked(bb.p.x, bb.p.y, bb.enemyGoal, RY, bb.p.team);
            if ((bb.distToNet < 160 || (bb.distToNet < 220 && shotLane)) && bb.myOpenness > 30) {
                return actShoot(bb);
            }
            
            const pass = actSmartPass(bb);
            if (pass) return pass;
            
            if (bb.underPressure && bb.puckInDefZone) return actDump(bb);
            
            return { tx: bb.enemyGoal, ty: RY, action: "none" };
        }

        if (bb.teamHasPuck) {
            return { tx: getSupportSpot(bb).x, ty: getSupportSpot(bb).y, action: "none" };
        }

        // *** DEFENSE: PRIORITY HITS + TIGHT BOX/GAP ***
        if (bb.oppHasPuck) {
            // D-ZONE: IMMEDIATE BOX (Seal)
            if (bb.puckInDefZone) {
                // Closest pressures, others box
                if (bb.amIClosest || bb.role === "C") {
                    return actHit(bb);  // C/F pressure carrier
                }
                return { tx: getBoxSpot(bb).x, ty: getBoxSpot(bb).y, action: "none" };
            }
            // NEUTRAL/O: BACKCHECK HIT FIRST
            const hitDist = Math.hypot(bb.carrier ? bb.carrier.x : puck.x - bb.p.x, bb.carrier ? bb.carrier.y : puck.y - bb.p.y);
            if (hitDist < 120) {  // Wider range
                return actHit(bb);
            }
            // Gap/Block
            if (bb.carrierDistToNet < 140) {
                return actGap(bb);  // Block shot lanes
            }
            return actGap(bb);
        }

        // LOOSE PUCK D-ZONE: Closest Chase + Box
        if (bb.loosePuck && bb.puckInDefZone) {
            if (bb.amIClosest) return actChase(bb);
            return { tx: getBoxSpot(bb).x, ty: getBoxSpot(bb).y, action: "none" };
        }

        if (bb.amIClosest || bb.distToPuck < 150) return actChase(bb);
        
        return { tx: getOffSpot(bb).x, ty: getOffSpot(bb).y, action: "none" };
    }

    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "The Elite",
            "Jets",
            "WPG",
            think,
            { main: "#4070ff", secondary: "#ffffff" }
        );
    }

})();