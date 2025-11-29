// ==========================================
// TEAM 0 (BLUE) - THE "OFFENSIVE TRIANGLE"
// ==========================================


function think(p) {
     
    const hasPuck = (p.id === puck.ownerId);
    const carrier = getPuckCarrier();
    const opponentHasPuck = (carrier && carrier.team !== p.team);
    const loose = (puck.ownerId === null);

    // CALCULATE LANE OFFSET
    // -1 (Left) becomes -80px, 1 (Right) becomes +80px
    const myLaneY = RY + ((p.laneBias || 0) * 80);


// -----------------------------------------
// ROLE C — Primary Attacker (SMARTER FORECHECK)
// -----------------------------------------
if (p.role === "C") {
    const attackGoalX = (p.team === 0) ? goal2 : goal1;
    const attackingRight = (attackGoalX > RX);
    const dir = attackingRight ? 1 : -1;
    const hasPuck = (p.id === puck.ownerId);

    // 1. C HAS PUCK (Offense - largely unchanged)
    if (hasPuck) {
        // A. Behind Net Check
        const netMove = solveBehindNet(p);
        if (netMove) return netMove;

        // B. Scoring Logic
        const shot = evaluateShot(p);
        if (shot.good) {
            p.angle = Math.atan2(shot.y - p.y, shot.x - p.x);
            return { tx: shot.x, ty: shot.y, action: "shoot", target: null };
        }

        // C. Drive / Cycle
        const postY = (p.y < RY) ? RY - 20 : RY + 20;
        if (!isLaneBlocked(p.x, p.y, attackGoalX, postY, p.team)) {
            return { tx: attackGoalX, ty: postY, action: "none" };
        }
        return { tx: attackGoalX, ty: (p.y < RY ? RINK_MIN_Y+40 : RINK_MAX_Y-40), action: "none" };
    }

    // 2. NO PUCK (FORECHECK & DEFENSE)
    
    // A. LOOSE PUCK: Chase it... UNLESS it is behind the enemy net and we are blocked
    if (puck.ownerId === null) {
         return { tx: puck.x, ty: puck.y, action: "none" };
    }

    const carrier = getPlayerById(puck.ownerId);

    // B. OPPONENT HAS PUCK (FORECHECK)
    if (carrier && carrier.team !== p.team) {
        
        // CHECK: Is the puck in OUR Defensive Zone? (Backcheck)
        const defBlueLine = attackingRight ? LEFT_BLUE_LINE : RIGHT_BLUE_LINE;
        const puckInDefZone = attackingRight ? (puck.x < defBlueLine) : (puck.x > defBlueLine);

        if (puckInDefZone) {
            // BACKCHECK: Go to the high slot in our own zone
            const defendGoalX = attackingRight ? goal1 : goal2;
            return { tx: defendGoalX + (dir * 180), ty: RY, action: "none" };
        } 
        else {
            // *** SMARTER FORECHECK ***
            // If the carrier is the GOALIE or behind the net, DO NOT SLAM INTO THEM.
            // Park in front of the net to cut off the pass.
            
            const carrierIsBehind = attackingRight ? (carrier.x > attackGoalX) : (carrier.x < attackGoalX);
            
            if (carrierIsBehind) {
                // Trap them! Sit on the post.
                return { tx: attackGoalX - (dir * 40), ty: carrier.y, action: "none" };
            }
            
            // Otherwise, attack the carrier
            return { tx: carrier.x, ty: carrier.y, action: "none" };
        }
    }

    // C. TEAMMATE HAS PUCK
    return { tx: attackGoalX - (dir * 60), ty: RY, action: "none" };
}


// -----------------------------------------
// ROLE B — PLAYMAKER (THE "HIGH MAN")
// -----------------------------------------
if (p.role === "B") {
    const attackGoalX = (p.team === 0) ? goal2 : goal1;
    const attackingRight = (attackGoalX > RX);
    const dir = attackingRight ? 1 : -1;

    // 1. HAS PUCK (Standard Playmaker Logic)
    if (hasPuck) {
        // ... (Keep your existing Has Puck logic here, or paste simpler version below) ...
        let bestTapIn = null;
        for (const mate of players) {
            if (mate.team === p.team && mate.id !== p.id) {
                const d = Math.hypot(attackGoalX - mate.x, RY - mate.y);
                if (d < 120 && !isLaneBlocked(p.x, p.y, mate.x, mate.y, p.team)) bestTapIn = mate;
            }
        }
        if (bestTapIn) return { tx: bestTapIn.x, ty: bestTapIn.y, action: "pass", target: bestTapIn };

        // Shoot if open, otherwise cycle
        const shot = evaluateShot(p);
        if (shot.good) return { tx: attackGoalX, ty: RY, action: "shoot" };
        
        return { tx: attackGoalX, ty: RY, action: "none" };
    }

    // 2. NO PUCK (SMARTER SUPPORT)
    
    // A. LOOSE PUCK
    if (loose) {
        // *** FIX FOR BONEHEAD BEHAVIOR ***
        // If the puck is in the OFFENSIVE zone, do NOT dogpile with Role C.
        // Stay in the "High Slot" (F3 position) to catch rebounds or prevent breakouts.
        
        const offBlueLine = attackingRight ? RIGHT_BLUE_LINE : LEFT_BLUE_LINE;
        const inOffZone = attackingRight ? (puck.x > offBlueLine) : (puck.x < offBlueLine);
        const distToPuck = Math.hypot(puck.x - p.x, puck.y - p.y);

        if (inOffZone && distToPuck > 100) {
            // Hover at the faceoff dots / High Slot
            return { tx: attackGoalX - (dir * 180), ty: RY, action: "none" };
        }
        
        // Only chase if we are in Neutral/Defensive zone, or very close to it
        return roleC_loosePuck(p);
    }

    // B. OPPONENT HAS PUCK
    if (opponentHasPuck) {
        const carrier = getPuckCarrier();
        
        // Check Zone
        const defBlueLine = attackingRight ? LEFT_BLUE_LINE : RIGHT_BLUE_LINE;
        const puckInDefZone = attackingRight ? (puck.x < defBlueLine) : (puck.x > defBlueLine);

        if (!puckInDefZone) {
            // *** TRAP LOGIC ***
            // If opponent is still in their end, DO NOT run back to our goalie.
            // Guard the Neutral Zone / Blue Line.
            const trapX = RX; // Center Ice
            return { tx: trapX, ty: carrier ? carrier.y : RY, action: "none" };
        }
        
        // If they cross our blue line, THEN collapse to defense
        return roleC_supportDefense(p);
    }

    // C. TEAMMATE HAS PUCK
    // Stay wide/high for a pass
    const slotX = attackGoalX - (dir * 150);
    return { tx: attackGoalX, ty: myLaneY, action: "none" };
}



// -----------------------------------
// ROLE A — DEFENSIVE ANCHOR
// -----------------------------------
if (p.role === "A") {
    
    // If Role A has the puck → do NOT skate backward, PASS immediately
    if (hasPuck) {

        // ----------------------------------------------------------------
        // 1. SIMPLE FORWARD PASS (Role A breakout priority)
        // ----------------------------------------------------------------
        let bestMate = null;
        let bestDist = 99999;
 
        for (const t of players) {
            if (t.team !== p.team) continue;
            if (t === p) continue;

            // teammate must be *in front* of Role A (offense direction)
            const attackGoalX = (p.team === 0) ? goal2 : goal1;
            const forward = Math.sign(attackGoalX - p.x) === Math.sign(t.x - p.x);

            if (!forward) continue;

            const d = Math.hypot(t.x - p.x, t.y - p.y);
            if (d < bestDist) {
                bestDist = d;
                bestMate = t;
            }
        }

        // If ANY teammate is ahead → pass to him (ignore strict rules)
        if (bestMate) {
            return {
                tx: bestMate.x,
                ty: bestMate.y,
                action: "pass",
                target: bestMate
            };
        }

        // ----------------------------------------------------------------
        // 2. Fallback to the original strict pass logic
        // ----------------------------------------------------------------
        const pass = evaluatePassOptions(p);
        if (pass.good) {
            return {
                tx: pass.teammate.x,
                ty: pass.teammate.y,
                action: "pass",
                target: pass.teammate
            };
        }

        // ----------------------------------------------------------------
        // 3. No pass? Move the puck slightly forward
        // ----------------------------------------------------------------
        const safeX = p.x + ((p.team === 0) ? 40 : -40);
        return { tx: safeX, ty: p.y, action: "none" };
    }



        // If puck is loose → chase only if closest
        if (loose) {
            if (isClosestTeammateToTarget(p, puck)) {
                return roleB_loosePuck(p);
            }
            return roleA_goalieProtector(p);
        }

        // If opponent has puck → protect goalie / block threat
        if (opponentHasPuck) {
            return roleA_goalieProtector(p);
        }

        // Teammate has puck:
        // DO NOT join the rush — stay deeper than all opponents.
        let lowestOpp = null;
        let bestX = 99999;

        for (const o of players) {
            if (o.team !== p.team && o.type === "skater") {
                if (o.x < bestX) {  // team 0 attacks right, so lowest X = most dangerous
                    bestX = o.x;
                    lowestOpp = o;
                }
            }
        }

        if (lowestOpp) {
            // stay between lowest opponent and our own goalie
            const gx = (p.team === 0) ? goal1 : goal2;
            return {
                tx: (lowestOpp.x + gx) / 2,
                ty: (lowestOpp.y + RY) / 2,
                action: "none"
            };
        }

        // fallback (no opponents?)
        const gx = (p.team === 0) ? goal1 : goal2;
        // Stay a bit in front of the goal line, in YOUR lane
        return { tx: gx + ((p.team===0)?40:-40), ty: myLaneY, action: "none" };
    }


// -----------------------------------------
// ROLE B — PLAYMAKER (GRADIENT LOGIC)
// -----------------------------------------
if (p.role === "B") {

    // 1. Define Attack Target dynamically
    const attackGoalX = (p.team === 0) ? goal2 : goal1;
    const attackingRight = (attackGoalX > RX);

    if (hasPuck) {
        
        const distToGoal = Math.hypot(attackGoalX - p.x, RY - p.y);

        // =========================================================
        // PRIORITY 1: THE "TAP-IN" SCAN (Teammate on doorstep)
        // =========================================================
        // Before being selfish, check if someone has an easy goal.
        let bestTapIn = null;
        let closestDist = 999;

        for (const mate of players) {
            if (mate.team !== p.team || mate.id === p.id) continue;

            // Distance from teammate to ENEMY GOAL
            const mateDistToGoal = Math.hypot(attackGoalX - mate.x, RY - mate.y);

            // Condition: Teammate is VERY close to net (< 110px) 
            // AND they are "open" (lane not blocked)
            if (mateDistToGoal < 110) {
                if (!isLaneBlocked(p.x, p.y, mate.x, mate.y, p.team)) {
                    if (mateDistToGoal < closestDist) {
                        closestDist = mateDistToGoal;
                        bestTapIn = mate;
                    }
                }
            }
        }

        // If we found a wide-open teammate at the net, PASS.
        if (bestTapIn) {
            return {
                tx: bestTapIn.x,
                ty: bestTapIn.y,
                action: "pass",
                target: bestTapIn
            };
        }

        // =========================================================
        // PRIORITY 2: THE GRADIENT SHOT (Urgency vs Distance)
        // =========================================================
        
        // Calculate "Urgency" (0.0 to 1.0)
        // 0px away = 1.0 (Desperate to shoot)
        // 300px away = 0.0 (Calm)
        // Formula: 1 - (CurrentDist / MaxDist)
        let urgency = 1.0 - (distToGoal / 300);
        if (urgency < 0) urgency = 0;

        // A. HIGH URGENCY (> 60%): SHOOT AT WILL
        // If we are close (< 120px), we don't care about blockers.
        // We try to jam it through. We DO NOT look for backward passes.
        if (urgency > 0.6) {
             p.angle = Math.atan2(RY - p.y, attackGoalX - p.x);
             return { tx: attackGoalX, ty: RY, action: "shoot", target: null };
        }

        // B. MEDIUM URGENCY (> 30%): SMART SHOOTING
        // If we are mid-range, we shoot ONLY if evaluateShot says it's a "Good" shot.
        if (urgency > 0.3) {
            const shot = evaluateShot(p);
            if (shot.good) {
                p.angle = Math.atan2(shot.y - p.y, shot.x - p.x);
                return { tx: shot.x, ty: shot.y, action: "shoot", target: null };
            }
        }

        // =========================================================
        // PRIORITY 3: ATTACKING PASS (Forward Only)
        // =========================================================
        // If we aren't shooting, look for Skater C, but ONLY if he is ahead.
        let skaterC = players.find(m => m.team === p.team && m.role === "C");
        if (skaterC) {
            const cIsAhead = (attackingRight) ? (skaterC.x > p.x) : (skaterC.x < p.x);
            if (cIsAhead && !isLaneBlocked(p.x, p.y, skaterC.x, skaterC.y, p.team)) {
                return { tx: skaterC.x, ty: skaterC.y, action: "pass", target: skaterC };
            }
        }

        // =========================================================
        // PRIORITY 4: SAFETY / CYCLE (The "Look Back")
        // =========================================================
        // We only reach this code if:
        // 1. No tap-in option.
        // 2. Too far to force a shot.
        // 3. No good shot angle.
        // 4. No forward pass to C.
        
        // Now we check pressure. If pressured, we cycle (look back/lateral).
        let covered = false;
        for (const o of players) {
            if (o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) < 60) {
                covered = true;
                break;
            }
        }

        if (covered) {
            // Deke Lateral
            const evadeY = (p.y < RY) ? p.y + 80 : p.y - 80;
            return { tx: p.x, ty: evadeY, action: "none" };
        }

        // Default: Keep skating toward goal
        return { tx: attackGoalX, ty: RY, action: "none" };
    }

    // No puck → existing logic
    if (loose) return roleC_loosePuck(p); 
    if (opponentHasPuck) return roleC_supportDefense(p);
    return roleC_supportOffense(p);
}
// =========================================================
    // FALLBACK / FAILSAFE (Prevents crash for extra players)
    // =========================================================
    // If no role matched, default to basic zone positioning
    const puckZone = getPuckZone(p.team);
    if (puckZone === 'own') {
        return getBlueLinePosition(p.team, puck.y);
    } else {
        return { 
            tx: RX + (p.team === 0 ? 50 : -50), 
            ty: RY, 
            action: "none" 
        };
    }

}  // <---- end of think(p)
