// =========================================================
// TOURNAMENT ENGINE (Batched Warp Speed - Clean UI Update)
// =========================================================

const Tournament = {
    active: false,
    matches: [],        
    results: [],        
    standings: {},      
    matchupStats: {},   
    currentMatchIndex: 0,
    isTrainingEpisode: false,
    isWarping: false, 
    
    // --- CONFIGURATION ---
    watchMode: false,    
    speedMult: 100,     
    
    // 1. INIT STANDARD SEASON
    init: function() {
        this.active = true;
        this.isTrainingEpisode = false;
        this.isWarping = false;
        this.matches = [];
        this.results = [];
        this.standings = {};
        this.matchupStats = {};
        this.currentMatchIndex = 0;

        const keys = Object.keys(Strategies);
        
        // Init Standings
        keys.forEach(k => {
            const code = Strategies[k].code || "UNK";
            this.standings[k] = { 
                id: k, name: Strategies[k].teamName || Strategies[k].name, code: code,
                GP:0, W:0, L:0, OTL:0, SOW:0, SOL:0, GF:0, GA:0, Pts:0,
                totalSOGF: 0, totalSOGA: 0  
            };
        });

        // Generate Season Schedule
        let teams = [...keys];
        if (teams.length % 2 !== 0) teams.push("BYE");
        const numTeams = teams.length;
        const gamesPerCycle = numTeams - 1; 
        const half = numTeams / 2;
        const TARGET_GAMES = 12;
        let seasonLoops = Math.ceil(TARGET_GAMES / gamesPerCycle);
        if (seasonLoops < 1) seasonLoops = 1;

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
                roundMatches.sort(() => Math.random() - 0.5);
                this.matches.push(...roundMatches);
                const fixed = currentTeams[0];
                const tail = currentTeams.slice(1);
                tail.unshift(tail.pop()); 
                currentTeams = [fixed, ...tail];
            }
        }

        const realTeamCount = keys.length;
        const totalMatchesNeeded = Math.ceil((realTeamCount * TARGET_GAMES) / 2);
        if (this.matches.length > totalMatchesNeeded) {
            this.matches = this.matches.slice(0, totalMatchesNeeded);
        }

        console.log(`🏆 SEASON READY: ${this.matches.length} matches.`);
        this.startNextMatch(); 
    },

    // --- GAUNTLET SCHEDULER (Training - Warp Mode) ---
    startTrainingGauntlet: function(traineeId, opponentIds, rounds) {
        this.active = true;
        this.isTrainingEpisode = true;
        this.isWarping = true; 
        this.matches = [];
        this.standings = {};
        this.matchupStats = {}; 
        this.currentMatchIndex = 0;

        // Init Main Standings
        const allTeams = [traineeId, ...opponentIds];
        allTeams.forEach(k => {
            const strat = Strategies[k];
            this.standings[k] = { 
                id: k, name: strat.teamName, code: strat.code,
                GP:0, W:0, L:0, OTL:0, SOW:0, SOL:0, GF:0, GA:0, Pts:0,
                totalSOGF: 0, totalSOGA: 0
            };
        });

        // Init Matchup Stats
        opponentIds.forEach(oppId => {
            const strat = Strategies[oppId];
            this.matchupStats[oppId] = {
                id: oppId, name: strat.teamName, code: strat.code,
                GP:0, W:0, L:0, OTL:0, GF:0, GA:0, Pts:0,
                SOGF: 0, SOGA: 0
            };
        });

        // Generate Schedule
        for (let r = 0; r < rounds; r++) {
            for (const oppId of opponentIds) {
                if (r % 2 === 0) this.matches.push({ home: traineeId, away: oppId });
                else             this.matches.push({ home: oppId, away: traineeId });
            }
        }

        console.log(`🚀 WARP SPEED ACTIVATED: ${this.matches.length} Matches queued.`);
        this.playBatchInstant(); 
    },

    toggleWatchMode: function() {
        this.watchMode = !this.watchMode;
        console.log(this.watchMode ? "👀 WATCH MODE: ON" : "⏩ FAST SIM: ON");
        if (!this.watchMode) faceoffPauseUntil = 0;
    },

    // 2. VISUAL MATCH STARTER
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

        if (!this.isTrainingEpisode) {
            console.log(`\n⚔️ MATCH ${this.currentMatchIndex + 1}: ${Team0_Strategy.code} vs ${Team1_Strategy.code}`);
        }
        fullGameReset(); 
        this.simLoop();
    },

    // 3. VISUAL LOOP
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
                    if (whistleEndTimer) { whistleEndTimer = null; doFaceoffReset(); }
                    if (goalResetTimer) { 
                        if (isSuddenDeathGoal) { }
                        else { doGoalReset(); }
                    }
                    if (performance.now() < faceoffPauseUntil) faceoffPauseUntil = 0;
                }
            } 
            else {
                // VISUAL PHYSICS STEP
                puck.update();
                checkOffsides();
                checkDeadPuck();
                
                checkGoal(); 
                resolveGoalCollisions(puck);
                
                checkGoalieHarassment();
                checkNetPinning();
                if (puckEscapedRink()) handlePuckEscape();
                if (puckStealCooldown > 0) puckStealCooldown--;
                
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
        } else {
            if (typeof renderTournamentStatus === 'function') renderTournamentStatus();
        }
        requestAnimationFrame(() => this.simLoop());
    },

    // =========================================================
    // 4. BATCHED WARP ENGINE (UI OPTIMIZED)
    // =========================================================
    playBatchInstant: function() {
        if (this.currentMatchIndex >= this.matches.length) {
            this.endTournament();
            return;
        }

        // We still batch to prevent browser freezing, but we removed the draw call.
        const BATCH_SIZE = 12; 
        let gamesPlayedInBatch = 0;

        while (gamesPlayedInBatch < BATCH_SIZE && this.currentMatchIndex < this.matches.length) {
            
            const match = this.matches[this.currentMatchIndex];
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

            fullGameReset();
            
            let gameActive = true;
            
            while (gameActive) {
                puck.update();
                checkOffsides();
                checkDeadPuck();
                
                checkGoal(); 
                
                if (isSuddenDeathGoal) {
                    if (lastGoalTeam === 0) scoreTeam0++;
                    if (lastGoalTeam === 1) scoreTeam1++;
                    this.recordResult(false);
                    gameActive = false;
                    break; 
                }

                if (typeof resolveGoalCollisions === 'function') resolveGoalCollisions(puck);
                
                checkGoalieHarassment();
                checkNetPinning();
                if (puckEscapedRink()) handlePuckEscape();
                if (puckStealCooldown > 0) puckStealCooldown--;

                for (const p of players) {
                    updatePlayer(p);
                    resolveGoalCollisions(p);
                    blockPlayerFromGoal(p);
                    enforcePlayerWalls(p);
                }
                resolvePlayerCollisions();

                // TIME
                if (goalResetTimer || whistleEndTimer) {
                    if (lastGoalTeam !== null) {
                        if (lastGoalTeam === 0) scoreTeam0++;
                        if (lastGoalTeam === 1) scoreTeam1++;
                        lastGoalTeam = null; 
                    }
                    doFaceoffReset();
                    goalResetTimer = null; 
                    whistleEndTimer = null;
                }
                else {
                    timeRemaining -= (1/60);
                    if (timeRemaining <= 0) {
                        if (currentPeriod < TOTAL_PERIODS) {
                            currentPeriod++;
                            timeRemaining = GAME_DURATION_SECONDS;
                            doFaceoffReset();
                        } 
                        else {
                            if (scoreTeam0 === scoreTeam1 && currentPeriod >= 4) {
                                this.resolveShootout(); 
                                gameActive = false;
                                break; 
                            } else if (scoreTeam0 !== scoreTeam1) {
                                this.recordResult(false);
                                gameActive = false;
                                break; 
                            } else {
                                currentPeriod++;
                                timeRemaining = GAME_DURATION_SECONDS;
                                doFaceoffReset();
                            }
                        }
                    }
                }
            } // End Game

            gamesPlayedInBatch++;
        } // End Batch

        // *** CHANGE: REMOVED renderTournamentStatus() from here ***
        // We only yield to the browser loop to prevent freezing.
        // The visual update will happen exclusively in endTournament()

        if (this.currentMatchIndex < this.matches.length) {
            setTimeout(() => this.playBatchInstant(), 0);
        } else {
            this.endTournament();
        }
    },

    // 5. SHOOTOUT
    resolveShootout: function() {
        if (Math.random() > 0.5) {
            scoreTeam0++; 
            this.recordResult(true);
        } else {
            scoreTeam1++; 
            this.recordResult(true);
        }
    },

    // 6. RECORD RESULT
    recordResult: function(isShootout) {
        if (this.currentMatchIndex >= this.matches.length) return;

        const m = this.matches[this.currentMatchIndex];
        const hStats = this.standings[m.home];
        const aStats = this.standings[m.away];

        hStats.GP++; aStats.GP++;
        hStats.GF += scoreTeam0; hStats.GA += scoreTeam1;
        aStats.GF += scoreTeam1; aStats.GA += scoreTeam0;

        const goalie0 = players.find(p => p.team === 0 && p.type === "goalie");
        const goalie1 = players.find(p => p.team === 1 && p.type === "goalie");
        const saves0 = goalie0 ? goalie0.saves : 0;
        const saves1 = goalie1 ? goalie1.saves : 0;
        const sog0 = scoreTeam0 + saves1;
        const sog1 = scoreTeam1 + saves0;

        hStats.totalSOGF += sog0; hStats.totalSOGA += sog1; 
        aStats.totalSOGF += sog1; aStats.totalSOGA += sog0;

        if (this.isTrainingEpisode) {
            let oppId = null;
            let traineeWon = false;
            let traineeScore = 0, oppScore = 0;
            let traineeSOG = 0, oppSOG = 0;
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

        if (gameState === "tournament" && !this.isWarping) {
            const delay = (this.watchMode || !this.isTrainingEpisode) ? 111 : 10;
            setTimeout(() => this.startNextMatch(), delay);
        }
    },

    // 7. FINISH
    endTournament: function() {
        this.active = false;
        
        if (this.isTrainingEpisode) {
            // *** CHANGE: RENDER HERE (Once per Episode) ***
            if (typeof renderTournamentStatus === 'function') {
                renderTournamentStatus();

            }
            // **********************************************
            
            AICoach.reportTournamentResult(this.standings);
            requestAnimationFrame(loop);
            
        } else {
            gameState = "tournament_over";
            console.log("🏆 TOURNAMENT COMPLETE");
            console.table(this.standings);
            requestAnimationFrame(loop);
        }
    }
};