// =========================================================
// TOURNAMENT ENGINE (Season + AI Coach Gauntlet)
// =========================================================

const Tournament = {
    active: false,
    matches: [],        
    results: [],        
    standings: {},      
    matchupStats: {},   // Tracks Trainee vs Specific Opponents
    currentMatchIndex: 0,
    isTrainingEpisode: false, 
    
    // --- CONFIGURATION ---
    watchMode: false,    
    speedMult: 100,     
    
    // 1. STANDARD SEASON SETUP (Menu -> Tournament)
    init: function() {
        this.active = true;
        this.isTrainingEpisode = false;
        this.matches = [];
        this.results = [];
        this.standings = {};
        this.matchupStats = {};
        this.currentMatchIndex = 0;

        const keys = Object.keys(Strategies);
        
        // Initialize Standings
        keys.forEach(k => {
            const code = Strategies[k].code || "UNK";
            this.standings[k] = { 
                id: k,
                name: Strategies[k].teamName || Strategies[k].name,
                code: code,
                GP:0, W:0, L:0, OTL:0, SOW:0, SOL:0, GF:0, GA:0, Pts:0,
                totalSOGF: 0, totalSOGA: 0  
            };
        });

        // --- BALANCED SEASON GENERATOR ---
        let teams = [...keys];
        if (teams.length % 2 !== 0) teams.push("BYE");
        
        const numTeams = teams.length;
        const gamesPerCycle = numTeams - 1; 
        const half = numTeams / 2;

        const TARGET_GAMES = 82;
        let seasonLoops = Math.ceil(TARGET_GAMES / gamesPerCycle);
        if (seasonLoops < 1) seasonLoops = 1;

        console.log(`📅 SEASON SETUP: ${numTeams} Slots. One cycle = ${gamesPerCycle} games.`);

        for (let season = 0; season < seasonLoops; season++) {
            let currentTeams = [...teams]; 
            
            for (let r = 0; r < gamesPerCycle; r++) {
                let roundMatches = [];
                for (let i = 0; i < half; i++) {
                    const t1 = currentTeams[i];
                    const t2 = currentTeams[numTeams - 1 - i];
                    if (t1 === "BYE" || t2 === "BYE") continue;
                    
                    if (season % 2 === 0) roundMatches.push({ home: t1, away: t2 });
                    else                  roundMatches.push({ home: t2, away: t1 });
                }
                
                // Shuffle logic for season randomness
                roundMatches.sort(() => Math.random() - 0.5);
                this.matches.push(...roundMatches);
                
                // Rotate array for next round
                const fixed = currentTeams[0];
                const tail = currentTeams.slice(1);
                tail.unshift(tail.pop()); 
                currentTeams = [fixed, ...tail];
            }
        }

        // TRIM TO EXACT LENGTH
        const realTeamCount = keys.length;
        const totalMatchesNeeded = Math.ceil((realTeamCount * TARGET_GAMES) / 2);

        if (this.matches.length > totalMatchesNeeded) {
            this.matches = this.matches.slice(0, totalMatchesNeeded);
        }

        console.log(`🏆 SEASON READY: ${this.matches.length} Total Matches.`);
        this.startNextMatch();
    },

    // --- NEW: GAUNTLET SCHEDULER (Trainee vs World) ---
    startTrainingGauntlet: function(traineeId, opponentIds, rounds) {
        this.active = true;
        this.isTrainingEpisode = true;
        this.matches = [];
        this.standings = {};
        this.matchupStats = {}; 
        this.currentMatchIndex = 0;

        // 1. Init Main Standings (Global Totals)
        const allTeams = [traineeId, ...opponentIds];
        allTeams.forEach(k => {
            const strat = Strategies[k];
            this.standings[k] = { 
                id: k, name: strat.teamName, code: strat.code,
                GP:0, W:0, L:0, OTL:0, SOW:0, SOL:0, GF:0, GA:0, Pts:0,
                totalSOGF: 0, totalSOGA: 0
            };
        });

        // 2. Init Matchup Stats (For the Display)
        opponentIds.forEach(oppId => {
            const strat = Strategies[oppId];
            this.matchupStats[oppId] = {
                id: oppId,
                name: strat.teamName,
                code: strat.code,
                GP:0, W:0, L:0, OTL:0, GF:0, GA:0, Pts:0,
                SOGF: 0, SOGA: 0 // <--- Tracks shots for specific matchups
            };
        });

        // 3. GENERATE SCHEDULE (Gauntlet Style)
        // Trainee plays Opp1, then Opp2, then Opp3... repeat for N rounds.
        for (let r = 0; r < rounds; r++) {
            for (const oppId of opponentIds) {
                // Alternate Home/Away for fairness
                if (r % 2 === 0) this.matches.push({ home: traineeId, away: oppId });
                else             this.matches.push({ home: oppId, away: traineeId });
            }
        }

        console.log(`🏟️ GAUNTLET STARTED: ${this.matches.length} Matches (Direct Training).`);
        this.startNextMatch();
    },

    toggleWatchMode: function() {
        this.watchMode = !this.watchMode;
        console.log(this.watchMode ? "👀 WATCH MODE: ON" : "⏩ FAST SIM: ON");
        if (!this.watchMode) faceoffPauseUntil = 0;
    },

    // 2. START MATCH
    startNextMatch: function() {
        if (this.currentMatchIndex >= this.matches.length) {
            this.endTournament();
            return;
        }

        const match = this.matches[this.currentMatchIndex];
        gameState = "tournament"; 

        Team0_Strategy = Strategies[match.home];
        Team1_Strategy = Strategies[match.away];
        
        if (Team0_Strategy.colors) {
            TEAM0_COLOR = Team0_Strategy.colors.main;
            TEAM0_COLOR_HAS_PUCK = Team0_Strategy.colors.secondary;
        }
        if (Team1_Strategy.colors) {
            TEAM1_COLOR = Team1_Strategy.colors.main;
            TEAM1_COLOR_HAS_PUCK = Team1_Strategy.colors.secondary;
        }

        // Only log to console in full season mode
        if (!this.isTrainingEpisode) {
            console.log(`\n⚔️ MATCH ${this.currentMatchIndex + 1}: ${Team0_Strategy.code} vs ${Team1_Strategy.code}`);
        }
        
        fullGameReset(); 
        this.simLoop();
    },

    // 3. THE LOOP
    simLoop: function() {
        if (!this.active || gameState !== "tournament") return;

        const loops = this.watchMode ? 1 : this.speedMult;

        for (let i = 0; i < loops; i++) {
            if (isResetActive() || performance.now() < faceoffPauseUntil) {
                if (this.watchMode) {
                    const now = performance.now();
                    if (whistleEndTimer && now >= whistleEndTimer) { whistleEndTimer = null; doFaceoffReset(); }
                    if (goalResetTimer && now >= goalResetTimer) { 
                        if (isSuddenDeathGoal) {
                             if (lastGoalTeam === 0) scoreTeam0++;
                             if (lastGoalTeam === 1) scoreTeam1++;
                             this.recordResult(false); 
                             return;
                        } else { doGoalReset(); }
                    }
                    if (goalResetTimer) {
                        puck.update();
                        collideCircleWithRink(puck, puck.r, 0.8);
                        for (const p of players) { updatePlayer(p); enforcePlayerWalls(p); }
                        resolvePlayerCollisions();
                    }
                } 
                else {
                    // FAST SIM SKIP
                    if (whistleEndTimer) { whistleEndTimer = null; doFaceoffReset(); }
                    if (goalResetTimer) { 
                        if (isSuddenDeathGoal) { /* handled below */ }
                        else { doGoalReset(); }
                    }
                    if (performance.now() < faceoffPauseUntil) faceoffPauseUntil = 0;
                }
            } 
            else {
                puck.update();
                checkOffsides();
                checkDeadPuck();
                resolveGoalCollisions(puck);
                checkGoalieHarassment();
                checkNetPinning();
                if (puckEscapedRink()) handlePuckEscape();
                if (puckStealCooldown > 0) puckStealCooldown--;
                
                checkGoal(); 

                for (const p of players) {
                    updatePlayer(p);
                    resolveGoalCollisions(p);
                    blockPlayerFromGoal(p);
                    enforcePlayerWalls(p);
                }
                resolvePlayerCollisions();
            }

            if (!isResetActive()) {
                timeRemaining -= (1/60); 
                if (timeRemaining <= 0) {
                    if (currentPeriod < TOTAL_PERIODS) {
                        currentPeriod++;
                        timeRemaining = GAME_DURATION_SECONDS;
                        startNextPeriod(); 
                        if (!this.watchMode) faceoffPauseUntil = 0; 
                    } else {
                        if (scoreTeam0 === scoreTeam1) {
                            if (currentPeriod >= 4) {
                                this.resolveShootout();
                                return;
                            }
                            currentPeriod++;
                            timeRemaining = GAME_DURATION_SECONDS;
                            startNextPeriod();
                            if (!this.watchMode) faceoffPauseUntil = 0;
                        } else {
                            this.recordResult(false); 
                            return; 
                        }
                    }
                }
            }
            
            if (isSuddenDeathGoal) {
                if (lastGoalTeam === 0) scoreTeam0++;
                if (lastGoalTeam === 1) scoreTeam1++;
                this.recordResult(false); 
                return;
            }
        }

        if (this.watchMode) {
            renderFrame(); 
            if (typeof drawBroadcastScoreboard === 'function') drawBroadcastScoreboard();
            
            if (this.isTrainingEpisode) {
                ctx.save();
                ctx.fillStyle = "rgba(0,0,0,0.5)";
                ctx.fillRect(W-220, H-30, 220, 30);
                const progress = (this.currentMatchIndex + 1) / this.matches.length;
                ctx.fillStyle = "#004400";
                ctx.fillRect(W-220, H-30, 220 * progress, 30);
                ctx.fillStyle = "#fff";
                ctx.font = "14px Arial";
                ctx.textAlign = "right";
                ctx.fillText(`GAME ${this.currentMatchIndex + 1} / ${this.matches.length}`, W - 10, H - 10);
                ctx.restore();
            } 
            else {
                ctx.save();
                ctx.fillStyle = "red";
                ctx.font = "bold 14px Arial";
                ctx.fillText("LIVE WATCH", 20, 20);
                ctx.restore();
            }
        } 
        else {
            if (typeof renderTournamentStatus === 'function') renderTournamentStatus();
        }

        requestAnimationFrame(() => this.simLoop());
    },

    // 4. RESOLVE SHOOTOUT
    resolveShootout: function() {
        if (Math.random() > 0.5) {
            scoreTeam0++; 
            this.recordResult(true);
        } else {
            scoreTeam1++; 
            this.recordResult(true);
        }
    },

    // 5. RECORD RESULT (Includes Gauntlet Matchup Logic)
    recordResult: function(isShootout) {
        const m = this.matches[this.currentMatchIndex];
        const hStats = this.standings[m.home];
        const aStats = this.standings[m.away];

        // Global Stats
        hStats.GP++; aStats.GP++;
        hStats.GF += scoreTeam0; hStats.GA += scoreTeam1;
        aStats.GF += scoreTeam1; aStats.GA += scoreTeam0;

        // Shot tracking
        const goalie0 = players.find(p => p.team === 0 && p.type === "goalie");
        const goalie1 = players.find(p => p.team === 1 && p.type === "goalie");
        const saves0 = goalie0 ? goalie0.saves : 0;
        const saves1 = goalie1 ? goalie1.saves : 0;
        const sog0 = scoreTeam0 + saves1;
        const sog1 = scoreTeam1 + saves0;

        hStats.totalSOGF += sog0; hStats.totalSOGA += sog1; 
        aStats.totalSOGF += sog1; aStats.totalSOGA += sog0;

        // --- NEW: MATCHUP TRACKING FOR GAUNTLET ---
        if (this.isTrainingEpisode) {
            let oppId = null;
            let traineeWon = false;
            let traineeScore = 0, oppScore = 0;
            let traineeSOG = 0, oppSOG = 0; // <--- SOG VARIABLES DEFINED HERE
            let isTraineeHome = false;

            if (m.home === "TRAINEE") { 
                oppId = m.away; isTraineeHome = true;
                traineeScore = scoreTeam0; oppScore = scoreTeam1;
                traineeSOG = sog0; oppSOG = sog1;
            } 
            else if (m.away === "TRAINEE") { 
                oppId = m.home; isTraineeHome = false;
                traineeScore = scoreTeam1; oppScore = scoreTeam0;
                traineeSOG = sog1; oppSOG = sog0;
            }

            const isOT = (currentPeriod > 3 && !isShootout);
            const traineeWin = (isTraineeHome && scoreTeam0 > scoreTeam1) || (!isTraineeHome && scoreTeam1 > scoreTeam0);

            if (oppId && this.matchupStats[oppId]) {
                const ms = this.matchupStats[oppId];
                ms.GP++;
                ms.GF += traineeScore;
                ms.GA += oppScore;
                ms.SOGF += traineeSOG;
                ms.SOGA += oppSOG;

                if (traineeWin) {
                    ms.W++; ms.Pts += 2;
                } else {
                    if (isOT || isShootout) { ms.OTL++; ms.Pts += 1; ms.L++; }
                    else { ms.L++; }
                }
            }
        }
        // ------------------------------------------

        const isOTGlobal = (currentPeriod > 3 && !isShootout);

        if (scoreTeam0 > scoreTeam1) {
            hStats.W++; hStats.Pts += 2;
            if (isShootout) { hStats.SOW++; aStats.SOL++; aStats.Pts += 1; aStats.OTL++; } 
            else if (isOTGlobal) { aStats.OTL++; aStats.Pts += 1; } 
            else { aStats.L++; }
        } else {
            aStats.W++; aStats.Pts += 2;
            if (isShootout) { aStats.SOW++; hStats.SOL++; hStats.Pts += 1; hStats.OTL++; } 
            else if (isOTGlobal) { hStats.OTL++; hStats.Pts += 1; } 
            else { hStats.L++; }
        }

        this.currentMatchIndex++;
        
        const delay = (this.watchMode || !this.isTrainingEpisode) ? 2000 : 10;
        setTimeout(() => this.startNextMatch(), delay);
    },

    // 6. FINISH
    endTournament: function() {
        this.active = false;
        
        if (this.isTrainingEpisode) {
            AICoach.reportTournamentResult(this.standings);
        } else {
            gameState = "tournament_over";
            console.log("🏆 TOURNAMENT COMPLETE");
            console.table(this.standings);
        }
    }
};