// ==========================================
// TEAM 1 — BEHAVIOUR TREE (SMART PASSING)
// ==========================================

const T1 = {
    shot_range: 150, 
    def_shot_range: 200, 
    pressure_dist: 55,
    blue_line_offset: 110,
    open_radius: 80 // User defined radius
};






// --- BLACKBOARD ---
function makeBB(p) {
    const myGoalX   = (p.team === 1) ? goal2 : goal1;
    const enemyGoal = (p.team === 1) ? goal1 : goal2;
    const defendingRight = (myGoalX > RX);
    const defBlueLine = defendingRight ? (RX + T1.blue_line_offset) : (RX - T1.blue_line_offset);
    const puckInDefZone = defendingRight ? (puck.x > defBlueLine) : (puck.x < defBlueLine);
    const carrier = getPlayerById(puck.ownerId);



    // Find the OTHER forward (P looking for S, S looking for P)
    // If I am P, mate is S. If I am S, mate is P.
    const forwardRoleToFind = (p.role === "P") ? "S" : "P";
    const forwardMate = players.find(m => m.team === p.team && m.role === forwardRoleToFind);

    // GOLDEN RULE CHECK
    let amIClosest = true;
    const myDistToPuck = Math.hypot(puck.x - p.x, puck.y - p.y);
    for (const mate of players) {
        if (mate.team === p.team && mate.id !== p.id && mate.type === "skater") {
            const d = Math.hypot(puck.x - mate.x, puck.y - mate.y);
            if (d < myDistToPuck) { amIClosest = false; break; }
        }
    }

    // Calculate distance to the puck carrier (if one exists)
    let distToCarrier = 9999;
    if (carrier) {
        distToCarrier = Math.hypot(carrier.x - p.x, carrier.y - p.y);
    }

    const attackerMate = players.find(m => m.team === p.team && m.role === "P");
    const distFromGoalLine = Math.abs(puck.x - myGoalX);
    const isDeepInZone = (puckInDefZone && distFromGoalLine < 60);

    return {
        p,
        myGoalX,
        enemyGoal,
        defBlueLine,
        forwardMate, // <--- The specific partner we want to pass to
        attackerMate, 
        hasPuck: (puck.ownerId === p.id),
        loosePuck: (puck.ownerId === null),
        oppHasPuck: (carrier && carrier.team !== p.team),
        teamHasPuck: (carrier && carrier.team === p.team),
        carrier,
        distToGoal: Math.hypot(enemyGoal - p.x, RY - p.y),
        inShotRange: (Math.hypot(enemyGoal - p.x, RY - p.y) < T1.shot_range),
        inDefShotRange: (Math.hypot(enemyGoal - p.x, RY - p.y) < T1.def_shot_range),
        isDelayedOffside: (offsideState.active && offsideState.team === p.team),
        puckInDefZone,
        isDeepInZone,
        distToCarrier,
        amIClosest
        
    };
}









// --- CONDITIONS ---
const condHasPuck        = new ConditionNode(bb => bb.hasPuck);
const condLoosePuck      = new ConditionNode(bb => bb.loosePuck);
const condOppHasPuck     = new ConditionNode(bb => bb.oppHasPuck);
const condTeamHasPuck    = new ConditionNode(bb => bb.teamHasPuck);
const condPuckInDefZone  = new ConditionNode(bb => bb.puckInDefZone);
const condInShotRange    = new ConditionNode(bb => bb.inShotRange);
const condInDefShotRange = new ConditionNode(bb => bb.inDefShotRange);
const condAmIClosest     = new ConditionNode(bb => bb.amIClosest);
const DZone              = new ConditionNode(bb => (bb.myGoalX > RX) ? bb.p.x > (RX + T1.blue_line_offset) : bb.p.x < (RX - T1.blue_line_offset));
const OZone              = new ConditionNode(bb => (bb.enemyGoal > RX) ? bb.p.x > (RX + T1.blue_line_offset) : bb.p.x < (RX - T1.blue_line_offset));
const condPuckDeep       = new ConditionNode(bb => bb.isDeepInZone);
const condInHittingRange = new ConditionNode(bb => bb.distToCarrier < 60);
const condDelayedOffside = new ConditionNode(bb => bb.isDelayedOffside);



// --- ACTIONS (GENERAL) ---
const actChasePuck = new ActionNode(bb => { return { tx: puck.x, ty: puck.y, action: "none" }; });
const actDriveNet = new ActionNode(bb => { return { tx: bb.enemyGoal, ty: RY, action: "none" }; });
const actShoot = new ActionNode(bb => { return { tx: bb.enemyGoal, ty: RY, action: "shoot" }; });


// --- NEW ACTION: BODY CHECK ---
const actBodyCheck = new ActionNode(bb => {
    if (!bb.carrier) return null;
    
    // Predict where they are going and aim slightly THROUGH them
    // We multiply velocity by 10 to create a "lead" point
    const tx = bb.carrier.x + bb.carrier.vx * 10;
    const ty = bb.carrier.y + bb.carrier.vy * 10;
    
    return { tx: tx, ty: ty, action: "none" };
});


// --- ACTIONS (DEFENDER SPECIFIC) ---
const actGapControl = new ActionNode(bb => {
    if (!bb.carrier) return null;
    const midX = (bb.carrier.x + bb.myGoalX) / 2;
    const midY = (bb.carrier.y + RY) / 2;
    return { tx: midX, ty: midY, action: "none" };
});

const actHoverBlueLine = new ActionNode(hoverDynamicLine);  // Calls the helper

const actEvadePressure = new ActionNode(evadePressure);  // Calls the helper function

const actDefenderPass = new ActionNode(bb => {
    const mates = players.filter(m => m.team === bb.p.team && m.id !== bb.p.id && m.type === "skater");
    let bestTarget = null, bestDistToNet = Infinity;
    for (const m of mates) {
        let safe = true;
        for (const o of players) {
            if (o.team !== bb.p.team && Math.hypot(o.x - m.x, o.y - m.y) < 80) { safe = false; break; }
        }
        if (!safe) continue;
        if (isLaneBlocked(bb.p.x, bb.p.y, m.x, m.y, bb.p.team)) continue;
        const dToNet = Math.hypot(m.x - bb.enemyGoal, m.y - RY);
        if (dToNet < bestDistToNet) { bestDistToNet = dToNet; bestTarget = m; }
    }
    if (bestTarget) return { tx: bestTarget.x, ty: bestTarget.y, action: "pass", target: bestTarget };
    return null; 
});

// --- ACTIONS (FORWARD SPECIFIC) ---

const actMirrorAttacker = new ActionNode(bb => {
    if (!bb.attackerMate) return { tx: puck.x, ty: puck.y, action: "none" };
    const attacker = bb.attackerMate;
    const attackerIsTop = (attacker.y < RY);
    const laneOffset = 85; 
    const targetY = attackerIsTop ? (RY + laneOffset) : (RY - laneOffset);
    return { tx: puck.x, ty: targetY, action: "none" };
});

const actAttackerBreakout = new ActionNode(bb => {
    const candidates = [RY - 80, RY, RY + 80];
    const testX = bb.enemyGoal; 
    let bestY = RY;
    let bestScore = -9999;
    for (let y of candidates) {
        const score = openSpaceScore(testX, y, bb.p.team);
        if (score > bestScore) { bestScore = score; bestY = y; }
    }
    return { tx: bb.enemyGoal, ty: bestY, action: "none" };
});

// NEW: SMART FORWARD PASS
const actSmartForwardPass = new ActionNode(bb => {
    if (!bb.forwardMate) return null; // No partner found?
    const mate = bb.forwardMate;

    // Helper to calculate "Openness Score"
    // Returns 0-100 (Higher is better)
    function getOpennessScore(player) {
        let score = 100;
        
        // 1. Proximity Check (Radius 80px)
        let nearestDist = 999;
        for (const o of players) {
            if (o.team !== bb.p.team) {
                const d = Math.hypot(player.x - o.x, player.y - o.y);
                if (d < nearestDist) nearestDist = d;
            }
        }
        // If enemy is within 80px, score drops drastically
        if (nearestDist < 80) {
            score -= (80 - nearestDist) * 2; // Heavy penalty for pressure
        }

        // 2. Lane Ahead Check (Is the path to goal clear?)
        if (isLaneBlocked(player.x, player.y, bb.enemyGoal, RY, bb.p.team)) {
            score -= 50; // Big penalty if blocked
        }

        return score;
    }

    // 1. Evaluate Direct Passing Lane
    if (isLaneBlocked(bb.p.x, bb.p.y, mate.x, mate.y, bb.p.team)) return null;

    // 2. Compare Scores
    const myScore = getOpennessScore(bb.p);
    const mateScore = getOpennessScore(mate);

    // 3. Decision: Only pass if he is significantly better off (+20 buffer)
    // "If both have similar open space there is no need for a pass"
    if (mateScore > myScore + 20) {
        return { tx: mate.x, ty: mate.y, action: "pass", target: mate };
    }

    return null; // Keep puck
});

// tag up if delayed offside
const actTagUp_T1 = new ActionNode(bb => {
    const dir = (bb.enemyGoal > RX) ? 1 : -1;
    const safeX = RX - dir * 80; // get OUT of offensive zone
    return { tx: safeX, ty: RY, action: "none" };
});




// === TREES ================================================================


// TREE 1: ATTACKER (Role P)
const TREE_ATTACKER = new SelectorNode([
    new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
    new SequenceNode([
        condHasPuck,
        new SelectorNode([
            new SequenceNode([ condInShotRange, actShoot ]), 
            actSmartForwardPass, // <--- New Smart Pass Check
            actDriveNet 
        ])
    ]),
    new SequenceNode([ condTeamHasPuck, actAttackerBreakout ]),
    actChasePuck 
]);


// TREE 2: WINGER (Role S)
const TREE_WINGER = new SelectorNode([
    new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
    new SequenceNode([
        condHasPuck,
        new SelectorNode([
            new SequenceNode([ condInShotRange, actShoot ]), 
            actSmartForwardPass, 
            actDriveNet 
        ])
    ]),
    new SequenceNode([ condLoosePuck, condAmIClosest, actChasePuck ]),
    actMirrorAttacker
]);

// TREE 3: DEFENDER (Role D)
const TREE_DEFENDER = new SelectorNode([
    new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
    new SequenceNode([
        condHasPuck,
        new SelectorNode([

            new SequenceNode([
                OZone,
                new SelectorNode([
                    new SequenceNode([ condInDefShotRange, actShoot ]),
                    actDriveNet
                ])
            ]),    

            new SequenceNode([    
                DZone,
                new SelectorNode([
                    actEvadePressure,
                    actDefenderPass,
                    new SequenceNode([ condInDefShotRange, actShoot ]),
                    actDriveNet
                ])
            ])    
        ])          
    ]),
    new SequenceNode([ condLoosePuck, condPuckInDefZone, actChasePuck ]),



    // OPPONENT HAS PUCK
    new SequenceNode([
        condOppHasPuck,
        new SelectorNode([
            // A. CORNER OVERRIDE: If puck is deep, Attack!
            new SequenceNode([ condPuckDeep, actChasePuck ]),
            
            // B. FINISH THE CHECK: If he gets too close, HIT HIM.
            new SequenceNode([ condInHittingRange, actBodyCheck ]),
            
            // C. STANDARD: Otherwise, play Gap Control (Back up)
            actGapControl
        ])
    ]),



    actHoverBlueLine
]);


// --- MAIN FUNCTION ---
function thinkTeam1(p) {
    const bb = makeBB(p);
    
    if (p.role === "P") {
        let output = TREE_ATTACKER.tick(bb);
        if (output) return output;
    }
    else if (p.role === "S") {
        let output = TREE_WINGER.tick(bb);
        if (output) return output;
    }
    else if (p.role === "D") {
        let output = TREE_DEFENDER.tick(bb);
        if (output) return output;
    }

    return { tx: RX, ty: RY, action: "none" };
}