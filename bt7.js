// ==========================================
// STRATEGY: BT7 — THE ASSASSIN
// ==========================================
// - Ultra patient
// - Low movement
// - Only takes high-percent shots
// - Surgical passing
// - No dump & chase
// ==========================================

(function() {

    const STRATEGY_ID   = "BT7_Assassin";
    const STRATEGY_NAME = "The Assassin";

    // --- SENSES ---
    function makeBB(p) {
        const myGoalX    = (p.team === 0) ? goal1 : goal2;
        const enemyGoal  = (p.team === 0) ? goal2 : goal1;
        const carrier    = getPlayerById(puck.ownerId);

        const teammates = players.filter(m => m.team === p.team && m.id !== p.id && m.type === "skater");
        const opponents = players.filter(m => m.team !== p.team && m.type === "skater");

        const hasPuck = (puck.ownerId === p.id);
        const loose   = (puck.ownerId === null);
        const oppHas  = (carrier && carrier.team !== p.team);

        const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);

        // Pressure = closest opponent distance
        let pressure = 999;
        for (const o of opponents) {
            const d = Math.hypot(o.x - p.x, o.y - p.y);
            if (d < pressure) pressure = d;
        }

        return {
            p,
            hasPuck,
            loose,
            oppHas,
            teammates,
            opponents,
            enemyGoal,
            myGoalX,
            distToNet,
            pressure
        };
    }

    // --- ACTIONS ---
    const actShoot = (bb) => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" });

    const actHold = (bb) => {
        // just a tiny drift toward better angle
        const ang = Math.atan2(RY - bb.p.y, bb.enemyGoal - bb.p.x);
        return {
            tx: bb.p.x + Math.cos(ang) * 60,
            ty: bb.p.y + Math.sin(ang) * 60,
            action: "none"
        };
    };

    const actPass = (bb, mate) => ({
        tx: mate.x,
        ty: mate.y,
        action: "pass",
        target: mate
    });

    const actChase = (bb) => ({ tx: puck.x, ty: puck.y, action: "none" });

    const actShadow = (bb) => {
        const carrier = getPlayerById(puck.ownerId);
        if (!carrier) return actChase(bb);
        return {
            tx: (carrier.x + bb.enemyGoal) * 0.5,
            ty: carrier.y,
            action: "none"
        };
    };

    // --- PASS SELECTION ---
    function bestPass(bb) {
        let best = null;
        let bestScore = -999;

        for (const m of bb.teammates) {
            if (isLaneBlocked(bb.p.x, bb.p.y, m.x, m.y, bb.p.team)) continue;

            const myDist = bb.distToNet;
            const mateDist = Math.hypot(m.x - bb.enemyGoal, m.y - RY);

            // only forward progress
            if (mateDist >= myDist) continue;

            const score = (myDist - mateDist) + Math.random() * 10;
            if (score > bestScore) {
                bestScore = score;
                best = m;
            }
        }

        return best;
    }

    // --- THE BRAIN ---
  function think(p) {
    const bb = makeBB(p);

    // -----------------------------------------
    // WITH PUCK
    // -----------------------------------------
    if (bb.hasPuck) {

        // 1. EMERGENCY SHOOT (anti-grinder)
        // If an opponent is within 90px → fire immediately.
        if (bb.pressure < 90) {
            return actShoot(bb);
        }

        // 2. High-quality lane shot
        const open = !isLaneBlocked(bb.p.x, bb.p.y, bb.enemyGoal, RY, p.team);
        if (open && bb.distToNet < 240) {
            return actShoot(bb);
        }

        // 3. Smart pass if someone is clearly improving the attack
        const pass = bestPass(bb);
        if (pass) return actPass(bb, pass);

        // 4. Hold if completely safe
        if (bb.pressure > 150) {
            return actHold(bb);
        }

        // 5. Lateral evade (prevent standing still)
        const ang = p.angle + Math.PI / 2;
        return {
            tx: p.x + Math.cos(ang) * 80,
            ty: p.y + Math.sin(ang) * 80,
            action: "none"
        };
    }

    // -----------------------------------------
    // TEAMMATE HAS PUCK
    // -----------------------------------------
    if (!bb.hasPuck && bb.carrier?.team === p.team) {
        // Stay in a triangular support spot
        const ang = Math.atan2(bb.p.y - RY, bb.p.x - bb.enemyGoal);
        return {
            tx: bb.p.x - Math.cos(ang) * 85,
            ty: bb.p.y - Math.sin(ang) * 85,
            action: "none"
        };
    }

    // -----------------------------------------
    // OPPONENT HAS PUCK
    // -----------------------------------------
    if (bb.oppHas) {
        // Shadow their best shooting lane (Assassin style)
        return actShadow(bb);
    }

    // -----------------------------------------
    // LOOSE PUCK
    // -----------------------------------------
    if (bb.loose) {
        return actChase(bb);
    }

    return actChase(bb);
}


    // --- REGISTER (MUST MATCH ENGINE FORMAT) ---
    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "The Assassins",
            "Senators",
            "OTT",
            think,
            { main: "#420000", secondary: "#780000"} // dark red - red
        );
    }

})();
