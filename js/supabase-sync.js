var SUPABASE_URL = "https://yyxisjdkfdpcxjjthqsw.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_XhnrBPEJDFSgX0fB4AYnhg_nwrOYlf9";
var sbClient = null;
var currentUser = null;
var isSyncing = false;

try {
    if (SUPABASE_URL !== "YOUR_SUPABASE_URL" && window.supabase) {
        sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch(err) {
    console.error("Supabase init error:", err);
}

function dbSave(key, value) {
    if (!sbClient || !currentUser) return;
    sbClient.from('user_data').upsert({
        user_id: currentUser.id,
        key: key,
        value: value,
        updated_at: new Date().toISOString()
    }).then(function(res) {
        if (res.error) console.error("Sync error:", res.error);
    });
}

var realtimeChannel = null;

function mergeTemplate(local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    var result = {
        habits: Array.from(new Set((local.habits || []).concat(remote.habits || []))),
        rd: Array.from(new Set((local.rd || []).concat(remote.rd || []))),
        wt: Math.max(local.wt || 8, remote.wt || 8)
    };
    var exMap = {};
    (local.ex || []).forEach(function(item) { exMap[item.n] = item; });
    (remote.ex || []).forEach(function(item) {
        if (exMap[item.n]) { exMap[item.n].s = exMap[item.n].s || item.s; }
        else { exMap[item.n] = item; }
    });
    result.ex = Object.values(exMap);
    var hlMap = {};
    (local.hl || []).forEach(function(item) { hlMap[item.n] = item; });
    (remote.hl || []).forEach(function(item) {
        if (hlMap[item.n]) { hlMap[item.n].s = hlMap[item.n].s || item.s; }
        else { hlMap[item.n] = item; }
    });
    result.hl = Object.values(hlMap);
    return result;
}

function mergeData(local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    var result = JSON.parse(JSON.stringify(local));
    if (remote.habits) {
        if (!result.habits) result.habits = {};
        Object.keys(remote.habits).forEach(function(k) {
            result.habits[k] = !!(result.habits[k] || remote.habits[k]);
        });
    }
    if (remote.prayers) {
        if (!result.prayers) result.prayers = {};
        Object.keys(remote.prayers).forEach(function(k) {
            result.prayers[k] = !!(result.prayers[k] || remote.prayers[k]);
        });
    }
    if (remote.extra) {
        if (!result.extra) result.extra = {};
        Object.keys(remote.extra).forEach(function(k) {
            result.extra[k] = !!(result.extra[k] || remote.extra[k]);
        });
    }
    if (remote.health) {
        if (!result.health) result.health = {};
        Object.keys(remote.health).forEach(function(k) {
            result.health[k] = !!(result.health[k] || remote.health[k]);
        });
    }
    if (remote.water) {
        if (!result.water) result.water = [];
        var maxLen = Math.max(result.water.length, remote.water.length);
        var mergedWater = [];
        for (var i = 0; i < maxLen; i++) {
            mergedWater.push(!!(result.water[i] || remote.water[i]));
        }
        result.water = mergedWater;
    }
    if (remote.reading) {
        if (!result.reading) result.reading = [];
        remote.reading.forEach(function(remoteBook) {
            var localBook = result.reading.find(function(b) { return b.n === remoteBook.n; });
            if (localBook) {
                localBook.t = Math.max(localBook.t || 0, remoteBook.t || 0);
            } else {
                result.reading.push(remoteBook);
            }
        });
    }
    if (remote.weight && !result.weight) {
        result.weight = remote.weight;
    }
    if (remote.goalRef) {
        if (!result.goalRef) result.goalRef = [];
        remote.goalRef.forEach(function(remoteGoal) {
            var localGoal = result.goalRef.find(function(g) { return g.name === remoteGoal.name; });
            if (localGoal) {
                if (!localGoal.text && remoteGoal.text) localGoal.text = remoteGoal.text;
            } else {
                result.goalRef.push(remoteGoal);
            }
        });
    }
    return result;
}

function subscribeRealtime() {
    if (!sbClient || !currentUser) return;
    if (realtimeChannel) {
        sbClient.removeChannel(realtimeChannel);
    }
    realtimeChannel = sbClient.channel('public:user_data')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'user_data',
            filter: 'user_id=eq.' + currentUser.id
        }, function(payload) {
            if (payload.new && payload.new.key) {
                var key = payload.new.key;
                var remoteVal = payload.new.value;
                var localVal = null;
                try { localVal = JSON.parse(localStorage.getItem(key)); } catch(e) {}
                
                var mergedVal = key === "ht_d" ? mergeTemplate(localVal, remoteVal) : mergeData(localVal, remoteVal);
                localStorage.setItem(key, JSON.stringify(mergedVal));
                
                if (typeof dk === "function" && typeof cDate !== "undefined" && key === "ht_" + dk(cDate)) {
                    cData = mergedVal;
                }
                if (typeof render === "function") render();
            }
        })
        .subscribe();
}

function syncDown() {
    if (!sbClient || !currentUser) return Promise.resolve();
    isSyncing = true;
    if (typeof render === "function") render();
    return sbClient.from('user_data').select('key, value').then(function(res) {
        isSyncing = false;
        if (res.error) {
            console.error("Sync down error:", res.error);
            if (typeof render === "function") render();
            return;
        }
        if (res.data && res.data.length > 0) {
            var promises = res.data.map(function(row) {
                var localVal = null;
                try { localVal = JSON.parse(localStorage.getItem(row.key)); } catch(e) {}
                
                var mergedVal = null;
                if (localVal) {
                    if (row.key === "ht_d") {
                        mergedVal = mergeTemplate(localVal, row.value);
                    } else if (row.key.indexOf("ht_") === 0 && row.key !== "ht_migrated_v3") {
                        mergedVal = mergeData(localVal, row.value);
                    } else {
                        mergedVal = row.value;
                    }
                    if (JSON.stringify(mergedVal) !== JSON.stringify(row.value)) {
                        return sbClient.from('user_data').upsert({
                            user_id: currentUser.id,
                            key: row.key,
                            value: mergedVal,
                            updated_at: new Date().toISOString()
                        }).then(function() {
                            try { localStorage.setItem(row.key, JSON.stringify(mergedVal)); } catch(e) {}
                        });
                    }
                } else {
                    mergedVal = row.value;
                }
                try { localStorage.setItem(row.key, JSON.stringify(mergedVal)); } catch(e) {}
                return Promise.resolve();
            });
            
            return Promise.all(promises).then(function() {
                if (typeof gDay === "function" && typeof dk === "function" && typeof cDate !== "undefined") {
                    cData = gDay(dk(cDate));
                }
                if (typeof toast === "function") toast("Cloud data synced!");
                if (typeof render === "function") render();
            });
        }
        if (typeof render === "function") render();
    });
}

function clearLocalHabitData() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("ht_") === 0) {
            keys.push(k);
        }
    }
    keys.forEach(function(k) { localStorage.removeItem(k); });
}

function syncUpAll() {
    if (!sbClient || !currentUser) return Promise.resolve();
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("ht_") === 0) {
            keys.push(k);
        }
    }
    return sbClient.from('user_data').select('key, value').then(function(res) {
        var remoteData = {};
        if (res.data) {
            res.data.forEach(function(row) { remoteData[row.key] = row.value; });
        }
        
        var promises = keys.map(function(k) {
            var localVal = null;
            try { localVal = JSON.parse(localStorage.getItem(k)); } catch(e) {}
            if (localVal === null) return Promise.resolve();
            
            var remoteVal = remoteData[k];
            var mergedVal = localVal;
            if (remoteVal) {
                if (k === "ht_d") {
                    mergedVal = mergeTemplate(localVal, remoteVal);
                } else if (k.indexOf("ht_") === 0 && k !== "ht_migrated_v3") {
                    mergedVal = mergeData(localVal, remoteVal);
                }
            }
            try { localStorage.setItem(k, JSON.stringify(mergedVal)); } catch(e) {}
            return sbClient.from('user_data').upsert({
                user_id: currentUser.id,
                key: k,
                value: mergedVal,
                updated_at: new Date().toISOString()
            });
        });
        return Promise.all(promises);
    });
}

if (sbClient) {
    sbClient.auth.onAuthStateChange(function(event, session) {
        if (session) {
            var oldUser = currentUser;
            currentUser = session.user;
            subscribeRealtime();
            if (oldUser && oldUser.id !== currentUser.id) {
                clearLocalHabitData();
                syncDown();
            } else if (!oldUser) {
                // Upload local anonymous data to new account first, then sync down
                syncUpAll().then(function() {
                    syncDown();
                });
            } else {
                syncDown();
            }
        } else {
            currentUser = null;
            if (realtimeChannel) {
                sbClient.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
            clearLocalHabitData();
            localStorage.removeItem("ht_migrated_v3");
            if (typeof gDay === "function" && typeof dk === "function" && typeof cDate !== "undefined") {
                cData = gDay(dk(cDate));
            }
            if (typeof render === "function") render();
        }
    });
}

function showAuthModal(mode) {
    if (!sbClient) {
        if (typeof toast === "function") toast("Cloud Sync is not configured.");
        return;
    }
    var overlay = document.getElementById("auth-overlay");
    overlay.innerHTML = 
        '<div class="auth-card">' +
            '<div class="flex justify-between items-center mb-6">' +
                '<h2 class="auth-title mb-0">Cloud Sync</h2>' +
                '<button class="text-gray-400 hover:text-white" data-a="close-auth"><i class="fas fa-xmark text-lg"></i></button>' +
            '</div>' +
            '<div class="auth-tabs">' +
                '<div class="auth-tab ' + (mode === "login" ? "active" : "") + '" data-a="auth-tab" data-mode="login">Log In</div>' +
                '<div class="auth-tab ' + (mode === "signup" ? "active" : "") + '" data-a="auth-tab" data-mode="signup">Sign Up</div>' +
            '</div>' +
            '<div id="auth-form">' +
                rAuthForm(mode) +
            '</div>' +
        '</div>';
    overlay.classList.add("active");
}

function closeAuthModal() {
    document.getElementById("auth-overlay").classList.remove("active");
}

function toggleAuthTab(mode) {
    document.getElementById("auth-form").innerHTML = rAuthForm(mode);
    var tabs = document.querySelectorAll(".auth-tab");
    if (mode === "login") {
        tabs[0].classList.add("active");
        tabs[1].classList.remove("active");
    } else {
        tabs[0].classList.remove("active");
        tabs[1].classList.add("active");
    }
}

function rAuthForm(mode) {
    var isLogin = mode === "login";
    return (
        '<div class="auth-input-group">' +
            '<label class="auth-label">Email Address</label>' +
            '<input type="email" id="auth-email" class="auth-input" placeholder="you@example.com" required>' +
        '</div>' +
        '<div class="auth-input-group">' +
            '<label class="auth-label">Password</label>' +
            '<input type="password" id="auth-password" class="auth-input" placeholder="••••••••" required>' +
        '</div>' +
        '<button class="auth-btn" data-a="auth-submit" data-mode="' + mode + '">' + (isLogin ? "Log In" : "Create Account") + '</button>' +
        '<div id="auth-error" class="auth-error"></div>' +
        '<div id="auth-success" class="auth-success"></div>' +
        '<div class="flex items-center my-4">' +
            '<div class="flex-grow border-t" style="border-color:var(--bd)"></div>' +
            '<span class="mx-3 text-[10px] uppercase tracking-widest" style="color:var(--mt)">or</span>' +
            '<div class="flex-grow border-t" style="border-color:var(--bd)"></div>' +
        '</div>' +
        '<button class="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-2.5 px-4 rounded-lg hover:bg-gray-200 transition" data-a="auth-google" style="font-family:\'Space Grotesk\',sans-serif">' +
            '<i class="fab fa-google"></i> Continue with Google' +
        '</button>'
    );
}

function submitAuth(mode) {
    var email = document.getElementById("auth-email").value;
    var password = document.getElementById("auth-password").value;
    var errDiv = document.getElementById("auth-error");
    var succDiv = document.getElementById("auth-success");
    
    errDiv.textContent = "";
    succDiv.textContent = "";
    
    if (!email || !password) {
        errDiv.textContent = "Please fill in all fields.";
        return;
    }
    
    var btn = document.querySelector(".auth-btn");
    btn.disabled = true;
    btn.textContent = mode === "login" ? "Logging in..." : "Signing up...";
    
    if (mode === "login") {
        sbClient.auth.signInWithPassword({ email: email, password: password }).then(function(res) {
            btn.disabled = false;
            btn.textContent = "Log In";
            if (res.error) {
                errDiv.textContent = res.error.message;
            } else {
                closeAuthModal();
                if (typeof toast === "function") toast("Logged in!");
            }
        });
    } else {
        sbClient.auth.signUp({ email: email, password: password }).then(function(res) {
            btn.disabled = false;
            btn.textContent = "Create Account";
            if (res.error) {
                errDiv.textContent = res.error.message;
            } else {
                if (res.data.session) {
                    closeAuthModal();
                    if (typeof toast === "function") toast("Account created!");
                } else {
                    succDiv.textContent = "Check your email for validation!";
                }
            }
        });
    }
}

function handleSignOut() {
    if (!sbClient) return;
    sbClient.auth.signOut().then(function() {
        if (typeof toast === "function") toast("Signed out. Local data reset.");
    });
}
