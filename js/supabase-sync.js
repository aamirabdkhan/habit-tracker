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
            res.data.forEach(function(row) {
                try {
                    localStorage.setItem(row.key, JSON.stringify(row.value));
                } catch(e) {}
            });
            if (typeof gDay === "function" && typeof dk === "function" && typeof cDate !== "undefined") {
                cData = gDay(dk(cDate));
            }
            if (typeof toast === "function") toast("Cloud data synced!");
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
    if (keys.length === 0) return Promise.resolve();
    var promises = keys.map(function(k) {
        var val = null;
        try { val = JSON.parse(localStorage.getItem(k)); } catch(e) {}
        if (val === null) return Promise.resolve();
        return sbClient.from('user_data').upsert({
            user_id: currentUser.id,
            key: k,
            value: val,
            updated_at: new Date().toISOString()
        });
    });
    return Promise.all(promises).catch(function(err) {
        console.error("Error syncing up local data:", err);
    });
}

if (sbClient) {
    sbClient.auth.onAuthStateChange(function(event, session) {
        if (session) {
            var oldUser = currentUser;
            currentUser = session.user;
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
