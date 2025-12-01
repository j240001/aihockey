// ==========================================
// TEAM 0 — TOTAL OFFENSE & ONE-TIMERS
// ==========================================

const T0 = {
    shoot_range: 250,       // Increased range (shoot from anywhere in zone)
    guaranteed_range: 140, 
    blue_line_offset: 110,
    check_range: 80
};

// --- BLACKBOARD ---
function makeBB_T0(p) {
    const myGoalX = (p.team === 0) ? goal1 : goal2;
    const enemyGoal = (p.team === 0) ? goal2 : goal1;
    const attackingRight = (enemyGoal > RX);
    
    const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);
    const carrier = getPlayerById(puck.ownerId);
    
    const laneBlocked = isLaneBlocked(p.x, p.y, enemyGoal, RY, p.team);

    let amIClosest = true;
    const myDist = Math.hypot(puck.x - p.x, puck.y - p.y);
    for (const mate of players) {
        if (mate.team === p.team && mate.id !== p.id && mate.type === "skater") {
            const mateDist = Math.hypot(puck.x - mate.x, puck.y - mate.y);
            if (mateDist < myDist) {
                amIClosest = false; 
                break; 
            }
        }
    }
    
    // Zone Definitions
    const blueLineX = attackingRight ? (RX + 110) : (RX - 110);
    const inOffensiveZone = attackingRight ? (p.x > blueLineX) : (p.x < blueLineX);
    const puckInOffensiveZone = attackingRight ? (puck.x > blueLineX) : (puck.x < blueLineX);

    return {
        p,
        myGoalX,
        enemyGoal,
        attackingRight,
        distToNet,
        laneBlocked,
        amIClosest,
        inOffensiveZone,
        puckInOffensiveZone,
        
        isDelayedOffside: (offsideState.active && offsideState.team === p.team),

        hasPuck: (puck.ownerId === p.id),
        justReceived: (puck.ownerId === p.id && p.possessionTime < 30), // < 0.5s hold

        teamHasPuck: (carrier && carrier.team === p.team),
        oppHasPuck: (carrier && carrier.team !== p.team),
        loosePuck: (puck.ownerId === null),
        carrier,
        distToCarrier: carrier ? Math.hypot(carrier.x - p.x, carrier.y - p.y) : 9999

    };
}

// --- CONDITIONS (Prefixed with T0_) ---
const T0_cHasPuck        = new ConditionNode(bb => bb.hasPuck);
const T0_cOppHasPuck     = new ConditionNode(bb => bb.oppHasPuck);
const T0_cLoosePuck      = new ConditionNode(bb => bb.loosePuck);
const T0_cTeamHasPuck    = new ConditionNode(bb => bb.teamHasPuck);
const T0_cAmIClosest     = new ConditionNode(bb => bb.amIClosest);
const T0_cInOffZone      = new ConditionNode(bb => bb.inOffensiveZone);
const T0_cDelayedOffside = new ConditionNode(bb => bb.isDelayedOffside);

// *** NEW: ONE-TIMER CHECK ***
const T0_cJustReceived = new ConditionNode(bb => bb.justReceived);

const T0_cCanShoot = new ConditionNode(bb => {
    if (bb.distToNet > T0.shoot_range) return false;
    if (bb.distToNet < T0.guaranteed_range) return true;
    if (bb.laneBlocked) return false;
    return true;
});

const T0_cCanCheck = new ConditionNode(bb => {
    return (bb.oppHasPuck && bb.distToCarrier < T0.check_range);
});

// --- ACTIONS (Prefixed with T0_) ---

const T0_actRipShot = new ActionNode(bb => {
    const spread = (Math.random() * 20) - 10;
    return { tx: bb.enemyGoal, ty: RY + spread, action: "shoot" };
});

const T0_actChase = new ActionNode(bb => {
    return { tx: puck.x, ty: puck.y, action: "none" };
});

const T0_actBodyCheck = new ActionNode(bb => {
    if (!bb.carrier) return null;
    const tx = bb.carrier.x + bb.carrier.vx * 15;
    const ty = bb.carrier.y + bb.carrier.vy * 15;
    return { tx: tx, ty: ty, action: "none" };
});

const T0_actDriveLane = new ActionNode(bb => {
    let laneOffset = 0;
    if (bb.p.role === "B") laneOffset = -80;
    if (bb.p.role === "C") laneOffset = 80;
    // If A is acting as forward, they take center
    if (bb.p.role === "A") laneOffset = 0;

    const dir = bb.attackingRight ? 1 : -1;
    // Collision Avoidance
    for (const mate of players) {
        if (mate.team === bb.p.team && mate.id !== bb.p.id) {
            const dx = mate.x - bb.p.x;
            const dy = mate.y - bb.p.y;
            if (Math.abs(dy) < 30 && dx * dir > 0 && dx * dir < 60) {
                laneOffset += (dy > 0 ? -40 : 40); 
            }
        }
    }

    return { tx: bb.enemyGoal, ty: RY + laneOffset, action: "none" };
});

const T0_actTagUp = new ActionNode(bb => {
    // Run to the Neutral Zone side of the blue line
    const dir = bb.attackingRight ? 1 : -1;
    // Target: Center Ice + slight buffer so they definitely cross the line
    const safeX = RX + (dir * 80); 
    
    return { tx: safeX, ty: RY, action: "none" };
});

const T0_actSupportHover = new ActionNode(bb => {
    let laneOffset = 0;
    if (bb.p.role === "B") laneOffset = -60;
    if (bb.p.role === "C") laneOffset = 60;
    const dir = bb.attackingRight ? 1 : -1;
    return { tx: puck.x - (dir * 100), ty: RY + laneOffset, action: "none" };
});

const T0_actBackcheck = new ActionNode(bb => {
    const dir = bb.attackingRight ? 1 : -1;
    const slotX = bb.myGoalX + (dir * 120);
    let laneOffset = 0;
    if (bb.p.role === "B") laneOffset = -50;
    if (bb.p.role === "C") laneOffset = 50;
    return { tx: slotX, ty: RY + laneOffset, action: "none" };
});

const T0_actGapControl = new ActionNode(bb => {
    if (!bb.carrier) return { tx: bb.myGoalX, ty: RY, action: "none" };
    const midX = (bb.carrier.x + bb.myGoalX) / 2;
    const midY = (bb.carrier.y + RY) / 2;
    return { tx: midX, ty: midY, action: "none" };
});

const T0_actForwardPass = new ActionNode(bb => {
    const forwardDir = bb.attackingRight ? 1 : -1;
    
    const potentialTargets = players.filter(m => {
        if (m.team !== bb.p.team || m.id === bb.p.id) return false;
        if (m.stunTimer > 0) return false;
        if ((m.x - bb.p.x) * forwardDir <= 40) return false;
        if (Math.hypot(m.x - bb.p.x, m.y - bb.p.y) > 350) return false;
        return true;
    });

    potentialTargets.sort((a, b) => {
        const distA = Math.hypot(bb.enemyGoal - a.x, RY - a.y);
        const distB = Math.hypot(bb.enemyGoal - b.x, RY - b.y);
        return distA - distB; 
    });

    for (const target of potentialTargets) {
        if (!isLaneBlocked(bb.p.x, bb.p.y, target.x, target.y, bb.p.team)) {
            return { tx: target.x, ty: target.y, action: "pass", target: target };
        }
    }
    return null;
});

const T0_actCrossCreasePass = new ActionNode(bb => {
    if (!bb.inOffensiveZone) return null;

    const mates = players.filter(m => m.team === bb.p.team && m.id !== bb.p.id);
    const blueLineX = bb.attackingRight ? (RX + 110) : (RX - 110);
    
    for (const m of mates) {
        if (m.stunTimer > 0) continue;
        const dist = Math.hypot(m.x - bb.p.x, m.y - bb.p.y);
        if (dist > 350) continue;

        const mateInZone = bb.attackingRight ? (m.x > blueLineX) : (m.x < blueLineX);
        if (!mateInZone) continue;

        const lateralDist = Math.abs(bb.p.y - m.y);
        if (lateralDist < 120) continue; 

        if (!isLaneBlocked(bb.p.x, bb.p.y, m.x, m.y, bb.p.team)) {
            return { tx: m.x, ty: m.y, action: "pass", target: m };
        }
    }
    
    return null;
});

const T0_actBailoutPass = new ActionNode(bb => {
    const mates = players.filter(m => m.team === bb.p.team && m.id !== bb.p.id);
    for (const m of mates) {
        if (m.stunTimer > 0) continue;
        if (Math.hypot(m.x - bb.p.x, m.y - bb.p.y) > 350) continue;

        if (!isLaneBlocked(bb.p.x, bb.p.y, m.x, m.y, bb.p.team)) {
            return { tx: m.x, ty: m.y, action: "pass", target: m };
        }
    }
    return null; 
});

const T0_actDefenderMove = new ActionNode(bb => {
    const dir = bb.attackingRight ? 1 : -1;
    let puckZone = "neutral";
    if (bb.attackingRight) {
        if (puck.x < RX - 110) puckZone = "def";
        else if (puck.x > RX + 110) puckZone = "off";
    } else {
        if (puck.x > RX + 110) puckZone = "def";
        else if (puck.x < RX - 110) puckZone = "off";
    }

    let targetX = RX;
    let targetY = RY;

    if (puckZone === "def") {
        targetX = bb.myGoalX + (dir * 140);
        targetY = RY; 
    } 
    else if (puckZone === "neutral") {
        targetX = bb.myGoalX + (dir * 280); 
        targetY = puck.y;
    }
    else {
        // Only triggered if not carrying puck (handled by tree logic)
        targetX = RX + (dir * 130); 
        targetY = puck.y;
        if (targetY < RY - 120) targetY = RY - 120;
        if (targetY > RY + 120) targetY = RY + 120;
    }

    return { tx: targetX, ty: targetY, action: "none" };
});


// --- BEHAVIOR TREES ---

// 1. ATTACK TREE (Used by Forwards OR Defender in O-Zone)
const T0_TREE_FORWARD = new SelectorNode([
    
    // EMERGENCY: If offside, get out!
    new SequenceNode([ T0_cDelayedOffside, T0_actTagUp ]),


    new SequenceNode([
        T0_cHasPuck,
        new SelectorNode([
            
            // 1. ONE-TIMER: If I just caught it in the O-Zone -> RIP IT.
            // Ignored lane blocks. Just shoot.
            new SequenceNode([ T0_cInOffZone, T0_cJustReceived, T0_actRipShot ]),

            // 2. Guaranteed Goal (Jam it)
            new SequenceNode([ new ConditionNode(bb => bb.distToNet < 140), T0_actRipShot ]),

            // 3. Cross-Crease Pass (Golden Opportunity)
            T0_actCrossCreasePass,

            // 4. Standard Open Shot
            new SequenceNode([ T0_cCanShoot, T0_actRipShot ]), 
            
            // 5. Transition Pass
            T0_actForwardPass,

            // 6. Drive
            T0_actDriveLane 
        ])
    ]),
    new SequenceNode([
        T0_cLoosePuck,
        new SelectorNode([
            new SequenceNode([ T0_cAmIClosest, T0_actChase ]),
            T0_actSupportHover
        ])
    ]),
    new SequenceNode([ 
        T0_cOppHasPuck, 
        new SelectorNode([
            new SequenceNode([ T0_cCanCheck, T0_actBodyCheck ]),
            T0_actBackcheck
        ])
    ]),
    new SequenceNode([ T0_cTeamHasPuck, T0_actDriveLane ]),
    T0_actDriveLane 
 
]);




// 2. DEFENDER TREE (Only used when Puck is in Neutral/Def Zone)
const T0_TREE_DEFENDER = new SelectorNode([

    // EMERGENCY: If offside, get out!
    new SequenceNode([ T0_cDelayedOffside, T0_actTagUp ]),
    
    new SequenceNode([
        T0_cHasPuck,
        new SelectorNode([
            new SequenceNode([ T0_cCanShoot, T0_actRipShot ]), 
            T0_actForwardPass,
            T0_actBailoutPass,
            T0_actDriveLane 
        ])
    ]),
    new SequenceNode([ 
        T0_cOppHasPuck, 
        new SelectorNode([
            new SequenceNode([ T0_cCanCheck, T0_actBodyCheck ]),
            T0_actGapControl 
        ])
    ]),
    new SequenceNode([ T0_cLoosePuck, T0_cAmIClosest, T0_actChase ]),
    T0_actDefenderMove
]);


// --- MAIN THINK FUNCTION ---
function thinkTeam0(p) {
    const bb = makeBB_T0(p);
    
    // *** TOTAL OFFENSE SWITCH ***
    // If puck is in Offensive Zone, EVERYONE uses the Forward Tree.
    // This turns the Defender (A) into a 3rd Attacker.
    if (bb.puckInOffensiveZone) {
        return T0_TREE_FORWARD.tick(bb);
    }

    // Otherwise, play positions
    if (p.role === "A") {
        return T0_TREE_DEFENDER.tick(bb);
    } 
    else {
        return T0_TREE_FORWARD.tick(bb);
    }
}