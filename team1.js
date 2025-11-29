// ==========================================
// TEAM 1 (RED) - MODULAR ARCHITECTURE
// ==========================================

const T1 = {
    shot_range_forwards: 250,   
    shot_range_defender: 400,   
    pressure_dist: 45, 
    lane_width: 130,            
    pass_min_dist: 90, 
    shot_greed: 0.02,   
};

// =========================================================
// 1. THE DISPATCHER
// =========================================================
function thinkTeam1(p) {
    const myGoalX = (p.team === 1) ? goal2 : goal1;
    const enemyGoalX = (p.team === 1) ? goal1 : goal2;
    const attackingRight = (enemyGoalX > RX);
    
    const ctx = {
        myGoalX: myGoalX,
        enemyGoalX: enemyGoalX,
        defendingLeft: (myGoalX < RX),
        forwardDir: (myGoalX < RX) ? 1 : -1,
        attackingRight: attackingRight,
        carrier: getPlayerById(puck.ownerId),
        hasPuck: (puck.ownerId === p.id),
        loosePuck: (puck.ownerId === null),
        defBlueLine: attackingRight ? LEFT_BLUE_LINE : RIGHT_BLUE_LINE,
        offBlueLine: attackingRight ? RIGHT_BLUE_LINE : LEFT_BLUE_LINE,
        myLaneY: RY + ((p.laneBias || 0) * 80)
    };

    ctx.oppHasPuck = (ctx.carrier && ctx.carrier.team !== p.team);
    ctx.inDefZone = attackingRight ? (puck.x < ctx.defBlueLine) : (puck.x > ctx.defBlueLine);
    ctx.inOffZone = attackingRight ? (puck.x > ctx.offBlueLine) : (puck.x < ctx.offBlueLine);

    // --- ROLE ASSIGNMENT ---
    const skaters = players.filter(pl => pl.team === 1 && pl.type === "skater");
    skaters.sort((a, b) => Math.hypot(a.x - myGoalX, a.y - RY) - Math.hypot(b.x - myGoalX, b.y - RY));
    
    if (skaters[0]) { skaters[0].role = "Defender"; skaters[0].laneBias = 0; }
    
    let forwards = [];
    if (skaters[1]) forwards.push(skaters[1]);
    if (skaters[2]) forwards.push(skaters[2]);
    if (skaters[3]) forwards.push(skaters[3]); 

    forwards.sort((a,b) => a.y - b.y);

    for (let i = 0; i < forwards.length; i++) {
        const f = forwards[i];
        if (f === skaters[skaters.length - 1]) f.role = "Attacker";
        else f.role = "Winger";
        if (forwards.length === 2) f.laneBias = (i === 0) ? -1 : 1;
        else f.laneBias = 0;
    }
    
    ctx.myLaneY = RY + ((p.laneBias || 0) * 80);

    // --- GOLDEN RULE: CLOSEST MAN INTERCEPTS ---
    if (ctx.loosePuck) {
        let myDist = Math.hypot(puck.x - p.x, puck.y - p.y);
        let amIClosest = true;
        for (const mate of skaters) {
            if (mate.id !== p.id) {
                const dist = Math.hypot(puck.x - mate.x, puck.y - mate.y);
                if (dist < myDist) { amIClosest = false; break; }
            }
        }
        if (amIClosest) {
            const target = getPuckIntercept(p);
            return { tx: target.x, ty: target.y, action: "none" };
        }
    }

    // --- EMERGENCY OVERRIDE ---
    const distPuckToNet = Math.hypot(puck.x - myGoalX, puck.y - RY);
    if (distPuckToNet < 75 && (ctx.oppHasPuck || ctx.loosePuck)) {
        const tx = ctx.oppHasPuck ? ctx.carrier.x : puck.x;
        const ty = ctx.oppHasPuck ? ctx.carrier.y : puck.y;
        return { tx: tx, ty: ty, action: "none" };
    }

    if (p.role === "Defender") return runDefender(p, ctx, skaters);
    if (p.role === "Winger")   return runWinger(p, ctx, skaters);
    if (p.role === "Attacker") return runAttacker(p, ctx, skaters);

    return { tx: RX, ty: RY, action: "none" };
}


// =========================================================
// 2. THE DEFENDER
// =========================================================
function runDefender(p, ctx, skaters) {
    if (ctx.hasPuck) {
        const distGoal = Math.hypot(ctx.enemyGoalX - p.x, RY - p.y);
        if (distGoal < T1.shot_range_defender && !isLaneBlocked(p.x, p.y, ctx.enemyGoalX, RY, p.team)) {
             return { tx: ctx.enemyGoalX, ty: RY, action: "shoot" };
        }
        
        if (p.possessionTime > 15) {
            const mate = findSmartPass(p, ctx);
            if (mate) return { tx: mate.x, ty: mate.y, action: "pass", target: mate };
        }

        const evasive = findBestCarryLane(p, ctx.enemyGoalX);
        return { tx: evasive.x, ty: evasive.y, action: "none" };
    } 

    if (ctx.loosePuck) {
        const target = getPuckIntercept(p);
        const distToIntercept = Math.hypot(target.x - p.x, target.y - p.y);
        if (distToIntercept < 100) return { tx: target.x, ty: target.y, action: "none" };
        return { tx: RX - (ctx.forwardDir * 50), ty: RY, action: "none" };
    }

    if (ctx.oppHasPuck) {
        if (ctx.inOffZone) return { tx: RX - (ctx.forwardDir * 30), ty: ctx.carrier.y * 0.3 + RY * 0.7, action: "none" };
        else if (!ctx.inDefZone) {
            const standX = ctx.defBlueLine + (ctx.forwardDir * 40);
            return { tx: standX, ty: ctx.carrier.y * 0.6 + RY * 0.4, action: "none" };
        }
        else return getAggressiveGapTarget(p, ctx.carrier, ctx.myGoalX);
    }

    let anchorX = ctx.carrier ? (ctx.carrier.x - (ctx.forwardDir * 150)) : RX;
    if (ctx.forwardDir === 1 && anchorX > RX) anchorX = RX;
    if (ctx.forwardDir === -1 && anchorX < RX) anchorX = RX;
    return { tx: anchorX, ty: ctx.carrier ? ctx.carrier.y : RY, action: "none" };
}


// =========================================================
// 3. THE WINGER
// =========================================================
function runWinger(p, ctx, skaters) {
    if (ctx.loosePuck) {
        if (ctx.inDefZone) {
            const target = getPuckIntercept(p);
            return { tx: target.x, ty: target.y, action: "none" };
        }
        if (ctx.inOffZone) return { tx: ctx.enemyGoalX, ty: RY, action: "none" };
    }
    return runGenericForward(p, ctx, skaters);
}


// =========================================================
// 4. THE ATTACKER
// =========================================================
function runAttacker(p, ctx, skaters) {
    return runGenericForward(p, ctx, skaters);
}


// =========================================================
// 5. GENERIC FORWARD LOGIC
// =========================================================
function runGenericForward(p, ctx, skaters) {
    
    if (ctx.hasPuck) {
        const distGoal = Math.hypot(ctx.enemyGoalX - p.x, RY - p.y);

        // A. Greed
        if (distGoal < 350 && Math.random() < T1.shot_greed) return { tx: ctx.enemyGoalX, ty: RY, action: "shoot" };

        // B. Smart Shot
        let shotBlocked = isLaneBlocked(p.x, p.y, ctx.enemyGoalX, RY, p.team);
        
        if (distGoal < T1.shot_range_forwards && !shotBlocked) {
            return { tx: ctx.enemyGoalX, ty: RY, action: "shoot" };
        }
        
        // ============================================================
        // *** NEW: SURGICAL ONE-TIMER CHECK ***
        // Only runs if I have the puck and my shot is blocked/too far.
        // ============================================================
        if (ctx.inOffZone) {
            // 1. Look for the other forward
            const partner = skaters.find(s => s.team === p.team && s.id !== p.id && (s.role === "Winger" || s.role === "Attacker"));
            
            if (partner) {
                // 2. Is he open?
                if (!isLaneBlocked(p.x, p.y, partner.x, partner.y, p.team)) {
                    // 3. Does HE have a clear shot?
                    if (!isLaneBlocked(partner.x, partner.y, ctx.enemyGoalX, RY, p.team)) {
                        // 4. Set him up! (Ignore possession timer for this play)
                        return { tx: partner.x, ty: partner.y, action: "pass", target: partner };
                    }
                }
            }
        }
        // ============================================================

        // C. Standard Pressure Checks
        let blockedAhead = false;
        let underPressure = false;
        
        for(const o of players) {
            if (o.team !== p.team) {
                const dist = Math.hypot(o.x - p.x, o.y - p.y);
                if (dist < T1.pressure_dist) underPressure = true;
                if (dist < 70) {
                    const dx = o.x - p.x;
                    const moveX = ctx.enemyGoalX - p.x;
                    if ((dx * moveX) > 0) blockedAhead = true; 
                }
            }
        }

        // D. Passing (Strategic)
        if (p.possessionTime > 15) {
            if (blockedAhead || underPressure) {
                const mate = findSmartPass(p, ctx);
                if (mate) return { tx: mate.x, ty: mate.y, action: "pass", target: mate };
            }
        }

        // E. Movement
        if (blockedAhead) {
            const evadeY = (p.y < RY) ? RY + 80 : RY - 80;
            return { tx: ctx.enemyGoalX, ty: evadeY, action: "none" };
        } else {
            let targetY = ctx.myLaneY;
            if (distGoal < 250) targetY = RY; 
            return { tx: ctx.enemyGoalX, ty: targetY, action: "none" };
        }
    }

    // LOOSE PUCK
    if (ctx.loosePuck) {
        return { tx: RX + (ctx.forwardDir * 60), ty: ctx.myLaneY, action: "none" };
    }

    // TEAMMATE HAS PUCK
    if (ctx.carrier && ctx.carrier.team === p.team) {
        if (ctx.inDefZone) {
            return { tx: ctx.carrier.x + (ctx.forwardDir * 60), ty: ctx.myLaneY, action: "none" };
        }
        else {
            const carrierIsTop = (ctx.carrier.y < RY);
            const openIceY = carrierIsTop ? (RY + 100) : (RY - 100);
            const targetX = ctx.carrier.x + (ctx.forwardDir * 40);
            return { tx: targetX, ty: openIceY, action: "none" };
        }
    }

    // OPPONENT HAS PUCK
    if (ctx.oppHasPuck) {
        const distToNet = Math.hypot(p.x - ctx.myGoalX, p.y - RY);
        const carrierDistToNet = Math.hypot(ctx.carrier.x - ctx.myGoalX, ctx.carrier.y - RY);
        if (carrierDistToNet < distToNet) {
            const slotX = ctx.myGoalX + (ctx.forwardDir * 80);
            return { tx: slotX, ty: RY, action: "none" };
        }
        return { tx: ctx.carrier.x, ty: ctx.carrier.y, action: "none" };
    }

    return { tx: RX, ty: ctx.myLaneY, action: "none" };
}


// =========================================================
// SHARED UTILITIES
// =========================================================

function getPuckIntercept(p) {
    const dist = Math.hypot(puck.x - p.x, puck.y - p.y);
    const puckSpeed = Math.hypot(puck.vx, puck.vy);
    const mySpeed = 2.2; 
    
    if (puckSpeed < 1.5) {
        return { x: puck.x, y: puck.y };
    }

    let framesToReach = dist / mySpeed;
    if (framesToReach > 60) framesToReach = 60; 

    let tx = puck.x + puck.vx * framesToReach;
    let ty = puck.y + puck.vy * framesToReach;

    tx = Math.max(120, Math.min(880, tx));
    ty = Math.max(170, Math.min(430, ty));

    return { x: tx, y: ty };
}

function findSmartPass(p, ctx) {
    let best = null;
    let bestScore = -999;

    const skaters = players.filter(mate => mate.team === p.team && mate.id !== p.id && mate.type !== "goalie");

    for (const mate of skaters) {
        const isForward = (mate.x - p.x) * ctx.forwardDir > 0;
        if (!ctx.inOffZone && !isForward) continue; 

        // Rule 2: If I am in Scoring Range (< 250px), DO NOT pass backward.
        const myDistToGoal = Math.abs(p.x - ctx.enemyGoalX);
        if (ctx.inOffZone && myDistToGoal < 250 && !isForward) continue;
        // ******************************

        if (isLaneBlocked(p.x, p.y, mate.x, mate.y, p.team)) continue;

        let score = 0;
        const myDistToGoal = Math.abs(p.x - ctx.enemyGoalX);
        const mateDistToGoal = Math.abs(mate.x - ctx.enemyGoalX);
        score += (myDistToGoal - mateDistToGoal); 

        let nearestEnemy = 999;
        for (const o of players) {
            if (o.team !== p.team) {
                const d = Math.hypot(o.x - mate.x, o.y - mate.y);
                if (d < nearestEnemy) nearestEnemy = d;
            }
        }
        if (nearestEnemy < 60) continue; 
        score += nearestEnemy;

        if (score > bestScore) {
            bestScore = score;
            best = mate;
        }
    }
    return best;
}

function findBestCarryLane(p, goalX) {
    const forwardDir = (goalX > p.x) ? 1 : -1;
    const lookAheadDist = 150;
    const angles = [0, -0.4, 0.4, -0.9, 0.9]; 
    let bestX = p.x + (forwardDir * lookAheadDist);
    let bestY = p.y;
    let bestScore = -9999;

    for (let ang of angles) {
        const dx = forwardDir * Math.cos(ang) * lookAheadDist;
        const dy = Math.sin(ang) * lookAheadDist;
        const targetX = p.x + dx;
        const targetY = p.y + dy;

        if (targetY < RINK_MIN_Y + 20 || targetY > RINK_MAX_Y - 20) continue;

        let score = 100;
        score -= Math.abs(ang) * 20;

        for (const o of players) {
            if (o.team !== p.team) {
                const dToTarget = Math.hypot(o.x - targetX, o.y - targetY);
                if (dToTarget < 60) score -= 150; 
                const midX = (p.x + targetX) / 2;
                const midY = (p.y + targetY) / 2;
                if (Math.hypot(o.x - midX, o.y - midY) < 50) score -= 150; 
            }
        }
        if (score > bestScore) { bestScore = score; bestX = targetX; bestY = targetY; }
    }
    return { x: bestX, y: bestY };
}

function getAggressiveGapTarget(defender, carrier, goalX) {
    const MIN_BACKUP = 35; 
    let targetX = (carrier.x + goalX) / 2;
    let targetY = (carrier.y + RY) / 2;

    const distFromGoal = Math.hypot(targetX - goalX, targetY - RY);
    if (distFromGoal < MIN_BACKUP) {
        const angle = Math.atan2(targetY - RY, targetX - goalX);
        targetX = goalX + Math.cos(angle) * MIN_BACKUP;
        targetY = RY + Math.sin(angle) * MIN_BACKUP;
    }
    return { tx: targetX, ty: targetY, action: "none" };
}
