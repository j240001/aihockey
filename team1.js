// ==========================================
// TEAM 1 (RED) - THE "MIXER BOARD"
// ==========================================

function thinkTeam1(p) {
    // =========================================================================
    // TEAM 1 MIXER BOARD
    // =========================================================================
    const T1 = {
        shot_range_forwards: 300,   
        shot_range_defender: 500,   
        pressure_dist: 45, 
        lane_width: 130,            
        def_collapse_dist: 50,      
        def_challenge_dist: 180,    
        pass_min_dist: 90, 
        pass_score_forward: 30,     
        pass_score_lateral: 40,     
        pass_score_point: 15,       
        pass_penalty_back: 80,   
        shot_greed: 0.02,   
    };

    // =========================================================================
    // CONTEXT
    // =========================================================================
    const myGoalX = (p.team === 1) ? goal2 : goal1;
    const enemyGoalX = (p.team === 1) ? goal1 : goal2;
    const defendingLeft = (myGoalX < RX);
    const forwardDir = defendingLeft ? 1 : -1; 
    const attackingRight = (enemyGoalX > RX);

    const skaters = players.filter(pl => pl.team === 1 && pl.type === "skater");
    skaters.sort((a, b) => Math.hypot(a.x - myGoalX, a.y - RY) - Math.hypot(b.x - myGoalX, b.y - RY));
    if (skaters[0]) skaters[0].role = "D"; 
    if (skaters[1]) skaters[1].role = "P"; 
    if (skaters[2]) skaters[2].role = "S"; 
    if (skaters[3]) skaters[3].role = "D"; 

    const carrier = getPlayerById(puck.ownerId);
    const hasPuck = (puck.ownerId === p.id);
    const loosePuck = (puck.ownerId === null);
    const oppHasPuck = (carrier && carrier.team !== p.team);
    
    const defBlueLine = attackingRight ? LEFT_BLUE_LINE : RIGHT_BLUE_LINE;
    const offBlueLine = attackingRight ? RIGHT_BLUE_LINE : LEFT_BLUE_LINE;
    const inDefZone = attackingRight ? (puck.x < defBlueLine) : (puck.x > defBlueLine);
    const inOffZone = attackingRight ? (puck.x > offBlueLine) : (puck.x < offBlueLine);

    // NEW CODE (Insert this)
    // Use the shared laneBias we set in assignRolesForTeam
    const myLaneY = RY + ((p.laneBias || 0) * 80);

    let d = { tx: p.x, ty: p.y, action: "none", target: null };

    // =========================================================================
    // 1. GLOBAL EMERGENCY: CREASE SWARM
    // =========================================================================
    // If the puck is in our crease area (dangerous), ignore roles.
    // EVERYONE attacks the puck/carrier to stuff the play.
    const distPuckToNet = Math.hypot(puck.x - myGoalX, puck.y - RY);
    
    if (distPuckToNet < 75 && (oppHasPuck || loosePuck)) {
        const targetX = oppHasPuck ? carrier.x : puck.x;
        const targetY = oppHasPuck ? carrier.y : puck.y;
        return { tx: targetX, ty: targetY, action: "none" };
    }

    // =========================================================================
    // 2. POSSESSION (LOOSE PUCK RACE)
    // =========================================================================
    if (loosePuck) {
        let myDist = Math.hypot(puck.x - p.x, puck.y - p.y);
        let amIClosest = true;
        for (const m of skaters) {
            if (m === p) continue;
            if (Math.hypot(puck.x - m.x, puck.y - m.y) < myDist) { amIClosest = false; break; }
        }
        if (amIClosest) return { tx: puck.x, ty: puck.y, action: "none" };
        else {
            // Support Logic: If loose in D-Zone, SWARM IT.
            if (inDefZone) return { tx: puck.x, ty: puck.y, action: "none" };
            return { tx: RX + (forwardDir * 60), ty: myLaneY, action: "none" };
        }
    }

    // =========================================================
    // ROLE D (THE ANCHOR)
    // =========================================================
    if (p.role === "D") {
        if (hasPuck) {
            // SHOOT
            const distGoal = Math.hypot(enemyGoalX - p.x, RY - p.y);
            if (distGoal < T1.shot_range_defender && !isLaneBlocked(p.x, p.y, enemyGoalX, RY, p.team)) {
                 return { tx: enemyGoalX, ty: RY, action: "shoot" };
            }
            // PASSING
            let underPressure = false;
            for(const o of players) { if(o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) < T1.pressure_dist) { underPressure = true; break; } }

            if (underPressure || Math.random() < 0.000001) { 
                let bestMate = null;
                let bestScore = -999;
                for (const m of skaters) {
                    if (m === p || m.passCooldown > 0) continue;
                    if (Math.hypot(m.x-p.x, m.y-p.y) < T1.pass_min_dist) continue;
                    if (!isLaneBlocked(p.x, p.y, m.x, m.y, p.team)) {
                        let score = 100 - Math.abs(Math.hypot(m.x - p.x, m.y - p.y) - 200);
                        if (Math.abs(m.x - enemyGoalX) < Math.abs(p.x - enemyGoalX)) score += 50;
                        let isCovered = false;
                        for(const o of players) { if(o.team !== p.team && Math.hypot(m.x-o.x, m.y-o.y) < 60) isCovered = true; }
                        if(isCovered) continue;
                        if (score > bestScore) { bestScore = score; bestMate = m; }
                    }
                }
                if (bestMate) return { tx: bestMate.x, ty: bestMate.y, action: "pass", target: bestMate };
            }
            // EVASIVE CARRY
            const evasive = findBestCarryLane(p, enemyGoalX);
            return { tx: evasive.x, ty: evasive.y, action: "none" };
        } 
        
        else if (oppHasPuck) {
            // *** VECTOR GAP CONTROL ***
            // Stay perfectly on the line between Carrier and Net.
            return getAggressiveGapTarget(p, carrier, myGoalX);
        }
        else return { tx: myGoalX + (forwardDir * 100), ty: RY, action: "none" };
    }

    // =========================================================
    // ROLES S & P (THE WINGERS)
    // =========================================================
    else {
        if (hasPuck) {
            // (Offense Logic - Same as before)
            const distGoal = Math.hypot(enemyGoalX - p.x, RY - p.y);
            if (Math.random() < T1.shot_greed) return { tx: enemyGoalX, ty: RY, action: "shoot" };
            if (distGoal < T1.shot_range_forwards) {
                if (distGoal < 220 || !isLaneBlocked(p.x, p.y, enemyGoalX, RY, p.team)) return { tx: enemyGoalX, ty: RY, action: "shoot" };
            }
            
            let underPressure = false;
            for(const o of players) { if(o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) < T1.pressure_dist) { underPressure = true; break; } }
            let targetY = myLaneY;
            if (distGoal < 250) targetY = RY; 
            let blockedAhead = false;
            for(const o of players) {
                if(o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) < 70) {
                    const dx = o.x - p.x;
                    const dy = o.y - p.y;
                    const moveX = enemyGoalX - p.x;
                    if ((dx * moveX) > 0) blockedAhead = true;
                }
            }

            if (underPressure || blockedAhead) {
                let bestMate = null;
                let bestScore = 0; 
                let myZoneIdx = inDefZone ? 0 : (inOffZone ? 2 : 1);
                for (let m of skaters) {
                    if (m === p || m.passCooldown > 0) continue;
                    if (Math.hypot(m.x-p.x, m.y-p.y) < T1.pass_min_dist) continue;
                    if (!isLaneBlocked(p.x, p.y, m.x, m.y, p.team)) {
                        let isCovered = false;
                        for(const o of players) { if(o.team !== p.team && Math.hypot(m.x-o.x, m.y-o.y) < 60) isCovered = true; }
                        if(isCovered) continue; 
                        let score = 10;
                        if ((p.role === "S" && m.role === "P") || (p.role === "P" && m.role === "S")) score += T1.pass_score_lateral;
                        if (Math.hypot(m.x - enemyGoalX, m.y - RY) < distGoal) score += T1.pass_score_forward;
                        if (m.role === "D" && inOffZone) score += T1.pass_score_point;
                        let mateZoneIdx = 1;
                        const mDef = attackingRight ? (m.x < defBlueLine) : (m.x > defBlueLine);
                        const mOff = attackingRight ? (m.x > offBlueLine) : (m.x < offBlueLine);
                        if (mDef) mateZoneIdx = 0; if (mOff) mateZoneIdx = 2;
                        if (mateZoneIdx < myZoneIdx) {
                            if (myZoneIdx === 2 && m.role === "D") score -= 5; 
                            else score -= T1.pass_penalty_back;
                        }
                        if (inDefZone && Math.hypot(m.x-myGoalX, m.y-RY) < 120) score -= 100; 
                        if (score > bestScore) { bestScore = score; bestMate = m; }
                    }
                }
                if (bestMate) return { tx: bestMate.x, ty: bestMate.y, action: "pass", target: bestMate };
            }
            if (blockedAhead) {
                const evadeY = (p.y < RY) ? RY + 80 : RY - 80;
                return { tx: enemyGoalX, ty: evadeY, action: "none" };
            } else {
                return { tx: enemyGoalX, ty: targetY, action: "none" };
            }
        }
        
        // --- OFF-PUCK: DEFENSIVE TRANSITION ---
        else {
            // 1. IF TEAMMATE HAS PUCK (Breakout/Support)
            if (carrier && carrier.team === p.team) {
                if (inDefZone) return { tx: defBlueLine, ty: myLaneY, action: "none" };
                return { tx: carrier.x + (forwardDir * 40), ty: myLaneY, action: "none" };
            }

            // 2. IF OPPONENT HAS PUCK (The "Get Back" Logic)
            if (oppHasPuck) {
                // Is the carrier AHEAD of me? (Between me and my net)
                const distToNet = Math.hypot(p.x - myGoalX, p.y - RY);
                const carrierDistToNet = Math.hypot(carrier.x - myGoalX, carrier.y - RY);
                
                // If carrier is closer to net, I am beaten. SPRINT BACK to slot.
                if (carrierDistToNet < distToNet) {
                    // Backcheck to the defensive slot immediately
                    const slotX = myGoalX + (forwardDir * 80);
                    return { tx: slotX, ty: RY, action: "none" };
                }
                
                // If I am ahead of carrier (Good position):
                if (inDefZone) {
                    // IN ZONE: PRESSURE HIM.
                    return { tx: carrier.x, ty: carrier.y, action: "none" };
                } else {
                    // NEUTRAL ZONE:
                    // Role S: Chase him (Pressure)
                    // Role P: Angle him (Target his body)
                    return { tx: carrier.x, ty: carrier.y, action: "none" };
                }
            }

            // 3. Default
            return { tx: RX, ty: myLaneY, action: "none" };
        }
    }
    return d;
} //             <-- end of thinkTeam1(p)








// ===  team 1 only ===
function findBestCarryLane(p, goalX) {
    // 1. Setup Feelers
    const forwardDir = (goalX > p.x) ? 1 : -1;
    const lookAheadDist = 150;
    
    // We evaluate 5 angles: 0 (Straight), +/- 25 (Soft), +/- 50 (Hard)
    const angles = [0, -0.4, 0.4, -0.9, 0.9]; 
    
    let bestX = p.x + (forwardDir * lookAheadDist);
    let bestY = p.y;
    let bestScore = -9999;

    for (let ang of angles) {
        // Calculate the tip of this feeler
        // Note: We apply the angle relative to the straight line to the goal
        const dx = forwardDir * Math.cos(ang) * lookAheadDist;
        const dy = Math.sin(ang) * lookAheadDist;
        
        const targetX = p.x + dx;
        const targetY = p.y + dy;

        // Check boundaries (Don't skate into the bench)
        if (targetY < RINK_MIN_Y + 20 || targetY > RINK_MAX_Y - 20) continue;

        // SCORING THIS LANE
        let score = 100;

        // A. Penalty for turning sharp (momentum loss)
        score -= Math.abs(ang) * 20;

        // B. Penalty for enemies nearby
        for (const o of players) {
            if (o.team !== p.team) {
                // Check distance to the *Target Point* of this lane
                const dToTarget = Math.hypot(o.x - targetX, o.y - targetY);
                if (dToTarget < 60) score -= 150; // Lane is blocked at end
                
                // Check distance to the *Midpoint* (to prevent skating through people)
                const midX = (p.x + targetX) / 2;
                const midY = (p.y + targetY) / 2;
                if (Math.hypot(o.x - midX, o.y - midY) < 50) score -= 150; // Lane blocked in middle
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestX = targetX;
            bestY = targetY;
        }
    }

    return { x: bestX, y: bestY };
}









function getAggressiveGapTarget(defender, carrier, goalX) {
    // 1. CONSTANTS
    const KILL_DIST = 25;   // WAS 60. Now we only attack if we are practically touching him.
    const IDEAL_GAP = 65;   // WAS 45. We stay further back to prevent getting deked.
    const MIN_BACKUP = 30;  // Don't back up into our own goalie.

    // 2. VECTOR MATH (Net -> Carrier)
    const dx = carrier.x - goalX;
    const dy = carrier.y - RY;
    const distNetToCarrier = Math.hypot(dx, dy);

    // 3. AGGRESSION CHECK (TIGHTENED)
    // Only abandon the gap if we are close enough to instantly steal it.
    const distMeToCarrier = Math.hypot(carrier.x - defender.x, carrier.y - defender.y);
    
    if (distMeToCarrier < KILL_DIST) {
        return { tx: carrier.x, ty: carrier.y, action: "none" };
    }

    // 4. CALCULATE THE "SHADOW" SPOT
    // Determine the point on the line that is IDEAL_GAP away from the carrier
    let targetDistFromNet = distNetToCarrier - IDEAL_GAP;

    // Safety Clamp: Ensure we don't back up through the net
    if (targetDistFromNet < MIN_BACKUP) targetDistFromNet = MIN_BACKUP;

    // Project that distance onto the angle between Goal and Carrier
    const angle = Math.atan2(dy, dx);
    const tx = goalX + Math.cos(angle) * targetDistFromNet;
    const ty = RY + Math.sin(angle) * targetDistFromNet;

    return { tx: tx, ty: ty, action: "none" };
}