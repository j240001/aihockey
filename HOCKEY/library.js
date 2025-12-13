// =========================================================
// GLOBAL NODE LIBRARY
// Defines all Conditions and Actions for the Strategy Interpreter
// =========================================================


const NODE_LIBRARY = [
    { header: "FLOW CONTROL" },
    { type: "Selector",         cat: "struct", label: "Selector",           acr: "SEL",  req: "ANY" },
    { type: "Sequence",         cat: "struct", label: "Sequence",           acr: "SEQ",  req: "ANY" },
    
    { header: "STATE SETTERS (Context)" },
    { type: "condHasPuck",          cat: "cond", label: "Has Puck",             acr: "HAVE",  sets: "OFF", req: "ANY" },
    { type: "condTeamHasPuck",      cat: "cond", label: "Teammate Has",         acr: "TM",    sets: "OFF", req: "ANY" },
    { type: "condOppHasPuck",       cat: "cond", label: "Opponent Has",         acr: "OPP",   sets: "DEF", req: "ANY" },
    { type: "condLoosePuck",        cat: "cond", label: "Loose Puck",           acr: "LOOSE", sets: "NEU", req: "ANY" },

    { header: "OFFSIDE LOGIC (DLY)" },
    { type: "condTeammatesOffside", cat: "cond", label: "Teammates Offside",    acr: "OFFS?", sets: "DLY", req: "ANY" },
    { type: "actTagUp_T1",          cat: "act",  label: "Tag Up",               acr: "TAG",   req: "DLY" }, 
    
    { header: "CHECKS (No Context Change)" },
    { type: "condPuckInDefZone",    cat: "cond", label: "Puck Def Zone",        acr: "DZ",    req: "ANY" },
    { type: "condPuckInNeuZone",    cat: "cond", label: "Puck Neu Zone",        acr: "NZ",    req: "ANY" },
    { type: "condPuckInOffZone",    cat: "cond", label: "Puck Off Zone",        acr: "OZ",    req: "ANY" },
    { type: "condAmIClosest",       cat: "cond", label: "Am I Closest?",        acr: "ME?",   req: "ANY" },

    { header: "OFFENSIVE ACTIONS" },
    { type: "condInShotRange",      cat: "cond", label: "In Shot Range",        acr: "RNG",   req: "OFF" },
    { type: "condForwardLaneClear", cat: "cond", label: "Fwd Lane Clear",       acr: "CLR?",  req: "OFF" },
    { type: "condHasBreakoutPass",  cat: "cond", label: "Has Breakout",         acr: "BRK?",  req: "OFF" },
    { type: "condHasBackdoor",      cat: "cond", label: "Has Backdoor",         acr: "BD?",   req: "OFF" },
    { type: "condIsPressured",      cat: "cond", label: "Is Pressured",         acr: "PRES?", req: "OFF" },
    
    { type: "actShoot",             cat: "act",  label: "Shoot",                acr: "SHOT",  req: "OFF" },
    { type: "actDriveNet",          cat: "act",  label: "Drive Net",            acr: "DRIV",  req: "ANY" },
    { type: "actExecuteCarry",      cat: "act",  label: "Execute Carry",        acr: "CARY",  req: "ANY" },
    { type: "actExecutePass",       cat: "act",  label: "Execute Pass",         acr: "PASS",  req: "ANY" },
    { type: "actSupportPosition",   cat: "act",  label: "Support Pos",          acr: "SUP",   req: "ANY" },
    { type: "actGoBackdoor",        cat: "act",  label: "Go Backdoor",          acr: "OBD",   req: "OFF" },

    { header: "DEFENSIVE ACTIONS" },
    { type: "actDefendHome",        cat: "act",  label: "Defend Home",          acr: "HOME",  req: "DEF" },
    { type: "actAggressiveGap",     cat: "act",  label: "Aggressive Gap",       acr: "GAP",   req: "ANY" },
    { type: "actClearPuck",         cat: "act",  label: "Clear Puck",           acr: "CLR",   req: "DEF" }, 

    { header: "NEUTRAL ACTIONS" },
    { type: "actSmartIntercept",    cat: "act",  label: "Smart Intercept",      acr: "INT",   req: "ANY" },

    { header: "UNIVERSAL" },
    { type: "actHoverBlueLine",     cat: "act",  label: "Hover Blue Line",      acr: "HOVR",  req: "ANY" }, 
    { type: "actRegroup",           cat: "act",  label: "Regroup",              acr: "GRP",   req: "ANY" }, 
    
    { type: "actIdle",              cat: "act",  label: "Idle / Stop",          acr: "IDLE",  req: "ANY" },
    { type: "actChill",             cat: "act",  label: "Chill",                acr: "CHIL",  req: "ANY" },
    { type: "actSafetyPosition",    cat: "act",  label: "Safety Pos",           acr: "SAFE",  req: "ANY" },
];



// --- CONDITIONS ---
window.condHasPuck = new ConditionNode(bb => bb.hasPuck);
window.condLoosePuck = new ConditionNode(bb => bb.loosePuck);
window.condInShotRange = new ConditionNode(bb => bb.inShotRange);
window.condTeamHasPuck = new ConditionNode(bb => bb.teamHasPuck);
window.condOppHasPuck = new ConditionNode(bb => bb.oppHasPuck);
window.condPuckInDefZone = new ConditionNode(bb => bb.puckInDefZone);
window.condPuckInOffZone = new ConditionNode(bb => bb.puckInOffZone);
window.condPuckInNeuZone = new ConditionNode(bb => bb.puckInNeuZone);
window.condTeammatesOffside = new ConditionNode(bb => checkTeammatesOffside(bb.p));

window.condIsPressured = new ConditionNode(bb => {
    let pressureCount = 0;
    for (const o of players) {
        if (o.team !== bb.p.team && Math.hypot(o.x - bb.p.x, o.y - bb.p.y) < 80) pressureCount++;
    }
    return pressureCount >= 2;
});

window.condAmIClosest = new ConditionNode(bb => {
    let c = null, d = 9999;
    for (let m of players) {
        // FIX: Ignore goalie
        if (m.team === bb.p.team && m.type === 'skater') {
            let dist = Math.hypot(m.x - puck.x, m.y - puck.y);
            if (dist < d) { d = dist; c = m; }
        }
    }
    return c && c.id === bb.p.id;
});

window.condForwardLaneClear = new ConditionNode(bb => {
    bb.carryTarget = { x: bb.p.x + bb.forwardDir * 100, y: bb.p.y };
    return !isLaneBlocked(bb.p.x, bb.p.y, bb.carryTarget.x, bb.carryTarget.y, bb.p.team);
});

window.condHasBreakoutPass = new ConditionNode(bb => {
    for (let m of players) {
        if (m.team === bb.p.team && m.id !== bb.p.id && m.type === 'skater' && (m.x - bb.p.x) * bb.forwardDir > 0) {
            if (!isLaneBlocked(bb.p.x, bb.p.y, m.x, m.y, bb.p.team)) {
                bb.passTarget = m;
                return true;
            }
        }
    }
    return false;
});

window.condHasBackdoor = new ConditionNode(bb => {
    const target = findBackdoorTarget(bb.p);
    if (target) { bb.passTarget = target; return true; }
    return false;
});

// --- ACTIONS ---
window.actShoot = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" }));
window.actIdle = new ActionNode(bb => ({ tx: bb.p.x, ty: bb.p.y, action: "none" }));
window.actChill = new ActionNode(bb => ({ tx: bb.p.x, ty: bb.p.y, action: "none" }));

window.actDriveNet = new ActionNode(bb => ({ 
    tx: bb.enemyGoal - (bb.forwardDir * 40), 
    ty: RY, 
    action: "none" 
}));

window.actHoverBlueLine = new ActionNode(bb => {
    let yOff = 0;
    if (bb.p.role === 'LW' || bb.p.role === 'LD') yOff = -100;
    if (bb.p.role === 'RW' || bb.p.role === 'RD') yOff = 100;
    return { tx: (bb.forwardDir === 1 ? bb.safeRX + 60 : bb.safeRX - 60), ty: RY + yOff, action: "none" };
});

window.actTagUp_T1 = new ActionNode(bb => ({ tx: bb.safeRX - bb.forwardDir * 50, ty: RY, action: "none" }));

window.actSmartIntercept = new ActionNode(bb => {
    const target = getPuckIntercept(bb.p);
    return { tx: target.x, ty: target.y, action: "none" };
});

window.actExecuteCarry = new ActionNode(bb => {
    if (bb.carryTarget) return { tx: bb.carryTarget.x, ty: bb.carryTarget.y, action: "none" };
    // Default carry logic if target missing
    return { tx: bb.enemyGoal, ty: RY, action: "none" };
});

window.actExecutePass = new ActionNode(bb => {
    if (bb.passTarget) return { tx: bb.passTarget.x, ty: bb.passTarget.y, action: "pass", target: bb.passTarget };
    return { tx: bb.enemyGoal, ty: RY, action: "none" };
});

window.actDefendHome = new ActionNode(bb => {
    let yOff = 0;
    if (bb.p.role === 'LD' || bb.p.role === 'LW') yOff = -60;
    if (bb.p.role === 'RD' || bb.p.role === 'RW') yOff = 60;
    return { tx: bb.myGoalX + (bb.forwardDir * 120), ty: RY + yOff, action: 'none' };
});

window.actAggressiveGap = new ActionNode(bb => {
    const carrier = getPlayerById(puck.ownerId) || {x:puck.x, y:puck.y};
    return getAggressiveGapTarget(bb.p, carrier, bb.myGoalX);
});

window.actClearPuck = new ActionNode(bb => clearPuckDefensive(bb.p));

window.actGoBackdoor = new ActionNode(bb => getBackdoorPosition(bb.p));

window.actRegroup = new ActionNode(bb => ({ 
    tx: bb.myGoalX + (bb.forwardDir * 150), 
    ty: RY, 
    action: "none" 
}));