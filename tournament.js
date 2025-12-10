// =========================================================
// TOURNAMENT ENGINE (Strict 82-Game Season)
// =========================================================

const Tournament = {
    active: false,
    matches: [],        
    results: [],        
    standings: {},      
    currentMatchIndex: 0,
    
    // --- CONFIGURATION ---
    watchMode: false,    
    speedMult: 100,     
    
    // 1. SETUP
    init: function() {
        this.active = true;
        this.matches = [];
        this.results = [];
        this.standings = {};
        this.currentMatchIndex = 0;

        const keys = Object.keys(Strategies);
        
        // Initialize Standings
        keys.forEach(k => {
            const code = Strategies[k].code || "UNK";
            this.standings[k] = { 
                id: k,
                name: Strategies[k].teamName || Strategies[k].name,
                code: code,
                GP:0, 
                W:0, L:0, OTL:0, 
                SOW:0, SOL:0,    
                GF:0, GA:0, Pts:0,
                totalSOGF: 0, 
                totalSOGA: 0  
            };
        });

        // --- BALANCED SCHEDULE GENERATION ---
        let teams = [...keys];
        if (teams.length % 2 !== 0) teams.push("BYE");
        
        const numTeams = teams.length;
        const gamesPerCycle = numTeams - 1; 
        const half = numTeams / 2;

        // Auto-Calculate Season Length
        const TARGET_GAMES = 82;
        
        // 1. Force OVER-generation (Round Up)
        // If we need 7.4 loops, this forces 8 loops so we have enough matches.
        let seasonLoops = Math.ceil(TARGET_GAMES / gamesPerCycle);
        if (seasonLoops < 1) seasonLoops = 1;

        console.log(`📅 SEASON SETUP: ${numTeams} Slots. One cycle = ${gamesPerCycle} games.`);
        console.log(`🔄 GENERATING: ${seasonLoops} cycles to ensure coverage.`);

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

        // 2. TRIM TO EXACT LENGTH
        // Total Matches = (Number of Real Teams * 82) / 2
        // Example: 12 Teams * 82 Games = 984 Team-Games / 2 = 492 Matches
        const realTeamCount = keys.length;
        const totalMatchesNeeded = Math.ceil((realTeamCount * TARGET_GAMES) / 2);

        if (this.matches.length > totalMatchesNeeded) {
            console.log(`✂️ TRIMMING: Generated ${this.matches.length}, cutting to ${totalMatchesNeeded}.`);
            this.matches = this.matches.slice(0, totalMatchesNeeded);
        }

        console.log(`🏆 SEASON READY: ${this.matches.length} Total Matches (${TARGET_GAMES}/team).`);
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

        console.log(`\n⚔️ MATCH ${this.currentMatchIndex + 1}: ${Team0_Strategy.code} vs ${Team1_Strategy.code}`);
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
            
            ctx.save();
            ctx.fillStyle = "red";
            ctx.font = "bold 14px Arial";
            ctx.fillText("LIVE WATCH", 20, 20);
            ctx.restore();
            
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(W-220, H-30, 220, 30);
            ctx.fillStyle = "#fff";
            ctx.font = "14px Arial";
            ctx.textAlign = "right";
            ctx.fillText(`GAME ${this.currentMatchIndex + 1} / ${this.matches.length}`, W - 10, H - 10);
            ctx.restore();
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

    // 5. RECORD STATS
    recordResult: function(isShootout) {
        const homeID = this.matches[this.currentMatchIndex].home;
        const awayID = this.matches[this.currentMatchIndex].away;
        
        const hStats = this.standings[homeID];
        const aStats = this.standings[awayID];

        hStats.GP++; 
        aStats.GP++; 
        
        hStats.GF += scoreTeam0; hStats.GA += scoreTeam1;
        aStats.GF += scoreTeam1; aStats.GA += scoreTeam0;

        // --- SHOT TRACKING ---
        const goalie0 = players.find(p => p.team === 0 && p.type === "goalie");
        const goalie1 = players.find(p => p.team === 1 && p.type === "goalie");
        const saves0 = goalie0 ? goalie0.saves : 0;
        const saves1 = goalie1 ? goalie1.saves : 0;

        const sog0 = scoreTeam0 + saves1;
        const sog1 = scoreTeam1 + saves0;

        hStats.totalSOGF += sog0;
        hStats.totalSOGA += sog1; 

        aStats.totalSOGF += sog1;
        aStats.totalSOGA += sog0;
        // ---------------------

        const isOT = (currentPeriod > 3 && !isShootout);

        // --- TEAM 0 WINS ---
        if (scoreTeam0 > scoreTeam1) {
            hStats.W++; 
            hStats.Pts += 2;

            if (isShootout) {
                hStats.SOW++;
                aStats.SOL++;
                aStats.Pts += 1; 
                aStats.OTL++; 
            } 
            else if (isOT) {
                aStats.OTL++;
                aStats.Pts += 1;
            } 
            else {
                aStats.L++;
            }
        } 
        // --- TEAM 1 WINS ---
        else {
            aStats.W++; 
            aStats.Pts += 2;

            if (isShootout) {
                aStats.SOW++;
                hStats.SOL++;
                hStats.Pts += 1;
                hStats.OTL++;
            } 
            else if (isOT) {
                hStats.OTL++;
                hStats.Pts += 1;
            } 
            else {
                hStats.L++;
            }
        }

        this.currentMatchIndex++;
        
        const delay = this.watchMode ? 2000 : 10;
        setTimeout(() => this.startNextMatch(), delay);
    },

    // 6. FINISH
    endTournament: function() {
        this.active = false;
        gameState = "tournament_over";
        console.log("🏆 SEASON COMPLETE");
        console.table(this.standings);
        if (typeof loop === "function") requestAnimationFrame(loop);
    }
};