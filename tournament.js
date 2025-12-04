// =========================================================
// TOURNAMENT ENGINE (Multi-Round Support)
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
    
    // HOW MANY TIMES DO THEY PLAY?
    // 1 = Single Round Robin (A vs B)
    // 2 = Home & Away (A vs B, then B vs A)
    // 10 = Season Mode
    rounds: 10, 
    
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
                GP:0, W:0, L:0, GF:0, GA:0, Pts:0 
            };
        });

        // --- BALANCED SCHEDULE GENERATION (Circle Method) ---
        // This creates "Match Weeks" so teams play evenly.
        
        let teams = [...keys];
        // If odd number of teams, add a dummy "BYE"
        if (teams.length % 2 !== 0) {
            teams.push("BYE");
        }
        
        const numTeams = teams.length;
        const numRounds = numTeams - 1; // Rounds needed to complete one full Rotation
        const half = numTeams / 2;

        // Loop for the number of full tournament cycles
        for (let season = 0; season < this.rounds; season++) {
            
            // Create a copy of teams for rotation this season
            let currentTeams = [...teams]; 

            // Generate the specific match-ups for this rotation
            for (let r = 0; r < numRounds; r++) {
                let roundMatches = [];
                
                for (let i = 0; i < half; i++) {
                    const t1 = currentTeams[i];
                    const t2 = currentTeams[numTeams - 1 - i];

                    // Skip matches involving the dummy "BYE" team
                    if (t1 === "BYE" || t2 === "BYE") continue;

                    // Alternate Home/Away based on season parity
                    if (season % 2 === 0) {
                        roundMatches.push({ home: t1, away: t2 });
                    } else {
                        roundMatches.push({ home: t2, away: t1 });
                    }
                }
                
                // Shuffle the order of games *within* this specific round/week
                roundMatches.sort(() => Math.random() - 0.5);
                
                // Add this block of balanced matches to the master schedule
                this.matches.push(...roundMatches);

                // ROTATE TEAMS: Keep index 0 fixed, rotate the rest clockwise
                // [0, 1, 2, 3] -> [0, 3, 1, 2]
                const fixed = currentTeams[0];
                const tail = currentTeams.slice(1);
                tail.unshift(tail.pop()); 
                currentTeams = [fixed, ...tail];
            }
        }

        console.log(`🏆 TOURNAMENT INITIALIZED: ${this.matches.length} Matches (${this.rounds} Cycles).`);
        this.startNextMatch();
    },

    // --- NEW TOGGLE FUNCTION ---
    toggleWatchMode: function() {
        this.watchMode = !this.watchMode;
        console.log(this.watchMode ? "👀 WATCH MODE: ON" : "⏩ FAST SIM: ON");
        
        // If switching TO fast mode, kill the pause immediately to speed up
        if (!this.watchMode) {
            faceoffPauseUntil = 0;
        }
    },

    // 2. START MATCH
    startNextMatch: function() {
        if (this.currentMatchIndex >= this.matches.length) {
            this.endTournament();
            return;
        }

        const match = this.matches[this.currentMatchIndex];
        
        // 1. LOCK STATE
        gameState = "tournament"; 

        // 2. Setup Match Strategy
        Team0_Strategy = Strategies[match.home];
        Team1_Strategy = Strategies[match.away];
        
        // 3. Set Colors
        if (Team0_Strategy.colors) {
            TEAM0_COLOR = Team0_Strategy.colors.main;
            TEAM0_COLOR_HAS_PUCK = Team0_Strategy.colors.secondary;
        }
        if (Team1_Strategy.colors) {
            TEAM1_COLOR = Team1_Strategy.colors.main;
            TEAM1_COLOR_HAS_PUCK = Team1_Strategy.colors.secondary;
        }

        console.log(`\n⚔️ MATCH ${this.currentMatchIndex + 1}: ${Team0_Strategy.code} vs ${Team1_Strategy.code}`);

        // 4. Reset Physics
        fullGameReset(); 
        
        this.simLoop();
    },

    // 3. THE LOOP
    simLoop: function() {
        if (!this.active || gameState !== "tournament") return;

        // If Watch Mode is ON, loop once per frame. 
        // If OFF, loop 100 times (speedMult) per frame.
        const loops = this.watchMode ? 1 : this.speedMult;

        for (let i = 0; i < loops; i++) {
            
            // --- PHYSICS & LOGIC ---
            if (isResetActive() || performance.now() < faceoffPauseUntil) {
                if (this.watchMode) {
                    const now = performance.now();
                    if (whistleEndTimer && now >= whistleEndTimer) { 
                        whistleEndTimer = null; doFaceoffReset(); 
                    }
                    if (goalResetTimer && now >= goalResetTimer) { 
                        if (isSuddenDeathGoal) {
                             if (lastGoalTeam === 0) scoreTeam0++;
                             if (lastGoalTeam === 1) scoreTeam1++;
                             this.recordResult(); return;
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
                    // FAST MODE: Skip waits immediately
                    if (whistleEndTimer) { whistleEndTimer = null; doFaceoffReset(); }
                    if (goalResetTimer) { 
                        if (isSuddenDeathGoal) { /* logic handled below */ }
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

            // --- CLOCK ---
            if (!isResetActive()) {
                timeRemaining -= (1/60); 
                
                if (timeRemaining <= 0) {
                    if (currentPeriod < TOTAL_PERIODS) {
                        currentPeriod++;
                        timeRemaining = GAME_DURATION_SECONDS;
                        startNextPeriod(); 
                        if (!this.watchMode) faceoffPauseUntil = 0; 
                    } else {
                        // OT Check
                        if (scoreTeam0 === scoreTeam1) {
                            
                            // *** SHOOTOUT RULE (Prevent Infinite Loops) ***
                            if (currentPeriod >= 6) {
                                this.resolveShootout();
                                return;
                            }

                            currentPeriod++;
                            timeRemaining = GAME_DURATION_SECONDS;
                            startNextPeriod();
                            if (!this.watchMode) faceoffPauseUntil = 0;
                        } else {
                            this.recordResult();
                            return; 
                        }
                    }
                }
            }
            
            if (isSuddenDeathGoal) {
                if (lastGoalTeam === 0) scoreTeam0++;
                if (lastGoalTeam === 1) scoreTeam1++;
                this.recordResult();
                return;
            }
        }

        // --- RENDER ---
        if (this.watchMode) {
            renderFrame(); 
            if (typeof drawBroadcastScoreboard === 'function') drawBroadcastScoreboard();
            
            // Draw small "Live" indicator
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
            ctx.fillText(`TOURNAMENT GAME ${this.currentMatchIndex + 1} / ${this.matches.length}`, W - 10, H - 10);
            ctx.restore();
        } 
        else {
            if (typeof renderTournamentStatus === 'function') {
                renderTournamentStatus();
            }
        }

        requestAnimationFrame(() => this.simLoop());
    },

    // 4. RESOLVE SHOOTOUT
    resolveShootout: function() {
        if (Math.random() > 0.5) {
            scoreTeam0++;
            console.log("   (Shootout Win: Team 0)");
        } else {
            scoreTeam1++;
            console.log("   (Shootout Win: Team 1)");
        }
        this.recordResult();
    },

    // 5. RECORD STATS
    recordResult: function() {
        const homeID = this.matches[this.currentMatchIndex].home;
        const awayID = this.matches[this.currentMatchIndex].away;
        
        const hStats = this.standings[homeID];
        const aStats = this.standings[awayID];

        hStats.GP++; hStats.GF += scoreTeam0; hStats.GA += scoreTeam1;
        aStats.GP++; aStats.GF += scoreTeam1; aStats.GA += scoreTeam0;

        if (scoreTeam0 > scoreTeam1) {
            hStats.W++; hStats.Pts += 2;
            aStats.L++; 
        } else {
            aStats.W++; aStats.Pts += 2;
            hStats.L++; 
        }

        this.currentMatchIndex++;
        
        const delay = this.watchMode ? 2000 : 10;
        setTimeout(() => this.startNextMatch(), delay);
    },

    // 6. FINISH
    endTournament: function() {
        this.active = false;
        gameState = "tournament_over";
        console.log("🏆 TOURNAMENT COMPLETE");
        console.table(this.standings);
        
        if (typeof loop === "function") {
            requestAnimationFrame(loop);
        }
    }
};