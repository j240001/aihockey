// ==========================================
// STRATEGY: BT_PASSMASTER_SURVIVAL (BT9)
// VERSION: v2 — Corrected "NO PUCK → FUNNEL" logic
// ==========================================
// - If our team does NOT have the puck → ALL skaters return to funnel.
// - Zero chasing. Zero intercepts. Zero skating after puck.
// - If we have the puck → normal pass/carry/shoot logic.
// - Slot passes forbidden. Slot clears sideways only.
// - Defensive funnel depth: X (just above crease).
// ==========================================

(function() {

    const STRATEGY_ID   = "BT_PassMaster_Survival_v2";
    const STRATEGY_NAME = "Pass Masters (Survival v2)";

    // ------------------------------------------
    // ROLE MAP
    // ------------------------------------------
    function roleMap(r) {
        if (r === "C") return "P";
        if (r === "LW" || r === "RW") return "S";
        return "D";
    }

    // ------------------------------------------
    // SLOT PASS REJECTION
    // ------------------------------------------
    function isOwnSlotPass(bb, x2, y2) {
        const p = bb.p;
        const forwardDir = bb.forwardDir;

        const midX = (p.x + x2) * 0.5;
        const inOurHalf = (forwardDir === 1) ? (midX < RX) : (midX > RX);
        if (!inOurHalf) return false;

        const slotHalf = 80;
        const yNow = Math.abs(p.y - RY);
        const yDest = Math.abs(y2 - RY);
        const yMid  = Math.abs(((p.y + y2) * 0.5) - RY);

        return (yNow < slotHalf && yDest < slotHalf && yMid < slotHalf);
    }

    // ------------------------------------------
    // MAKE BB
    // ------------------------------------------
    function makeBB(p) {
        const myGoalX   = (p.team === 0) ? goal1 : goal2;
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1;

        const carrier = getPlayerById(puck.ownerId);

        const hasPuck      = (puck.ownerId === p.id);
        const loosePuck    = (puck.ownerId === null);
        const teamHasPuck  = (carrier && carrier.team === p.team);
        const oppHasPuck   = (carrier && carrier.team !== p.team);

        const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);
        const distToOwnNet = Math.hypot(myGoalX - p.x, RY - p.y);

        let pressure = 999;
        for (const o of players) {
            if (o.team === p.team || o.type !== "skater") continue;
            const d = Math.hypot(o.x - p.x, o.y - p.y);
            if (d < pressure) pressure = d;
        }

        const myDist = Math.hypot(p.x - puck.x, p.y - puck.y);
        let amIClosest = true;
        const all = players.filter(m => m.team === p.team && m.type === "skater");
        for (const m of all) {
            if (m.id === p.id) continue;
            const d = Math.hypot(m.x - puck.x, m.y - puck.y);
            if (d < myDist) { amIClosest = false; break; }
        }

        all.sort((a, b) => a.id - b.id);
        const myIndex = all.findIndex(m => m.id === p.id);

        const blueLineX = RX + (BLUE_LINE_OFFSET * forwardDir);
        const defBlueX  = RX - (BLUE_LINE_OFFSET * forwardDir);
        const puckInDefZone  = (forwardDir === 1) ? (puck.x < defBlueX) : (puck.x > defBlueX);

        const isDelayedOffside = (offsideState.active && offsideState.team === p.team);

        let mustStayOnside = false;
        if (typeof offensiveZoneAllowed === "function") {
            mustStayOnside = !offensiveZoneAllowed(p) && !puckInDefZone;
        }

        const laneOpen = !isLaneBlocked(p.x, p.y, enemyGoal, RY, p.team);

        return {
            p,
            real_p: p,
            role: roleMap(p.role),
            myGoalX,
            enemyGoal,
            forwardDir,
            carrier,
            hasPuck,
            loosePuck,
            teamHasPuck,
            oppHasPuck,
            distToNet,
            distToOwnNet,
            pressure,
            amIClosest,
            mySkaters: all,
            myIndex,
            blueLineX,
            defBlueX,
            isDelayedOffside,
            mustStayOnside,
            laneOpen,

            carryTarget: null,
            passTarget: null,
            passPoint: null,
            bankTarget: null,
            bankPoint: null
        };
    }

    // =======================================================
    // CONDITIONS
    // =======================================================

    const condHasPuck     = new ConditionNode(bb => bb.hasPuck);

    // THIS IS THE NEW CORRECT CONDITION:
    // If our team does NOT have the puck → funnel.
    const condWeDoNotHavePuck = new ConditionNode(bb => !bb.teamHasPuck);

    const condTeamHasPuck = new ConditionNode(bb => bb.teamHasPuck);
    const condDelayedOffside = new ConditionNode(bb => bb.isDelayedOffside);
    const condMustStayOnside = new ConditionNode(bb => bb.mustStayOnside);

    const condOwnSlotDanger = new ConditionNode(bb => {
        return (bb.distToOwnNet < 180 && Math.abs(bb.p.y - RY) < 100);
    });

    const condFinisherZone = new ConditionNode(bb => {
        const close = bb.distToNet < 140;
        const med   = (bb.distToNet < 210 && bb.laneOpen);
        const press = (bb.pressure < 90 && bb.distToNet < 230);
        return close || med || press;
    });

    const condSafeCarryForward = new ConditionNode(bb => {
        const p = bb.p;
        const step = 130 * bb.forwardDir;
        const tx = p.x + step;
        if (isLaneBlocked(p.x, p.y, tx, p.y, p.team)) return false;
        bb.carryTarget = { x: tx, y: p.y };
        return true;
    });

    const condHighQualityPass = new ConditionNode(bb => {
        const p = bb.p;
        if (typeof p.brainPassCD !== "number") p.brainPassCD = 0;
        if (p.brainPassCD > 0) { p.brainPassCD--; return false; }

        const opts = findOpenTeammates(p);
        if (!opts || opts.length === 0) return false;

        let best = null;
        let bestScore = -999;

        for (const o of opts) {
            if (isOwnSlotPass(bb, o.leadX, o.leadY)) continue;
            if (passIntersectsOwnNet(p, o.mate.x, o.mate.y)) continue;

            const prog = (o.mate.x - p.x) * bb.forwardDir;
            if (prog < 20) continue;
            const d = Math.hypot(o.mate.x - p.x, o.mate.y - p.y);
            if (d < 60) continue;

            let score = 0;
            score += prog * 0.35;
            score += openSpaceScore(o.leadX, o.leadY, p.team) * 0.8;
            if (o.futureClear) score += 70;
            if (isLaneBlocked(p.x, p.y, o.leadX, o.leadY, p.team)) score -= 220;

            if (score > bestScore) {
                bestScore = score;
                best = o;
            }
        }

        if (!best || bestScore < 40) return false;

        bb.passTarget = best.mate;
        bb.passPoint = { x: best.leadX, y: best.leadY };
        return true;
    });

    const condBankPass = new ConditionNode(bb => {
        const p = bb.p;
        const opts = findOpenTeammates(p);
        if (!opts || opts.length === 0) return false;
        const boardYs = [RY - 230, RY + 230];

        let best = null;
        let bestScore = -999;

        for (const o of opts) {
            const prog = (o.mate.x - p.x) * bb.forwardDir;
            if (prog < 10) continue;

            for (const by of boardYs) {
                let bx = (p.x + o.mate.x) * 0.5;
                bx = Math.min(Math.max(bx,140),860);

                if (isLaneBlocked(p.x, p.y, bx, by, p.team)) continue;
                if (passIntersectsOwnNet(p, bx, by)) continue;
                if (isOwnSlotPass(bb, bx, by)) continue;
                if (isLaneBlocked(bx, by, o.mate.x, o.mate.y, p.team)) continue;

                let score = 0;
                score += prog * 0.4;
                score += openSpaceScore(o.mate.x, o.mate.y, p.team) * 0.7;

                const dist =
                    Math.hypot(bx - p.x, by - p.y) +
                    Math.hypot(o.mate.x - bx, o.mate.y - by);
                score -= dist * 0.08;

                if (score > bestScore) {
                    bestScore = score;
                    best = {mate:o.mate, bx, by};
                }
            }
        }

        if (!best || bestScore < 60) return false;

        bb.bankTarget = best.mate;
        bb.bankPoint = { x: best.bx, y: best.by };
        return true;
    });

    // =======================================================
    // ACTIONS
    // =======================================================

    const actTagUp = new ActionNode(bb => ({
        tx: bb.blueLineX - (bb.forwardDir * 40),
        ty: RY, action: "none"
    }));

    const actHoverBlue = new ActionNode(bb => ({
        tx: bb.blueLineX - (bb.forwardDir * 25),
        ty: clamp(puck.y,RY-100,RY+100),
        action:"none"
    }));

    const actShoot = new ActionNode(bb => ({
        tx: bb.enemyGoal, ty: RY, action:"shoot"
    }));

    const actCarryForward = new ActionNode(bb => ({
        tx: bb.carryTarget.x, ty: bb.carryTarget.y, action:"none"
    }));

    const actCarryLane = new ActionNode(bb => {
        const lane = pickCarryLane(bb.p);
        return { tx: lane.x, ty: lane.y, action:"none" };
    });

    const actExecutePass = new ActionNode(bb => {
        const p = bb.p;
        p.brainPassCD = 12;
        return {
            tx: bb.passPoint.x, ty: bb.passPoint.y,
            action:"pass", target: bb.passTarget
        };
    });

    const actExecuteBankPass = new ActionNode(bb => {
        const p = bb.p;
        p.brainPassCD = 16;
        return {
            tx: bb.bankPoint.x, ty: bb.bankPoint.y,
            action:"pass", target: bb.bankTarget
        };
    });

    const actWideSupport = new ActionNode(bb => {
        const carrier = bb.carrier;
        if (!carrier) return {tx:puck.x, ty:puck.y, action:"none"};

        const laneX = carrier.x + bb.forwardDir * 80;
        const ty = (bb.myIndex % 2 === 1) ? (RY -150) : (RY +150);

        return { tx: laneX, ty, action:"none" };
    });

    const actInterceptLoose = new ActionNode(bb => {
        if (typeof getPuckIntercept === "function") {
            const t = getPuckIntercept(bb.p);
            return { tx: t.x, ty: t.y, action:"none" };
        }
        return { tx: puck.x, ty:puck.y, action:"none" };
    });

    // ---- FUNNEL DEFENSE (deep)
    const actFunnelDefence = new ActionNode(bb => {
        const idx = bb.myIndex;

        const anchorX = bb.myGoalX + bb.forwardDir * 35;
        const anchorY = RY;

        const wingX = bb.myGoalX + bb.forwardDir * 70;
        const topY = RY - 60;
        const botY = RY + 60;

        if (idx === 0) {
            return { tx: anchorX, ty: anchorY, action:"none" };
        }
        if (idx === 1) {
            return { tx: wingX, ty: topY, action:"none" };
        }
        if (idx === 2) {
            return { tx: wingX, ty: botY, action:"none" };
        }

        return { tx: bb.myGoalX + bb.forwardDir * 50,
                 ty: (idx%2===0?RY-30:RY+30),
                 action:"none" };
    });

    const actSlotClearSideways = new ActionNode(bb => {
        const p = bb.p;
        const dirY = (p.y < RY) ? -1 : 1;
        return {
            tx: p.x + bb.forwardDir * 30,
            ty: RY + dirY * 220,
            action:"none"
        };
    });

    // =======================================================
    // WITH PUCK TREE
    // =======================================================

    const TREE_WITH_PUCK = new SelectorNode([
        new SequenceNode([ condOwnSlotDanger, actSlotClearSideways ]),
        new SequenceNode([ condFinisherZone, actShoot ]),
        new SequenceNode([ condSafeCarryForward, actCarryForward ]),
        new SequenceNode([ condHighQualityPass, actExecutePass ]),
        new SequenceNode([ condBankPass, actExecuteBankPass ]),
        actCarryLane
    ]);

    // =======================================================
    // ROLE TREES (UPDATED WITH condWeDoNotHavePuck)
    // =======================================================

    // ATTACKER
    const TREE_ATTACKER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp ]),
        new SequenceNode([ condMustStayOnside, actHoverBlue ]),
        new SequenceNode([ condHasPuck, TREE_WITH_PUCK ]),

        // *** NEW CORRECT BEHAVIOR ***
        new SequenceNode([ condWeDoNotHavePuck, actFunnelDefence ]),

        new SequenceNode([ condTeamHasPuck, actWideSupport ]),
        actHoverBlue
    ]);

    // SUPPORT
    const TREE_SUPPORT = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp ]),
        new SequenceNode([ condMustStayOnside, actHoverBlue ]),
        new SequenceNode([ condHasPuck, TREE_WITH_PUCK ]),

        // *** NEW CORRECT BEHAVIOR ***
        new SequenceNode([ condWeDoNotHavePuck, actFunnelDefence ]),

        new SequenceNode([ condTeamHasPuck, actWideSupport ]),
        actHoverBlue
    ]);

    // DEFENDER
    const TREE_DEFENDER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp ]),
        new SequenceNode([ condMustStayOnside, actHoverBlue ]),
        new SequenceNode([ condHasPuck, TREE_WITH_PUCK ]),

        // *** NEW CORRECT BEHAVIOR ***
        new SequenceNode([ condWeDoNotHavePuck, actFunnelDefence ]),

        new SequenceNode([ condTeamHasPuck, actWideSupport ]),
        actHoverBlue
    ]);

    // =======================================================
    // THINK
    // =======================================================
    function think(p) {
        const bb = makeBB(p);

        if (bb.role === "P") return TREE_ATTACKER.tick(bb);
        if (bb.role === "S") return TREE_SUPPORT.tick(bb);
        return TREE_DEFENDER.tick(bb);
    }





    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            STRATEGY_NAME,
            "Canadiens",
            "MTL",
            think,
            { main: "#af1e2d", secondary: "#192168" }
        );
    }

})();