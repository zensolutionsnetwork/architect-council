// Owner set-password page (hub-served, 2026-06-26). Reads the one-time ?token, POSTs the new
// password to /api/auth/set-password (same-origin), and reports the result. No token is displayed
// or stored; the returned session token is intentionally ignored here (the app logs in separately).
(function () {
  var q = new URLSearchParams(location.search);
  var token = q.get('token') || '';
  var pw = document.getElementById('pw');
  var pw2 = document.getElementById('pw2');
  var btn = document.getElementById('go');
  var msg = document.getElementById('msg');
  function show(kind, text) { msg.className = 'msg ' + kind; msg.textContent = text; msg.style.display = 'block'; }
  if (!token) show('err', 'This link is missing its token. Request a new set-password email and use the full link.');
  btn.addEventListener('click', async function () {
    var a = pw.value, b = pw2.value;
    if (a.length < 12) return show('err', 'Password must be at least 12 characters.');
    if (a !== b) return show('err', 'The two passwords do not match.');
    if (!token) return;
    btn.disabled = true; show('ok', 'Setting your password…');
    try {
      var r = await fetch('/api/auth/set-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, newPassword: a })
      });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.ok) {
        show('ok', 'Password set. You can close this tab and sign in from the app.');
        btn.textContent = 'Done';
      } else {
        var m = (j && j.error === 'weak_password') ? 'Password too weak (minimum 12 characters).'
          : (j && j.error === 'invalid_or_expired_token') ? 'This link is invalid or expired. Request a new set-password email.'
          : (j && j.error === 'token_required') ? 'Missing token — use the full link from the email.'
          : 'Could not set the password (' + ((j && j.error) || r.status) + ').';
        show('err', m); btn.disabled = false;
      }
    } catch (e) { show('err', 'Network error — please try again.'); btn.disabled = false; }
  });
})();
