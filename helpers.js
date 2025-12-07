// =========================================================
// AI HOCKEY HELPERS (Math, Physics, Queries)
// =========================================================






// =========================================================
// BEHAVIOUR TREE CORE ENGINE (Shared by Team0 + Team1)
// =========================================================

class Node {
    tick(bb) { return null; }
}

class ConditionNode extends Node {
    constructor(fn) { super(); this.fn = fn; }
    tick(bb) { return this.fn(bb) ? true : null; }
}

class ActionNode extends Node {
    constructor(fn) { super(); this.fn = fn; }
    tick(bb) { return this.fn(bb) || null; }
}

class SelectorNode extends Node {
    constructor(children) { super(); this.children = children; }
    tick(bb) {
        for (const c of this.children) {
            const res = c.tick(bb);
            if (res) return res;
        }
        return null;
    }
}

class SequenceNode extends Node {
    constructor(children) { super(); this.children = children; }
    tick(bb) {
        let last = null;
        for (const c of this.children) {
            const res = c.tick(bb);
            if (!res) return null;
            last = res;
        }
        return last;
    }
}





// --- 1. MATH UTILS ---

function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

function normalizeAngle(a) {
    while (a <= -Math.PI) a += 2 * Math.PI;
    while (a >  Math.PI)  a -= 2 * Math.PI;
    return a;
}

function pointLineDistance(x1, y1, x2, y2, px, py) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A*C + B*D;
    const lenSq = C*C + D*D;
    const t = Math.max(0, Math.min(1, dot / lenSq));

    return Math.hypot(px - (x1 + t * C), py - (y1 + t * D));
}

// --- 2. QUERY UTILS (Vision) ---

function isLaneBlocked(x1, y1, x2, y2, team) {
    for (const o of players) {
        // Only opponents block the lane
        if (o.team === team) continue;
        
        const d = pointLineDistance(x1, y1, x2, y2, o.x, o.y);
        // 18px is the "width" of the blockage (player radius + buffer)
        if (d < 18) return true;
    }
    return false;
}

function isPressured(p) {
    for (const o of players) {
        if (o.team === p.team) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < 55) return true;
    }
    return false;
}

function getPlayerById(id) {
    return players.find(p => p.id === id) || null;
}

function getPuckCarrier() {
    if (puck.ownerId === null) return null;
    return getPlayerById(puck.ownerId);
}

// --- 3. TACTICAL HELPERS (Calculations) ---





// =========================================================
// OFF-BALL MOVEMENT: CRASH THE BACKDOOR
// =========================================================

const BACKDOOR_DEPTH = 60;  // Distance from Goal Line
const BACKDOOR_WIDTH = 75;   // Distance from Center Ice

// =========================================================
// OFF-BALL MOVEMENT: CRASH THE BACKDOOR (Center-Origin Math)
// =========================================================
function getBackdoorPosition(p) {
    // 1. CONVERT TO RELATIVE COORDINATES (Center = 0,0)
    // Canvas X (0 to 1000) -> Relative X (-500 to 500)
    // Canvas Y (0 to 600)  -> Relative Y (-300 to 300)
    const puckRelY = puck.y - RY;
    const goalAbsX = (p.team === 0 ? goal2 : goal1);
    const goalRelX = goalAbsX - RX; // e.g. +325 or -325

    // 2. DETERMINE DIRECTION
    // Sign is 1 if goal is Right, -1 if goal is Left
    const dir = Math.sign(goalRelX); 

    // 3. CALCULATE RELATIVE TARGET
    // Depth: Back off from the goal line by specific depth
    // If goal is +325, target is +325 - 120 = +205
    // If goal is -325, target is -325 - (-120) = -205
    const targetRelX = goalRelX - (dir * BACKDOOR_DEPTH);

    // Width: Go to opposite side of puck
    // If puck is Top (-), go Bottom (+). If puck is Bottom (+), go Top (-).
    const targetRelY = (puckRelY < 0) ? BACKDOOR_WIDTH : -BACKDOOR_WIDTH;

    // 4. CONVERT BACK TO ABSOLUTE (Canvas)
    return { 
        tx: targetRelX + RX, 
        ty: targetRelY + RY, 
        action: "none" 
    };
}








// =========================================================
// ONE-TIMER / BACKDOOR LOGIC
// =========================================================
function findBackdoorTarget(p) {
    const enemyGoalX = (p.team === 0 ? goal2 : goal1);
    const enemyGoalY = RY; // Center of net

    for (const mate of players) {
        // 1. Basic Checks (Teammate, Skater, Not Me)
        if (mate.team !== p.team || mate.id === p.id || mate.type !== "skater") continue;

        // 2. RANGE CHECK: Must be "On the Doorstep"
        // We look for players within 130px of the goal (The "Danger Zone")
        const distToGoal = Math.hypot(mate.x - enemyGoalX, mate.y - enemyGoalY);
        if (distToGoal > 140) continue; 

        // 3. COVERAGE CHECK: Is he open?
        // If an enemy is within 50px of him, he's covered. Don't force it.
        let isCovered = false;
        for (const opp of players) {
            if (opp.team === p.team) continue;
            if (Math.hypot(opp.x - mate.x, opp.y - mate.y) < 50) {
                isCovered = true; 
                break;
            }
        }
        if (isCovered) continue;

        // 4. LANE CHECK: Can I actually get the puck to him?
        if (isLaneBlocked(p.x, p.y, mate.x, mate.y, p.team)) continue;

        // Found a perfect target!
        return mate;
    }
    return null;
}




// =========================================================
// REGROUP LOGIC: Check for Offside Teammates
// =========================================================
function checkTeammatesOffside(p) {
    const forwardDir = (p.team === 0 ? 1 : -1);
    
    // Define the Offensive Blue Line
    // RX (500) + Direction * 110 = 610 (Right) or 390 (Left)
    const blueLineX = RX + (forwardDir * 110); 
    
    for (const mate of players) {
        if (mate.team !== p.team || mate.id === p.id || mate.type !== "skater") continue;
        
        // Check if teammate is "Deep" in the zone relative to the blue line
        // We add a 10px buffer so they have to fully clear it
        if ((mate.x - blueLineX) * forwardDir > 5) {
            return true; // STOP! Someone is still in there.
        }
    }
    return false;
}











// =========================================================
// PUCK CLEARING: AWAY FROM NET FRONT (Safety Check Added)
// =========================================================
function clearPuckDefensive(p) {
    const forwardDir = (p.team === 0 ? goal2 : goal1) > p.x ? 1 : -1;
    const clearDistance = 200; // Fixed distance for the clear
    
    // 1. Calculate base X target (400 units forward)
    const targetX = p.x + forwardDir * clearDistance; 

    // 2. Define Candidate Y Targets (Wide open areas near side boards)
    const Y_WIDE_HIGH = RY - 150; 
    const Y_WIDE_LOW  = RY + 150;
    
    let scoreHigh = 0;
    let scoreLow = 0;

    // 3. Score the two lanes against opponents
    for (const o of players) {
        // Skip teammates and goalies
        if (o.team === p.team || o.type === "goalie") continue; 
        
        // --- High Lane Check (p.x, p.y) to (targetX, Y_WIDE_HIGH) ---
        // Score is penalized if opponent is too close to the path
        const distToHighLane = pointLineDistance(p.x, p.y, targetX, Y_WIDE_HIGH, o.x, o.y);
        if (distToHighLane < 40) { // Check if opponent is within a 40px wide corridor
            scoreHigh -= (40 - distToHighLane); // Higher penalty for closer opponents
        }

        // --- Low Lane Check (p.x, p.y) to (targetX, Y_WIDE_LOW) ---
        const distToLowLane = pointLineDistance(p.x, p.y, targetX, Y_WIDE_LOW, o.x, o.y);
        if (distToLowLane < 40) {
            scoreLow -= (40 - distToLowLane);
        }
    }
    
    // 4. Final Selection Logic
    let finalY;

    if (scoreHigh > scoreLow) {
        finalY = Y_WIDE_HIGH;
    } else if (scoreLow > scoreHigh) {
        finalY = Y_WIDE_LOW;
    } else {
        // TIE BREAKER: If both are equally safe/unsafe, aim for the side opposite the player's current Y position (default widest clear)
        finalY = (p.y < RY) ? Y_WIDE_LOW : Y_WIDE_HIGH;
    }

    return { tx: targetX, ty: finalY, action: "shoot" };
}







// =========================================================
// Predict target for a pass (VARIABLE SPEED)
// =========================================================
function predictLeadPass(passer, receiver) {

    // 1. Calculate Distance
    const dx = receiver.x - passer.x;
    const dy = receiver.y - passer.y;
    const distNow = Math.hypot(dx, dy);
    
    if (distNow < 1) return null;

    // 2. VARIABLE SPEED LOGIC (Must match 'passPuckToTeammate' in main file)
    // Base speed 5.5.
    // Add extra power for distance: +1 speed for every 40 pixels.
    // Cap at 14.0 (Laser beam).
    let passSpeed = 5.5 + (distNow / 40.0);
    if (passSpeed > 14.0) passSpeed = 14.0;

    // 3. Calculate Travel Time
    const travelFrames = distNow / passSpeed;

    // 4. Calculate Lead Position
    const leadX = receiver.x + receiver.vx * travelFrames;
    const leadY = receiver.y + receiver.vy * travelFrames;

    // Clamp inside rink
    const px = Math.max(120, Math.min(880, leadX));
    const py = Math.max(170, Math.min(430, leadY));

    return { x: px, y: py, t: travelFrames };
}



// =========================================================
// Determine which teammates are "open"
// =========================================================
// 
function findOpenTeammates(passer) {

    const results = [];
    const mates = players.filter(
        m => m.team === passer.team && m.id !== passer.id && m.type === "skater"
    );

    for (const mate of mates) {

        // --- Predict where teammate will be ---
        const lead = predictLeadPass(passer, mate);
        if (!lead) continue;

        const laneCurrentBlocked =
            isLaneBlocked(passer.x, passer.y, mate.x, mate.y, passer.team) ||
            passIntersectsOwnNet(passer, mate.x, mate.y);

        const laneFutureBlocked =
            isLaneBlocked(passer.x, passer.y, lead.x, lead.y, passer.team) ||
            passIntersectsOwnNet(passer, lead.x, lead.y);


        const currentClear = !laneCurrentBlocked;
        const futureClear  = !laneFutureBlocked;

        results.push({
            mate: mate,
            currentClear,
            futureClear,
            leadX: lead.x,
            leadY: lead.y,
            travelFrames: lead.t
        });
    }

    return results;
}




// =========================================================
// Neutral Zone: Find eligible forward targets for a D-man
// =========================================================
function findNeutralZonePassTargets(passer) {

    const results = [];

    const mates = players.filter(m =>
        m.team === passer.team &&
        m.id !== passer.id &&
        m.type === "skater"
    );

    // Determine attacking direction
    const enemyGoalX = (passer.team === 0 ? goal2 : goal1);
    const forwardDir = Math.sign(enemyGoalX - passer.x);

    for (const mate of mates) {

        const lead = predictLeadPass(passer, mate);
        if (!lead) continue;

        // Must be ahead of the passer
        const ahead = (mate.x - passer.x) * forwardDir > 0;
        if (!ahead) continue;

        // Must NOT already be inside O-zone early (offside morons)
        const blueLineX = RX + (110 * forwardDir);
        const matePastBlue = (mate.x - blueLineX) * forwardDir > 0;
        if (matePastBlue) continue;

        // Passing lane must be clear (including net)
        const laneCurrentBlocked =
            isLaneBlocked(passer.x, passer.y, mate.x, mate.y, passer.team) ||
            passIntersectsOwnNet(passer, mate.x, mate.y);

        const laneFutureBlocked =
            isLaneBlocked(passer.x, passer.y, lead.x, lead.y, passer.team) ||
            passIntersectsOwnNet(passer, lead.x, lead.y);

        if (laneCurrentBlocked && laneFutureBlocked) continue;

        results.push({
            mate,
            leadX: lead.x,
            leadY: lead.y
        });
    }

    return results;
}






// =====================================================
// PURE GEOMETRY: Does the pass line intersect our own goal?
// =====================================================
function passIntersectsOwnNet(p, x2, y2) {

    // Determine which goal belongs to this team
    const myGoalX = (p.team === 0 ? goal1 : goal2);

    // Net dimensions (use same values from GOAL_BLOCKS / GOAL_WALLS)
    const netHalf = 30;      // half height of net opening (~60px)
    const netTop  = RY - netHalf;
    const netBot  = RY + netHalf;

    // Build a segment for the pass
    const x1 = p.x, y1 = p.y;

    // If both endpoints are completely outside the net x-range, bail out
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    // Net occupies between myGoalX - depth  to myGoalX (for left goal)
    // or myGoalX to myGoalX + depth (for right goal).
    const depth = 35;   // Matches your actual physics walls (back + sides)

    const netMinX = (myGoalX < RX ? myGoalX - depth : myGoalX);
    const netMaxX = (myGoalX < RX ? myGoalX : myGoalX + depth);

    // Quick reject
    if (maxX < netMinX || minX > netMaxX) return false;

    // Check vertical overlap
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    if (maxY < netTop || minY > netBot) return false;

    // If the segment touches the rectangular net collision area → blocked
    return true;
}



// =========================================================
// SMART INTERCEPT (Iterative Solver)
// =========================================================
function getPuckIntercept(p) {
    const dist = Math.hypot(puck.x - p.x, puck.y - p.y);
    const pSpeed = Math.hypot(puck.vx, puck.vy);
    
    // 1. STATIONARY PUCK FIX
    if (pSpeed < 1.5) {
        
        // A. CLOSE RANGE (< 60px): AIM DIRECTLY AT PUCK
        // This stops the "orbiting" effect. If we aim directly at it,
        // the skater can turn tightly enough to hit the hitbox.
        if (dist < 30) {
            return { x: puck.x, y: puck.y };
        }
        
        // B. LONG RANGE: AIM THROUGH IT (SPRINT)
        // If far away, aim past it to keep velocity high.
        const angle = Math.atan2(puck.y - p.y, puck.x - p.x);
        return { 
            x: puck.x + Math.cos(angle) * 40, 
            y: puck.y + Math.sin(angle) * 40 
        };
    }

    // 2. MOVING PUCK: EXACT PHYSICS SIMULATION
    let tX = puck.x;
    let tY = puck.y;
    let tVX = puck.vx;
    let tVY = puck.vy;
    
    const mySpeed = 2.3; 
    const friction = 0.993; 

    for(let frames = 1; frames <= 60; frames++) {
        tX += tVX;
        tY += tVY;
        tVX *= friction;
        tVY *= friction;

        const d = Math.hypot(tX - p.x, tY - p.y);
        const possibleDist = frames * mySpeed;

        if (possibleDist >= d) {
            return {
                x: Math.max(120, Math.min(880, tX)), 
                y: Math.max(170, Math.min(430, tY))
            };
        }
    }

    return {
        x: Math.max(120, Math.min(880, tX)),
        y: Math.max(170, Math.min(430, tY))
    };
}




function getAggressiveGapTarget(defender, carrier, goalX) {
    // Defines where a defender should stand relative to an attacker
    const MIN_BACKUP = 40; 
    const IDEAL_GAP = 55;

    const dx = carrier.x - goalX;
    const dy = carrier.y - RY;
    const distNetToCarrier = Math.hypot(dx, dy);
    
    // If super close, attack!
    if (Math.hypot(carrier.x - defender.x, carrier.y - defender.y) < 10) {
        return { tx: carrier.x, ty: carrier.y, action: "none" };
    }

    let targetDist = distNetToCarrier - IDEAL_GAP;
    if (targetDist < MIN_BACKUP) targetDist = MIN_BACKUP;

    const angle = Math.atan2(dy, dx);
    const tx = goalX + Math.cos(angle) * targetDist;
    const ty = RY + Math.sin(angle) * targetDist;
    
    return { tx: tx, ty: ty, action: "none" };
}

function evaluateShot(p) {
    const goalX = (p.team === 0) ? goal2 : goal1;
    const goalY = RY; // Aim center
    
    const dx = goalX - p.x;
    const dy = goalY - p.y;
    const dist = Math.hypot(dx, dy);

    // 1. Range Check
    if (dist > 210) return { good: false, x: goalX, y: goalY };

    // 2. Angle Check (Don't shoot from bad angles)
    const angle = Math.atan2(dy, dx);
    let diff = Math.abs(normalizeAngle(angle - p.angle));
    if (diff > 2.0) return { good: false, x: goalX, y: goalY };

    // 3. Block Check
    if (isLaneBlocked(p.x, p.y, goalX, goalY, p.team)) {
        return { good: false, x: goalX, y: goalY };
    }

    return { good: true, x: goalX, y: goalY };
}

function findSmartPass(p, bb) {
    // Used by Team 1 (Behavior Tree)
    let best = null;
    let bestScore = -999;

    const skaters = players.filter(mate => mate.team === p.team && mate.id !== p.id && mate.type === "skater");
    // If BB exists, use its data, otherwise infer direction
    const forwardDir = (bb && bb.attackingRight) ? 1 : ((p.x < RX) ? 1 : -1);
    const enemyGoal = (bb) ? bb.enemyGoal : ((p.team === 0) ? goal2 : goal1);

    for (const mate of skaters) {
        // Rule: Don't pass backward into defensive zone unless necessary
        const isForwardPass = (mate.x - p.x) * forwardDir > 0;
        
        if (isLaneBlocked(p.x, p.y, mate.x, mate.y, p.team)) continue;

        let score = 0;
        const mateDistToGoal = Math.hypot(mate.x - enemyGoal, mate.y - RY);
        score -= mateDistToGoal; 

        let nearestEnemy = 999;
        for (const o of players) {
            if (o.team !== p.team) {
                const d = Math.hypot(o.x - mate.x, o.y - mate.y);
                if (d < nearestEnemy) nearestEnemy = d;
            }
        }
        if (nearestEnemy < 60) score -= 1000; 
        
        if (score > bestScore) {
            bestScore = score;
            best = mate;
        }
    }
    return best;
}

function evaluatePassOptions(p) {
    // Used by Team 0 (Legacy logic)
    const target = findSmartPass(p, null);
    return { good: !!target, teammate: target };
}

function pickCarryLane(p) {
    // Simple 3-lane logic
    const goalX = (p.team === 0) ? goal2 : goal1;
    const offsets = [-80, 0, 80];
    let best = null;
    let bestScore = -999;

    for (let off of offsets) {
        const ly = RY + off;
        let score = 0;
        for (const o of players) {
            if (o.team === p.team) continue;
            const d = pointLineDistance(p.x, p.y, goalX, ly, o.x, o.y);
            score += Math.max(0, d - 30);
        }
        if (score > bestScore) { bestScore = score; best = { x: goalX, y: ly }; }
    }
    return best;
}

function openSpaceScore(x, y, team) {
    let score = 0;
    for (const o of players) {
        if (o.team !== team) {
            const d = Math.hypot(o.x - x, o.y - y);
            if (d < 70) score -= (70 - d);
        }
    }
    return score;
}

function getNetAvoidanceTarget(p, targetX, targetY) {
    const leftNetX = Math.min(goal1, goal2);
    const rightNetX = Math.max(goal1, goal2);
    const avoidanceThreshold = 60; 
    const waypointOffset = 100;

    if (targetX < leftNetX && p.x > leftNetX) {
        if (Math.abs(p.y - RY) < avoidanceThreshold) {
            const goUp = (p.y < RY);
            return { x: leftNetX - 30, y: goUp ? RY - waypointOffset : RY + waypointOffset };
        }
    }
    if (targetX > rightNetX && p.x < rightNetX) {
        if (Math.abs(p.y - RY) < avoidanceThreshold) {
            const goUp = (p.y < RY);
            return { x: rightNetX + 30, y: goUp ? RY - waypointOffset : RY + waypointOffset };
        }
    }
    return { x: targetX, y: targetY };
}



function evadePressure(bb) {
    let escapeX = 0, escapeY = 0, pressureCount = 0;
    for (const o of players) {
        if (o.team !== bb.p.team) {
            const dist = Math.hypot(bb.p.x - o.x, bb.p.y - o.y);
            if (dist < 100) {
                const force = (80 - dist) / 100;
                escapeX += ((bb.p.x - o.x) / dist) * force;
                escapeY += ((bb.p.y - o.y) / dist) * force;
                pressureCount++;
            }
        }
    }
    if (pressureCount === 0) return null;

    // IMPROVED: Stronger/smarter open ice pull (test 5 candidates for wider vision)
    const forwardDir = (bb.enemyGoal > bb.p.x) ? 1 : -1;
    const candidates = [
        { x: bb.p.x + forwardDir * 80, y: bb.p.y - 90 },  // Wider up
        { x: bb.p.x + forwardDir * 80, y: bb.p.y - 45 },  // Slight up
        { x: bb.p.x + forwardDir * 80, y: bb.p.y },       // Straight
        { x: bb.p.x + forwardDir * 80, y: bb.p.y + 45 },  // Slight down
        { x: bb.p.x + forwardDir * 80, y: bb.p.y + 90 }   // Wider down
    ];
    let bestCandidate = candidates[2];  // Default straight
    let bestScore = -999;
    for (const cand of candidates) {
        const score = openSpaceScore(cand.x, cand.y, bb.p.team) + (forwardDir * (cand.x - bb.p.x) * 0.2);  // Bonus for forward progress
        if (score > bestScore) {
            bestScore = score;
            bestCandidate = cand;
        }
    }
    // Stronger pull to best open spot (safer path)
    const openDX = bestCandidate.x - bb.p.x;
    const openDY = bestCandidate.y - bb.p.y;
    const openDist = Math.hypot(openDX, openDY);
    if (openDist > 0) {
        escapeX += (openDX / openDist) * 0.8;  // Bumped up for better open ice use
        escapeY += (openDY / openDist) * 0.8;
    }

    const distFromCenter = bb.p.y - RY;
    escapeY -= distFromCenter * 0.05;
    const forwardNudge = forwardDir * 0.25;  // Slightly stronger forward bias
    escapeX += forwardNudge;

    const angle = Math.atan2(escapeY, escapeX);
    const escapeDist = 90;
    const tx = bb.p.x + Math.cos(angle) * escapeDist;
    const ty = bb.p.y + Math.sin(angle) * escapeDist;

    // NEW: Quick pass eval mid-evade (if escape spot opens a lane, pass for safety)
    const passOption = findSmartPass(bb.p, bb);  // Your existing smart pass helper
    if (passOption) {
        const passTx = passOption.x + forwardDir * 20;  // Slight lead for safer pass
        const passTy = passOption.y;
        if (!isLaneBlocked(bb.p.x, bb.p.y, passTx, passTy, bb.p.team)) {
            return { tx: passTx, ty: passTy, action: "pass", target: passOption };
        }
    }

    return { tx, ty, action: "none" };
}



function hoverDynamicLine(bb) {

    const defendingRight = (bb.myGoalX > RX);
    const me = bb.p;

    // Find deepest OTHER skater toward OUR own end
    let deepest = null;

    for (const pl of players) {
        if (pl.type !== "skater") continue;
        if (pl.id === me.id) continue; // <<< IMPORTANT FIX

        if (!deepest) {
            deepest = pl;
            continue;
        }

        if (defendingRight) {
            if (pl.x > deepest.x) deepest = pl;
        } else {
            if (pl.x < deepest.x) deepest = pl;
        }
    }

    if (!deepest) {
        return { tx: me.x, ty: me.y, action: "none" };
    }

    const gap = 80;
    const rawX = defendingRight ? (deepest.x + gap) : (deepest.x - gap);

    // Don't let him drift behind the net
    const netBuffer = 40;
    const safeMinX = Math.min(goal1, goal2) + netBuffer;
    const safeMaxX = Math.max(goal1, goal2) - netBuffer;

    const targetX = Math.max(safeMinX, Math.min(safeMaxX, rawX));

    // Mild vertical tracking toward puck
    const targetY = RY + (puck.y - RY) * 0.35;

    return { tx: targetX, ty: targetY, action: "none" };
}




function applyEvasion(p, targetX, targetY) {
    // 1. Safety Check
    if (puck.ownerId !== p.id) return { x: targetX, y: targetY };

    let avoidX = 0;
    let avoidY = 0;
    let threatCount = 0;

    // 2. Scan for threats
    for (const o of players) {
        if (o.team === p.team) continue; // Ignore teammates

        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const dist = Math.hypot(dx, dy);

        // Danger Zone: 70px (Slightly larger to allow smooth steering)
        if (dist < 70) {
            // Calculate repulsion force (0.0 to 1.0)
            const force = (70 - dist) / 70;

            // --- THE LATERAL BIAS FIX ---
            // If the opponent is mostly Horizontal to us (Blocking the lane),
            // we want to dodge Vertically (East/West), not backwards.
            
            // Check if threat is "In Front/Behind" vs "Beside"
            const isHorizontalThreat = Math.abs(dx) > Math.abs(dy);

            if (isHorizontalThreat) {
                // THREAT IS BLOCKING THE LANE:
                // Apply strict Lateral Force (Y-axis push).
                // We use our current Y velocity to decide which way to 'flow'
                // If we are already drifting Up, dodge Up. If Down, dodge Down.
                const dodgeDir = (p.vy > 0) ? 1 : -1; 
                
                // Strong lateral push (160px), weak backward push (20px)
                avoidX += (dx / dist) * force * 20;  
                avoidY += dodgeDir * force * 160;   
            } 
            else {
                // THREAT IS TO THE SIDE:
                // Just push away normally so we don't get hooked
                avoidX += (dx / dist) * force * 80;
                avoidY += (dy / dist) * force * 80;
            }

            threatCount++;
        }
    }

    if (threatCount > 0) {
        // 3. Apply to Local Waypoint (The "Local Steering" Logic)
        const toGoalX = targetX - p.x;
        const toGoalY = targetY - p.y;
        const goalDist = Math.hypot(toGoalX, toGoalY);

        // Create a local target 100px ahead, then apply the dodge
        const lookAhead = 100;
        const localTx = (toGoalX / goalDist) * lookAhead;
        const localTy = (toGoalY / goalDist) * lookAhead;

        return { 
            x: p.x + localTx + avoidX, 
            y: p.y + localTy + avoidY 
        };
    }

    // No threats? Return original target
    return { x: targetX, y: targetY };
}

















// =========================================================
// PREVENTIVE OFFSIDE CHECK FOR AI (Universal)
// =========================================================
function wouldBeOffside(p) {
    // Blue lines
    const leftLine  = RX - BLUE_LINE_OFFSET;
    const rightLine = RX + BLUE_LINE_OFFSET;

    const puckX = puck.x;
    const meX   = p.x;

    // TEAM 0 → direction depends on team0AttacksRight
    if (p.team === 0) {
        if (team0AttacksRight) {
            // Attacking RIGHT: puck must cross rightLine before skater
            const puckIn = puckX > rightLine;
            const meIn   = meX > rightLine;
            if (!puckIn && meIn) return true;   // entering early
        } else {
            // Attacking LEFT
            const puckIn = puckX < leftLine;
            const meIn   = meX < leftLine;
            if (!puckIn && meIn) return true;
        }
    }

    // TEAM 1 → opposite direction
    else {
        const team1AttacksRight = !team0AttacksRight;

        if (team1AttacksRight) {
            // Team 1 attacking RIGHT
            const puckIn = puckX > rightLine;
            const meIn   = meX > rightLine;
            if (!puckIn && meIn) return true;
        } else {
            // Team 1 attacking LEFT
            const puckIn = puckX < leftLine;
            const meIn   = meX < leftLine;
            if (!puckIn && meIn) return true;
        }
    }

    return false;
}




// ==========================================
// OFFSIDE LOGIC
// ==========================================




function checkOffsides() {
    // 1. If play is stopped, reset logic
    if (isResetActive()) {
        offsideState.active = false;
        offsideState.team = null;
        return;
    }

    // 2. Identify Zones
    // Blue lines are at RX - 110 (Left) and RX + 110 (Right)
    const leftLine = RX - BLUE_LINE_OFFSET;
    const rightLine = RX + BLUE_LINE_OFFSET;

    // 3. Track Puck Crossing
    // We need to know if the puck *just* entered a zone.
    // (We rely on puck.prevX which we will set in the main loop)
    const p = puck;
    if (p.prevX === undefined) p.prevX = p.x;

    // --- CHECKING TEAM 0 (Attacking Right -> Crosses Right Line) ---
    if (team0AttacksRight) {
        // Did puck just cross the Right Blue Line?
        if (p.prevX <= rightLine && p.x > rightLine) {
            // Check for premature attackers
            let early = false;
            const carrierId = p.ownerId; // Get ID of who has it (if anyone)
            for (const pl of players) {
                if (pl.id === carrierId) continue;
                if (pl.team === 0 && pl.x > rightLine + 5) { // +5 buffer
                    early = true; 
                    break;
                }
            }
            if (early && p.ownerId !== null && getPlayerById(p.ownerId).team === 0) {
                 // Carrier carried it in offside -> Whistle immediately
                 whistle("OFFSIDE! (Team 0)");
            } else if (early) {
                // Dumped in -> Delayed
                offsideState.active = true;
                offsideState.team = 0;
            }
        }
    } else {
        // Team 0 Attacking Left (Crosses Left Line)
        if (p.prevX >= leftLine && p.x < leftLine) {
            let early = false;
            for (const pl of players) {
                if (pl.team === 0 && pl.x < leftLine - 5) {
                    early = true; break;
                }
            }
            if (early && p.ownerId !== null && getPlayerById(p.ownerId).team === 0) {
                 whistle("OFFSIDE! (Team 0)");
            } else if (early) {
                offsideState.active = true;
                offsideState.team = 0;
            }
        }
    }

    // --- CHECKING TEAM 1 (Attacking Left -> Crosses Left Line) ---
    // (Assumes Team 1 starts attacking Left)
    const t1AttacksRight = !team0AttacksRight; 
    
    if (!t1AttacksRight) { // Standard Team 1 (Right to Left)
         if (p.prevX >= leftLine && p.x < leftLine) {
            let early = false;
            const carrierId = p.ownerId; // Get ID of who has it (if anyone)
            for (const pl of players) {
                if (pl.id === carrierId) continue;
                if (pl.team === 1 && pl.x < leftLine - 5) {
                    early = true; break;
                }
            }
            if (early && p.ownerId !== null && getPlayerById(p.ownerId).team === 1) {
                 whistle("OFFSIDE! (Team 1)");
            } else if (early) {
                offsideState.active = true;
                offsideState.team = 1;
            }
        }
    } else {
        // Team 1 Attacking Right
         if (p.prevX <= rightLine && p.x > rightLine) {
            let early = false;
            for (const pl of players) {
                if (pl.team === 1 && pl.x > rightLine + 5) {
                    early = true; break;
                }
            }
            if (early && p.ownerId !== null && getPlayerById(p.ownerId).team === 1) {
                 whistle("OFFSIDE! (Team 1)");
            } else if (early) {
                offsideState.active = true;
                offsideState.team = 1;
            }
        }
    }

    // 4. HANDLE DELAYED STATE
    if (offsideState.active) {
        const offTeam = offsideState.team;
        const lineX = (team0AttacksRight && offTeam === 0) || (!team0AttacksRight && offTeam === 1) 
                      ? rightLine : leftLine;
        
        // A. CHECK FOR TOUCH (WHISTLE)
        if (puck.ownerId !== null) {
            const owner = getPlayerById(puck.ownerId);
            if (owner.team === offTeam) {
                whistle(`OFFSIDE! (Team ${offTeam} touched up)`);
                offsideState.active = false;
                return;
            }
        }

        // B. CHECK FOR TAG UP (CLEAR)
        // If all players on offside team are OUT of the zone, clear it.
        let allClear = true;
        for (const pl of players) {
            if (pl.team === offTeam) {
                // If attacking right, must be < line. If left, must be > line.
                const isDeep = (team0AttacksRight && offTeam === 0) || (!team0AttacksRight && offTeam === 1)
                               ? (pl.x > lineX) : (pl.x < lineX);
                if (isDeep) {
                    allClear = false;
                    break;
                }
            }
        }
        
        // Also clear if puck leaves zone
        const puckOut = (team0AttacksRight && offTeam === 0) || (!team0AttacksRight && offTeam === 1)
                        ? (p.x < lineX) : (p.x > lineX);

        if (allClear || puckOut) {
            offsideState.active = false;
            offsideState.team = null;
        }
    }

    // Update Previous X
    p.prevX = p.x;
}



// ==========================================
// SOLID GOAL PHYSICS (The "Brick Wall" Fix)
// ==========================================

const GOAL_WALLS = [];

function buildSolidGoals() {
    GOAL_WALLS.length = 0; // Clear existing

    const depth = 23;    // How deep the net is
    const thickness = 2; // How thick the walls are (Prevent tunneling)
    const openingHalf = 23; // Half the net height (Net is 70px tall)
    
    // Y Coordinates for posts
    const topPost = RY - openingHalf;
    const botPost = RY + openingHalf;

    // --- LEFT GOAL (Goal 1) ---
    // Opening is at x = goal1. Back is to the left.
    
    // 1. Back Wall (Vertical block)
    GOAL_WALLS.push({
        x: goal1 - depth - thickness, 
        y: topPost - thickness,
        w: thickness, 
        h: (botPost - topPost) + (thickness * 2),
        type: "back"
    });

    // 2. Top Side (Horizontal block)
    GOAL_WALLS.push({
        x: goal1 - depth,
        y: topPost - thickness,
        w: depth, // Reaches to the goal line
        h: thickness,
        type: "side"
    });

    // 3. Bottom Side (Horizontal block)
    GOAL_WALLS.push({
        x: goal1 - depth,
        y: botPost,
        w: depth,
        h: thickness,
        type: "side"
    });

    // --- RIGHT GOAL (Goal 2) ---
    // Opening is at x = goal2. Back is to the right.

    // 1. Back Wall
    GOAL_WALLS.push({
        x: goal2 + depth,
        y: topPost - thickness,
        w: thickness,
        h: (botPost - topPost) + (thickness * 2),
        type: "back"
    });

    // 2. Top Side
    GOAL_WALLS.push({
        x: goal2, // Starts at goal line
        y: topPost - thickness,
        w: depth,
        h: thickness,
        type: "side"
    });

    // 3. Bottom Side
    GOAL_WALLS.push({
        x: goal2,
        y: botPost,
        w: depth,
        h: thickness,
        type: "side"
    });
}




function resolveGoalCollisions(p) {
    let hit = false;
    const r = p.r || p.size / 2;

    for (const wall of GOAL_WALLS) {
        const closestX = clamp(p.x, wall.x, wall.x + wall.w);
        const closestY = clamp(p.y, wall.y, wall.y + wall.h);
        const dx = p.x - closestX;
        const dy = p.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < r * r) {
            const dist = Math.sqrt(distSq) || 0.001;
            
            // Normal direction
            let nx = dx / dist;
            let ny = dy / dist;

            // Fallback for tunneling (rare)
            if (dist < 0.001) {
                const distLeft = Math.abs(p.x - wall.x);
                const distRight = Math.abs(p.x - (wall.x + wall.w));
                const distTop = Math.abs(p.y - wall.y);
                const distBot = Math.abs(p.y - (wall.y + wall.h));
                const minX = Math.min(distLeft, distRight);
                const minY = Math.min(distTop, distBot);
                if (minX < minY) {
                    nx = (distLeft < distRight) ? -1 : 1; ny = 0;
                } else {
                    nx = 0; ny = (distTop < distBot) ? -1 : 1;
                }
            }

            // Push out
            const overlap = r - dist;
            p.x += nx * overlap;
            p.y += ny * overlap;

            // --- NEW SOFT NET PHYSICS ---
            
            // 0.1 = Dead bounce (Back of net)
            // 0.3 = Dull thud (Side of net)
            // (Standard wall was effectively 1.0)
            const restitution = (wall.type === "back") ? 0.1 : 0.3;

            // Apply reflection: V_new = V_old - (1 + e) * (V . N) * N
            const dot = p.vx * nx + p.vy * ny;
            
            // Only reflect if moving TOWARD the wall
            if (dot < 0) {
                p.vx -= (1 + restitution) * dot * nx;
                p.vy -= (1 + restitution) * dot * ny;
            }

            // High Friction (Mesh catches the puck)
            p.vx *= 0.6;
            p.vy *= 0.6;

            hit = true;
        }
    }
    return hit;
}



// ==========================================
// PLAYER-ONLY GOAL BLOCKS (Simple Box Prevents Entering Net)
// ==========================================

const GOAL_BLOCKS = [];

function buildGoalBlocksForPlayers() {
    GOAL_BLOCKS.length = 0;

    const depth = 28;         // how far box extends behind the goal line
    const height = 60;        // net height
    const half = height / 2;

    const top = RY - half;
    const bot = RY + half;

    // LEFT GOAL
    GOAL_BLOCKS.push({
        x: goal1 - depth,
        y: top,
        w: depth,
        h: height
    });

    // RIGHT GOAL
    GOAL_BLOCKS.push({
        x: goal2,
        y: top,
        w: depth,
        h: height
    });
}

function blockPlayerFromGoal(p) {
    const r = p.size / 2;

    for (const g of GOAL_BLOCKS) {

        const closestX = clamp(p.x, g.x, g.x + g.w);
        const closestY = clamp(p.y, g.y, g.y + g.h);

        const dx = p.x - closestX;
        const dy = p.y - closestY;
        const distSq = dx*dx + dy*dy;

        if (distSq < r*r) {
            const dist = Math.sqrt(distSq) || 0.001;
            const nx = dx / dist;   // normal X
            const ny = dy / dist;   // normal Y
            const overlap = r - dist;

            // --- PUSH OUT ---
            p.x += nx * overlap;
            p.y += ny * overlap;

            // --- SLIDE (Reflect only normal component) ---
            const dot = p.vx * nx + p.vy * ny;    // component along the normal

            // Remove *only* the inward velocity
            if (dot < 0) {
                p.vx -= dot * nx;   // subtract normal direction
                p.vy -= dot * ny;
            }

            // Light friction so they don't bounce forever
            p.vx *= 0.99;
            p.vy *= 0.99;
        }
    }
}




function debugDrawGoalBlocks(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "red";

    for (const g of GOAL_BLOCKS) {
        ctx.fillRect(g.x, g.y, g.w, g.h);
    }

    ctx.restore();
}




function redirectShotBehindNet(p) {

    // Calculate shot direction
    const aimX = Math.cos(p.angle);
    const aimY = Math.sin(p.angle);

    let attackingRight = (p.team === 0);

    // Player behind the left net (attacking right)
    if (attackingRight) {
        if (p.x < goal1 + 5 && aimX > 0) {
            // If shot is almost horizontal, force upward
            if (Math.abs(aimY) < 0.2) {
                return { x: p.x, y: p.y - 300 };
            }
            // Otherwise, keep their vertical bias
            return { x: p.x, y: p.y + (aimY < 0 ? -300 : 300) };
        }
    }

    // Player behind the right net (attacking left)
    else {
        if (p.x > goal2 - 5 && aimX < 0) {
            if (Math.abs(aimY) < 0.2) {
                return { x: p.x, y: p.y - 300 };
            }
            return { x: p.x, y: p.y + (aimY < 0 ? -300 : 300) };
        }
    }

    return null;
}




// =========================================================
// BEHIND-NET ESCAPE MODE (Behavior, NOT Pathfinding)
// =========================================================
function behindNetEscape(p, tx, ty) {

    // 1. Determine if *puck* is behind either net
    const puckBehindLeft  = (puck.x < goal1 - 20);
    const puckBehindRight = (puck.x > goal2 + 20);
    const puckBehindNet   = puckBehindLeft || puckBehindRight;

    // If puck is behind the net, behave normally
    if (puckBehindNet) {
        return { x: tx, y: ty };
    }

    // 2. Determine if *player* is behind the net
    const trapY = 80;
    const playerBehindLeft  = (p.x < goal1 - 20)  && (Math.abs(p.y - RY) < trapY);
    const playerBehindRight = (p.x > goal2 + 20)  && (Math.abs(p.y - RY) < trapY);

    const inTrap = playerBehindLeft || playerBehindRight;

    if (!inTrap) {
        // Not stuck behind net → normal
        return { x: tx, y: ty };
    }

    // 3. Player is behind net AND puck is not behind net → escape mode
    // Escape direction is chosen simply:
    const escapeUp = (p.y < RY);
    const escapeSpeed = escapeUp ? -100 : 100;

    // Maintain original X-target,
    // but force a strong vertical bias until escaping trapY region.
    const newTy = p.y + escapeSpeed;

    return { x: tx, y: newTy };
}




function offensiveZoneAllowed(p) {
    const blueLeft  = RX - BLUE_LINE_OFFSET;
    const blueRight = RX + BLUE_LINE_OFFSET;

    let attackingRight;

    if (p.team === 0) attackingRight = team0AttacksRight;
    else             attackingRight = !team0AttacksRight;

    const puckX = puck.x;

    if (attackingRight) {
        return (puckX > blueRight);   // puck already in O-zone?
    } else {
        return (puckX < blueLeft);
    }
}
